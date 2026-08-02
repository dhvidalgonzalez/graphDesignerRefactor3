import { createHash } from "node:crypto";
import type {
  AppSyncIdentityCognito,
  AppSyncResolverHandler,
} from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/analysis-orchestrator";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const s3 = new S3Client({});
const lambda = new LambdaClient({});
const ssm = new SSMClient({});

const BUCKET = env.GRAPH_DESIGNER_DOCUMENTS_BUCKET_NAME;
const STORAGE_PREFIX = String(
  env.ANALYSIS_STORAGE_PREFIX || "power-flow",
).replace(/^\/+|\/+$/g, "");
const WORKER_PARAMETER =
  env.ANALYSIS_WORKER_ARN_PARAMETER || env.POWER_FLOW_WORKER_ARN_PARAMETER;
const TICKET_EXPIRATION_SECONDS = 300;
const ANALYSIS_DEFINITIONS = {
  POWER_FLOW: { label: "Flujo de carga AC", units: 1 },
  DC_POWER_FLOW: { label: "Flujo de carga DC", units: 1 },
  CONTINGENCY_N_1: { label: "Contingencia N-1", units: 3 },
  OPERATING_CASE_SWEEP: { label: "Barrido de casos de operación", units: 2 },
  LOADABILITY: { label: "Margen de cargabilidad", units: 3 },
} as const;
const SUPPORTED_ANALYSIS_TYPES = new Set(Object.keys(ANALYSIS_DEFINITIONS));
const SUPPORTED_EXECUTION_PREFERENCES = new Set(["AUTO", "STANDARD"]);
const TERMINAL_STATUSES = new Set([
  "CONVERGED",
  "NOT_CONVERGED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
]);

let cachedWorkerArn: string | null = null;

type Identity = ReturnType<typeof getIdentity>;
type RuntimeEvent = {
  fieldName?: string;
  typeName?: string;
};

type StartAnalysisArguments = {
  diagramId: string;
  operatingCaseId: string;
  analysisType?: string | null;
  analysisOptionsJson?: string | null;
  executionPreference?: string | null;
  expectedDiagramVersion: number;
  expectedDiagramVersionsJson?: string | null;
  clientRequestId: string;
  name?: string | null;
};

type ArtifactArguments = {
  studyId: string;
  artifactType: string;
};

type LayoutArguments = {
  studyId: string;
  layoutJson: string;
};

type AnalysisRequestResult = {
  studyId: string;
  status: string;
  message?: string;
  inputStorageKey?: string;
  resultStorageKey?: string;
  diagnosticsStorageKey?: string;
  numericalStorageKey?: string;
};

type AnalysisArtifactTicket = {
  studyId: string;
  artifactType: string;
  status: string;
  url: string;
  key: string;
  method: string;
  expiresAt: string;
  contentType: string;
};

type ParameterValue = {
  value?: unknown;
  source?: string;
  status?: string;
};

type ElectricalComponent = {
  id: string;
  kind: string;
  name?: string;
  inService?: boolean;
  terminalIds?: string[];
  parameters?: Record<string, ParameterValue>;
  operatingState?: Record<string, unknown>;
  sourceEntity?: Record<string, unknown>;
};

type ElectricalTerminal = {
  id: string;
  componentId: string;
  role?: string;
  connectionNodeId?: string | null;
  sourceEndpoint?: Record<string, unknown>;
};

type ConnectionNode = {
  id: string;
  nominalVoltageKv?: number | null;
  voltageLevelId?: string | null;
  voltageLevelIds?: string[];
  voltageConflict?: boolean;
  busComponentId?: string | null;
  busComponentIds?: string[];
  memberEndpointIds?: string[];
  sourceDiagramId?: string;
  sourceDiagramIds?: string[];
};

type OperatingCase = {
  id: string;
  name?: string;
  description?: string;
  isDefault?: boolean;
  overrides?: Record<string, Record<string, unknown>>;
};

type LogicalConnectionReference = {
  diagramId?: string;
  entityKind?: string;
  entityId?: string;
  componentId?: string;
  terminalKey?: string;
  portId?: string;
};

type DiagramEntity = {
  id: string;
  kind?: string;
  properties?: Record<string, unknown>;
  logicalConnections?: Record<string, LogicalConnectionReference>;
};

type DiagramDocument = {
  schemaVersion?: number;
  id?: string;
  name?: string;
  nodes?: Record<string, DiagramEntity>;
  edges?: Record<string, DiagramEntity>;
  electricalModel?: {
    schemaVersion?: number;
    components?: ElectricalComponent[];
    terminals?: ElectricalTerminal[];
    connectionNodes?: ConnectionNode[];
  };
  operatingCases?: OperatingCase[];
  analysisConfiguration?: {
    defaultAnalysisType?: string;
    defaultExecutionPreference?: string;
    solverOptions?: Record<string, unknown>;
    validationOptions?: Record<string, unknown>;
  };
};

const GLOBAL_SEPARATOR = "::";

class ProjectUnionFind {
  private parent = new Map<string, string>();

  constructor(keys: string[]) {
    keys.forEach((key) => this.parent.set(key, key));
  }

  add(key: string) {
    if (key && !this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string | null {
    const parent = this.parent.get(key);
    if (!parent) return null;
    if (parent === key) return key;
    const root = this.find(parent);
    if (root) this.parent.set(key, root);
    return root;
  }

  union(left: string, right: string) {
    this.add(left);
    this.add(right);
    const rootLeft = this.find(left);
    const rootRight = this.find(right);
    if (!rootLeft || !rootRight || rootLeft === rootRight) return;
    const [first, second] = [rootLeft, rootRight].sort();
    this.parent.set(second, first);
  }
}

function projectHashToken(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function globalProjectId(diagramId: string, localId: string) {
  return `${diagramId}${GLOBAL_SEPARATOR}${localId}`;
}

function logicalTerminalKey(
  diagramId: string,
  entityKind: string,
  entityId: string,
  terminalKey: string,
) {
  return [diagramId, entityKind, entityId, terminalKey].join("|");
}

function normalizeLogicalReference(
  candidate: LogicalConnectionReference | null | undefined,
) {
  if (!candidate || typeof candidate !== "object") return null;
  const diagramId = String(candidate.diagramId || "").trim();
  const entityId = String(
    candidate.entityId || candidate.componentId || "",
  ).trim();
  const entityKind = String(candidate.entityKind || "node").toLowerCase();
  const terminalKey = String(
    candidate.terminalKey || candidate.portId || "",
  ).trim();
  if (
    !diagramId ||
    !entityId ||
    !terminalKey ||
    !new Set(["node", "edge"]).has(entityKind)
  ) {
    return null;
  }
  return { diagramId, entityKind, entityId, terminalKey };
}

function parseExpectedDiagramVersions(value?: string | null) {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("INVALID_EXPECTED_DIAGRAM_VERSIONS_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_EXPECTED_DIAGRAM_VERSIONS_JSON");
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(
      ([diagramId, version]) => {
        const normalized = Number(version);
        if (!Number.isInteger(normalized) || normalized <= 0) {
          throw new Error(`INVALID_EXPECTED_DIAGRAM_VERSION:${diagramId}`);
        }
        return [diagramId, normalized];
      },
    ),
  );
}

async function listProjectDiagrams(projectId: string) {
  const diagrams: Array<Schema["Diagram"]["type"]> = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Diagram.listDiagramsByProject(
      { projectId },
      { limit: 100, nextToken },
    );
    if (page.errors?.length) throw new Error("DIAGRAM_LIST_FAILED");
    diagrams.push(...page.data.filter((item) => item.status !== "ARCHIVED"));
    nextToken = page.nextToken;
  } while (nextToken);
  return diagrams.sort(
    (left, right) => (left.position ?? 0) - (right.position ?? 0),
  );
}

async function loadDiagramDocument(
  projectId: string,
  diagram: Schema["Diagram"]["type"],
) {
  const expectedKey = `projects/${projectId}/diagrams/${diagram.id}/document.json`;
  if (diagram.storageKey !== expectedKey) {
    throw new Error(`DIAGRAM_STORAGE_KEY_MISMATCH:${diagram.id}`);
  }
  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: expectedKey }),
    );
    return JSON.parse(await bodyToString(object.Body)) as DiagramDocument;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `DIAGRAM_DOCUMENT_LOAD_FAILED:${diagram.id}:${diagram.name}:${message}`,
    );
  }
}

function namespaceOperatingCases(
  operatingCases: OperatingCase[] | undefined,
  diagramId: string,
) {
  return normalizeCases(operatingCases).map((operatingCase) => ({
    ...structuredClone(operatingCase),
    overrides: Object.fromEntries(
      Object.entries(operatingCase.overrides ?? {}).map(
        ([componentId, patch]) => [
          componentId.includes(GLOBAL_SEPARATOR)
            ? componentId
            : globalProjectId(diagramId, componentId),
          patch,
        ],
      ),
    ),
  }));
}

function composeProjectDocument(
  sources: Array<{
    diagram: Schema["Diagram"]["type"];
    document: DiagramDocument;
  }>,
  activeDiagramId: string,
  projectName: string,
) {
  const active =
    sources.find((item) => item.diagram.id === activeDiagramId) ?? sources[0];
  if (!active) throw new Error("PROJECT_HAS_NO_DIAGRAMS");

  const components: ElectricalComponent[] = [];
  const terminals: ElectricalTerminal[] = [];
  const connectionNodes: ConnectionNode[] = [];
  const terminalLookup = new Map<string, string>();

  sources.forEach(({ diagram, document }) => {
    const model = document.electricalModel;
    const modelComponents = model?.components;
    const modelTerminals = model?.terminals;
    const modelConnectionNodes = model?.connectionNodes;

    if (
      !Array.isArray(modelComponents) ||
      !Array.isArray(modelTerminals) ||
      !Array.isArray(modelConnectionNodes)
    ) {
      throw new Error(`ELECTRICAL_MODEL_MISSING:${diagram.id}`);
    }

    const componentIdMap = new Map(
      modelComponents.map((component) => [
        component.id,
        globalProjectId(diagram.id, component.id),
      ]),
    );
    const connectionNodeIdMap = new Map(
      modelConnectionNodes.map((node) => [
        node.id,
        globalProjectId(diagram.id, node.id),
      ]),
    );

    modelComponents.forEach((component) => {
      components.push({
        ...structuredClone(component),
        id: componentIdMap.get(component.id) as string,
        terminalIds: (component.terminalIds ?? []).map((terminalId) =>
          globalProjectId(diagram.id, terminalId),
        ),
        sourceEntity: {
          ...(component.sourceEntity ?? {}),
          diagramId: diagram.id,
          diagramName: diagram.name,
          localId: component.id,
        },
      });
    });

    modelTerminals.forEach((terminal) => {
      terminals.push({
        ...structuredClone(terminal),
        id: globalProjectId(diagram.id, terminal.id),
        componentId:
          componentIdMap.get(terminal.componentId) ??
          globalProjectId(diagram.id, terminal.componentId),
        connectionNodeId: terminal.connectionNodeId
          ? (connectionNodeIdMap.get(terminal.connectionNodeId) ??
            globalProjectId(diagram.id, terminal.connectionNodeId))
          : null,
        sourceEndpoint: terminal.sourceEndpoint
          ? { ...terminal.sourceEndpoint, diagramId: diagram.id }
          : terminal.sourceEndpoint,
      });
    });

    modelConnectionNodes.forEach((node) => {
      connectionNodes.push({
        ...structuredClone(node),
        id: connectionNodeIdMap.get(node.id) as string,
        voltageLevelId: node.voltageLevelId
          ? globalProjectId(diagram.id, node.voltageLevelId)
          : null,
        voltageLevelIds: (node.voltageLevelIds ?? []).map((id) =>
          globalProjectId(diagram.id, id),
        ),
        busComponentId: node.busComponentId
          ? (componentIdMap.get(node.busComponentId) ??
            globalProjectId(diagram.id, node.busComponentId))
          : null,
        busComponentIds: (node.busComponentIds ?? []).map(
          (id) => componentIdMap.get(id) ?? globalProjectId(diagram.id, id),
        ),
        memberEndpointIds: (node.memberEndpointIds ?? []).map((id) =>
          globalProjectId(diagram.id, id),
        ),
        sourceDiagramId: diagram.id,
        sourceDiagramIds: [diagram.id],
      });
    });

    Object.values(document.nodes ?? {}).forEach((entity) => {
      Object.keys(entity.logicalConnections ?? {}).forEach((terminalKey) => {
        const localTerminalId = `${entity.id}:terminal:${terminalKey}`;
        if (
          modelTerminals.some((terminal) => terminal.id === localTerminalId)
        ) {
          terminalLookup.set(
            logicalTerminalKey(diagram.id, "node", entity.id, terminalKey),
            globalProjectId(diagram.id, localTerminalId),
          );
        }
      });
      modelTerminals
        .filter((terminal) => terminal.componentId === entity.id)
        .forEach((terminal) => {
          const portId = String(terminal.sourceEndpoint?.portId ?? "");
          if (portId) {
            terminalLookup.set(
              logicalTerminalKey(diagram.id, "node", entity.id, portId),
              globalProjectId(diagram.id, terminal.id),
            );
          }
        });
    });

    Object.values(document.edges ?? {})
      .filter((entity) => entity.kind === "line")
      .forEach((entity) => {
        ["from", "to"].forEach((terminalKey) => {
          const localTerminalId = `${entity.id}:terminal:${terminalKey}`;
          if (
            modelTerminals.some((terminal) => terminal.id === localTerminalId)
          ) {
            terminalLookup.set(
              logicalTerminalKey(diagram.id, "edge", entity.id, terminalKey),
              globalProjectId(diagram.id, localTerminalId),
            );
          }
        });
      });
  });

  const terminalById = new Map(
    terminals.map((terminal) => [terminal.id, terminal]),
  );
  const unionFind = new ProjectUnionFind(
    connectionNodes.map((node) => node.id),
  );

  sources.forEach(({ diagram, document }) => {
    const entities = [
      ...Object.values(document.nodes ?? {}).map((entity) => ({
        entity,
        entityKind: "node",
      })),
      ...Object.values(document.edges ?? {})
        .filter((entity) => entity.kind === "line")
        .map((entity) => ({ entity, entityKind: "edge" })),
    ];

    entities.forEach(({ entity, entityKind }) => {
      Object.entries(entity.logicalConnections ?? {}).forEach(
        ([terminalKey, rawReference]) => {
          const reference = normalizeLogicalReference(rawReference);
          if (!reference) {
            throw new Error(
              `INVALID_LOGICAL_CONNECTION:${diagram.id}:${entity.id}:${terminalKey}`,
            );
          }
          const sourceTerminalId = terminalLookup.get(
            logicalTerminalKey(diagram.id, entityKind, entity.id, terminalKey),
          );
          const targetTerminalId = terminalLookup.get(
            logicalTerminalKey(
              reference.diagramId,
              reference.entityKind,
              reference.entityId,
              reference.terminalKey,
            ),
          );
          if (!sourceTerminalId || !targetTerminalId) {
            throw new Error(
              `LOGICAL_CONNECTION_TARGET_MISSING:${diagram.id}:${entity.id}:${terminalKey}`,
            );
          }
          const sourceNodeId =
            terminalById.get(sourceTerminalId)?.connectionNodeId;
          const targetNodeId =
            terminalById.get(targetTerminalId)?.connectionNodeId;
          if (!sourceNodeId || !targetNodeId) {
            throw new Error(
              `LOGICAL_CONNECTION_NODE_MISSING:${diagram.id}:${entity.id}:${terminalKey}`,
            );
          }
          unionFind.union(sourceNodeId, targetNodeId);
        },
      );
    });
  });

  const grouped = new Map<string, ConnectionNode[]>();
  connectionNodes.forEach((node) => {
    const root = unionFind.find(node.id) ?? node.id;
    grouped.set(root, [...(grouped.get(root) ?? []), node]);
  });

  const canonicalByOriginal = new Map<string, string>();
  const mergedConnectionNodes = [...grouped.values()].map((nodes) => {
    const originalIds = nodes.map((node) => node.id).sort();
    const busComponentIds = [
      ...new Set(
        nodes.flatMap((node) => [
          ...(node.busComponentIds ?? []),
          ...(node.busComponentId ? [node.busComponentId] : []),
        ]),
      ),
    ].sort();
    const id =
      busComponentIds.length === 1
        ? `cn-${busComponentIds[0]}`
        : `cn-project-${projectHashToken(originalIds.join("|"))}`;
    originalIds.forEach((originalId) =>
      canonicalByOriginal.set(originalId, id),
    );

    const nominalVoltages = [
      ...new Set(
        nodes
          .map((node) => Number(node.nominalVoltageKv))
          .filter((value) => Number.isFinite(value) && value > 0)
          .map((value) => Number(value.toFixed(9))),
      ),
    ];
    const voltageLevelIds = [
      ...new Set(
        nodes.flatMap((node) => node.voltageLevelIds ?? []).filter(Boolean),
      ),
    ].sort();

    return {
      id,
      nominalVoltageKv: nominalVoltages[0] ?? null,
      voltageLevelId: voltageLevelIds[0] ?? null,
      voltageLevelIds,
      voltageConflict:
        nominalVoltages.length > 1 ||
        nodes.some((node) => node.voltageConflict),
      ...(busComponentIds[0] ? { busComponentId: busComponentIds[0] } : {}),
      busComponentIds,
      memberEndpointIds: [
        ...new Set(nodes.flatMap((node) => node.memberEndpointIds ?? [])),
      ].sort(),
      sourceDiagramIds: [
        ...new Set(
          nodes
            .flatMap((node) => node.sourceDiagramIds ?? [node.sourceDiagramId])
            .filter(Boolean) as string[],
        ),
      ].sort(),
    };
  });

  return {
    ...structuredClone(active.document),
    id: active.diagram.id,
    name: projectName,
    analysisScope: "PROJECT",
    projectId: active.diagram.projectId,
    multiDiagram: true,
    sourceDiagramId: active.diagram.id,
    sourceDiagramIds: sources.map((item) => item.diagram.id),
    electricalModel: {
      schemaVersion: 2,
      components,
      terminals: terminals.map((terminal) => ({
        ...terminal,
        connectionNodeId: terminal.connectionNodeId
          ? (canonicalByOriginal.get(terminal.connectionNodeId) ??
            terminal.connectionNodeId)
          : null,
      })),
      connectionNodes: mergedConnectionNodes,
    },
    operatingCases: namespaceOperatingCases(
      active.document.operatingCases,
      active.diagram.id,
    ),
  } as DiagramDocument & Record<string, unknown>;
}

function getIdentity(eventIdentity: unknown) {
  const identity = eventIdentity as AppSyncIdentityCognito | null;
  const claims = (identity?.claims ?? {}) as Record<string, unknown>;
  const sub = String(identity?.sub ?? claims.sub ?? "");
  const username = String(
    identity?.username ?? claims.username ?? claims["cognito:username"] ?? "",
  );
  return {
    sub,
    username,
    email: String(claims.email ?? "").toLowerCase(),
    identityKey: sub && username ? `${sub}::${username}` : "",
  };
}

function includesIdentity(
  values: readonly (string | null)[] | null | undefined,
  identity: Identity,
) {
  const candidates = new Set(
    [
      identity.sub,
      identity.username,
      identity.email,
      identity.identityKey,
    ].filter(Boolean),
  );
  return (values ?? []).some(
    (value) => Boolean(value) && candidates.has(String(value)),
  );
}

function resolveProjectRole(
  project: Schema["Project"]["type"],
  identity: Identity,
) {
  if (
    includesIdentity(project.ownerIdentities, identity) ||
    project.ownerProfileId === identity.sub
  ) {
    return "OWNER";
  }
  if (includesIdentity(project.editorIdentities, identity)) return "EDITOR";
  if (includesIdentity(project.viewerIdentities, identity)) return "VIEWER";
  return null;
}

function compactIdentityList(
  values: readonly (string | null)[] | null | undefined,
  additions: readonly string[] = [],
) {
  return [
    ...new Set(
      [...(values ?? []), ...additions]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

function identityValues(identity: Identity) {
  return [
    identity.sub,
    identity.username,
    identity.email,
    identity.identityKey,
  ].filter(Boolean);
}

function canReadStudy(
  study: Schema["AnalysisStudy"]["type"],
  identity: Identity,
) {
  return (
    includesIdentity(study.ownerIdentities, identity) ||
    includesIdentity(study.editorIdentities, identity) ||
    includesIdentity(study.viewerIdentities, identity) ||
    study.requestedByProfileId === identity.sub
  );
}

function canEditStudyLayout(
  study: Schema["AnalysisStudy"]["type"],
  identity: Identity,
) {
  return (
    includesIdentity(study.ownerIdentities, identity) ||
    includesIdentity(study.editorIdentities, identity) ||
    study.requestedByProfileId === identity.sub
  );
}

function safeSegment(value: string, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return normalized;
}

async function bodyToString(body: unknown) {
  if (!body) throw new Error("EMPTY_STORAGE_OBJECT");
  const candidate = body as {
    transformToString?: (encoding?: string) => Promise<string>;
  };
  if (typeof candidate.transformToString === "function") {
    return candidate.transformToString("utf-8");
  }
  throw new Error("UNSUPPORTED_STORAGE_BODY");
}

function parameterValue(component: ElectricalComponent, key: string) {
  return component.parameters?.[key]?.value;
}

function isComponentInService(component: ElectricalComponent) {
  if (component.operatingState?.inService !== undefined) {
    return Boolean(component.operatingState.inService);
  }
  if (component.inService !== undefined) return Boolean(component.inService);
  return !Boolean(parameterValue(component, "outOfService"));
}

function isSlackComponent(component: ElectricalComponent) {
  if (!isComponentInService(component)) return false;
  if (component.kind === "EXTERNAL_GRID") return true;
  if (component.kind !== "GENERATOR") return false;
  const controlMode = String(parameterValue(component, "controlMode") || "").toUpperCase();
  const sourceType = String(parameterValue(component, "sourceType") || "").toUpperCase();
  return controlMode === "SLACK" || sourceType === "EXTERNAL_GRID";
}

function isSwitchClosed(component: ElectricalComponent) {
  if (!isComponentInService(component)) return false;
  if (component.operatingState?.switchClosed !== undefined) {
    return Boolean(component.operatingState.switchClosed);
  }
  return String(parameterValue(component, "state") || "CLOSED").toUpperCase() !== "OPEN";
}

function isConductingComponent(component: ElectricalComponent) {
  if (!isComponentInService(component)) return false;
  if (new Set(["LINE", "TRANSFORMER_2W", "TRANSFORMER_3W"]).has(component.kind)) {
    return true;
  }
  return component.kind === "SWITCH" && isSwitchClosed(component);
}

type ValidationIssue = {
  code: string;
  message: string;
  componentId?: string;
  islandId?: string;
  componentIds?: string[];
  connectionNodeIds?: string[];
};

type ElectricalModelScope = {
  electricalModel: {
    schemaVersion: number;
    components: ElectricalComponent[];
    terminals: ElectricalTerminal[];
    connectionNodes: ConnectionNode[];
  };
  warnings: ValidationIssue[];
  networkScope: {
    slackComponentIds: string[];
    includedComponentIds: string[];
    excludedComponentIds: string[];
    excludedConnectionNodeIds: string[];
  };
};

function scopeElectricalModelToSlack(
  components: ElectricalComponent[],
  terminals: ElectricalTerminal[],
  connectionNodes: ConnectionNode[],
  schemaVersion = 1,
): ElectricalModelScope {
  const nodeIds = new Set(connectionNodes.map((node) => node.id));
  const terminalsByComponent = terminals.reduce((groups, terminal) => {
    groups.set(terminal.componentId, [
      ...(groups.get(terminal.componentId) ?? []),
      terminal,
    ]);
    return groups;
  }, new Map<string, ElectricalTerminal[]>());
  const componentNodeIds = (component: ElectricalComponent) => [
    ...new Set(
      (terminalsByComponent.get(component.id) ?? [])
        .map((terminal) => terminal.connectionNodeId)
        .filter((value): value is string => Boolean(value) && nodeIds.has(String(value))),
    ),
  ];
  const adjacency = new Map(
    connectionNodes.map((node) => [node.id, new Set<string>()]),
  );

  components.filter(isConductingComponent).forEach((component) => {
    const ids = componentNodeIds(component);
    ids.forEach((from) => ids.forEach((to) => {
      if (from !== to) adjacency.get(from)?.add(to);
    }));
  });

  const slackComponents = components.filter(isSlackComponent);
  const slackNodeIds = new Set(
    slackComponents.flatMap((component) => componentNodeIds(component)),
  );
  const reachableNodeIds = new Set<string>();
  const pending = [...slackNodeIds];
  while (pending.length) {
    const current = pending.pop();
    if (!current || reachableNodeIds.has(current)) continue;
    reachableNodeIds.add(current);
    adjacency.get(current)?.forEach((next) => pending.push(next));
  }

  const includedComponentIds = new Set(
    components
      .filter((component) => {
        if (!isComponentInService(component)) return false;
        const ids = componentNodeIds(component);
        if (!ids.length) return false;
        if (
          new Set(["LINE", "TRANSFORMER_2W", "TRANSFORMER_3W", "SWITCH"]).has(
            component.kind,
          )
        ) {
          return ids.every((id) => reachableNodeIds.has(id));
        }
        return ids.some((id) => reachableNodeIds.has(id));
      })
      .map((component) => component.id),
  );
  const excludedComponentIds = components
    .filter((component) => !includedComponentIds.has(component.id))
    .map((component) => component.id)
    .sort();
  const excludedConnectionNodeIds = connectionNodes
    .filter((node) => !reachableNodeIds.has(node.id))
    .map((node) => node.id)
    .sort();

  const islandByNode = new Map<string, string>();
  const islandSummaries = new Map<
    string,
    {
      componentIds: Set<string>;
      slackIds: Set<string>;
      connectionNodeIds: Set<string>;
    }
  >();
  connectionNodes.forEach((node) => {
    if (islandByNode.has(node.id)) return;
    const islandId = `island-${islandSummaries.size + 1}`;
    const islandPending = [node.id];
    const summary = {
      componentIds: new Set<string>(),
      slackIds: new Set<string>(),
      connectionNodeIds: new Set<string>(),
    };
    while (islandPending.length) {
      const current = islandPending.pop();
      if (!current || islandByNode.has(current)) continue;
      islandByNode.set(current, islandId);
      summary.connectionNodeIds.add(current);
      adjacency.get(current)?.forEach((next) => islandPending.push(next));
    }
    islandSummaries.set(islandId, summary);
  });
  components.filter(isComponentInService).forEach((component) => {
    componentNodeIds(component).forEach((nodeId) => {
      const islandId = islandByNode.get(nodeId);
      const summary = islandId ? islandSummaries.get(islandId) : null;
      if (!summary) return;
      summary.componentIds.add(component.id);
      if (isSlackComponent(component)) summary.slackIds.add(component.id);
    });
  });
  const warnings = [...islandSummaries.entries()]
    .filter(([, summary]) => summary.componentIds.size && !summary.slackIds.size)
    .map(([islandId, summary]): ValidationIssue => ({
      ...createIssue(
        "ISLAND_EXCLUDED_FROM_ANALYSIS",
        `La ${islandId} no posee referencia Slack y será excluida del estudio (${summary.componentIds.size} componente(s)).`,
      ),
      islandId,
      componentIds: [...summary.componentIds].sort(),
      connectionNodeIds: [...summary.connectionNodeIds].sort(),
    }));

  const useScopedModel = slackNodeIds.size > 0;
  return {
    electricalModel: {
      schemaVersion,
      components: useScopedModel
        ? components.filter((component) => includedComponentIds.has(component.id))
        : components,
      terminals: useScopedModel
        ? terminals.filter((terminal) => (
            includedComponentIds.has(terminal.componentId)
            && Boolean(terminal.connectionNodeId)
            && reachableNodeIds.has(String(terminal.connectionNodeId))
          ))
        : terminals,
      connectionNodes: useScopedModel
        ? connectionNodes.filter((node) => reachableNodeIds.has(node.id))
        : connectionNodes,
    },
    warnings,
    networkScope: {
      slackComponentIds: slackComponents.map((component) => component.id).sort(),
      includedComponentIds: [...includedComponentIds].sort(),
      excludedComponentIds,
      excludedConnectionNodeIds,
    },
  };
}

function normalizeCases(candidate: OperatingCase[] | undefined) {
  const cases =
    Array.isArray(candidate) && candidate.length
      ? candidate
      : [
          {
            id: "case-normal",
            name: "Operación normal",
            isDefault: true,
            overrides: {},
          },
        ];
  const defaultIndex = Math.max(
    0,
    cases.findIndex((item) => item?.isDefault),
  );
  return cases.map((item, index) => ({
    id: safeSegment(
      String(item?.id || `case-${index + 1}`),
      "operating_case_id",
    ),
    name: String(item?.name || `Caso ${index + 1}`),
    description: String(item?.description || ""),
    isDefault: index === defaultIndex,
    overrides:
      item?.overrides && typeof item.overrides === "object"
        ? item.overrides
        : {},
  }));
}

function applyOperatingCase(
  component: ElectricalComponent,
  operatingCase: OperatingCase,
) {
  const override = operatingCase.overrides?.[component.id] ?? {};
  const baseInService =
    component.operatingState?.inService ??
    component.inService ??
    !Boolean(parameterValue(component, "outOfService"));
  return {
    ...component,
    operatingState: {
      inService:
        override.inService === undefined
          ? baseInService
          : Boolean(override.inService),
      ...(override.activePowerKw !== undefined
        ? { activePowerKw: Number(override.activePowerKw) }
        : {}),
      ...(override.reactivePowerKvar !== undefined
        ? { reactivePowerKvar: Number(override.reactivePowerKvar) }
        : {}),
      ...(override.voltageSetpointPu !== undefined
        ? { voltageSetpointPu: Number(override.voltageSetpointPu) }
        : {}),
      ...(override.tapPosition !== undefined
        ? { tapPosition: Number(override.tapPosition) }
        : {}),
      ...(override.switchClosed !== undefined
        ? { switchClosed: Boolean(override.switchClosed) }
        : {}),
    },
  };
}

function createIssue(
  code: string,
  message: string,
  componentId?: string,
): ValidationIssue {
  return {
    code,
    message,
    ...(componentId ? { componentId } : {}),
  };
}

function addValidationIssueContext(
  validation: ReturnType<typeof validateElectricalModel>,
  components: ElectricalComponent[],
) {
  const componentById = new Map(
    components.map((component) => [component.id, component]),
  );
  const decorate = (item: ReturnType<typeof createIssue>) => {
    if (!item.componentId) return item;
    const component = componentById.get(item.componentId);
    const source = component?.sourceEntity;
    if (!component || !source?.diagramId) return item;
    const diagramName = String(source.diagramName || source.diagramId);
    const componentName = String(component.name || source.localId || component.id);
    return {
      ...item,
      diagramId: String(source.diagramId),
      diagramName,
      componentName,
      message: `${item.message} [${diagramName} / ${componentName}]`,
    };
  };
  return {
    ...validation,
    errors: validation.errors.map(decorate),
    warnings: validation.warnings.map(decorate),
  };
}

function validateElectricalModel(
  components: ElectricalComponent[],
  terminals: ElectricalTerminal[],
  connectionNodes: ConnectionNode[],
) {
  const errors: Array<ReturnType<typeof createIssue>> = [];
  const warnings: Array<ReturnType<typeof createIssue>> = [];
  const componentIds = new Set(components.map((component) => component.id));
  const connectionNodeIds = new Set(connectionNodes.map((node) => node.id));
  const terminalsByComponent = new Map<string, ElectricalTerminal[]>();

  terminals.forEach((terminal) => {
    terminalsByComponent.set(terminal.componentId, [
      ...(terminalsByComponent.get(terminal.componentId) ?? []),
      terminal,
    ]);
    if (!componentIds.has(terminal.componentId)) {
      errors.push(
        createIssue(
          "MISSING_COMPONENT_REFERENCE",
          "Un terminal referencia un componente inexistente.",
          terminal.componentId,
        ),
      );
    }
    if (
      terminal.connectionNodeId &&
      !connectionNodeIds.has(terminal.connectionNodeId)
    ) {
      errors.push(
        createIssue(
          "MISSING_CONNECTION_NODE",
          "Un terminal referencia un nodo de conexión inexistente.",
          terminal.componentId,
        ),
      );
    }
  });

  const activeComponents = components.filter(isComponentInService);
  const supportedKinds = new Set([
    "BUS",
    "LOAD",
    "GENERATOR",
    "EXTERNAL_GRID",
    "LINE",
    "TRANSFORMER_2W",
    "SWITCH",
    "SHUNT",
  ]);

  activeComponents.forEach((component) => {
    if (!supportedKinds.has(component.kind)) {
      errors.push(
        createIssue(
          "COMPONENT_KIND_NOT_SUPPORTED",
          `El solver actual no admite componentes ${component.kind}.`,
          component.id,
        ),
      );
    }
    if (component.kind === "SHUNT") {
      const controlMode = String(
        parameterValue(component, "controlMode") || "Fijo",
      ).toUpperCase();
      if (!new Set(["FIJO", "FIXED"]).has(controlMode)) {
        errors.push(
          createIssue(
            "SHUNT_CONTROL_MODE_NOT_SUPPORTED",
            "El solver actual sólo admite bancos shunt con control fijo.",
            component.id,
          ),
        );
      }
    }
  });

  const slackComponents = activeComponents.filter(isSlackComponent);

  if (!slackComponents.length) {
    errors.push(
      createIssue(
        "NO_SLACK_REFERENCE",
        "No existe una red externa ni un generador configurado como Slack.",
      ),
    );
  }

  connectionNodes.forEach((node) => {
    if (node.voltageConflict) {
      errors.push(
        createIssue(
          "CONNECTION_VOLTAGE_CONFLICT",
          `El nodo eléctrico ${node.id} une niveles de tensión incompatibles.`,
          node.busComponentId || undefined,
        ),
      );
    }
  });

  const adjacency = new Map(
    connectionNodes.map((node) => [node.id, new Set<string>()]),
  );
  const electricallyLinks = (component: ElectricalComponent) => {
    if (!isComponentInService(component)) return false;
    if (
      new Set(["LINE", "TRANSFORMER_2W", "TRANSFORMER_3W"]).has(component.kind)
    ) {
      return true;
    }
    if (component.kind === "SWITCH") {
      return isSwitchClosed(component);
    }
    return false;
  };

  activeComponents.filter(electricallyLinks).forEach((component) => {
    const nodeIds = [
      ...new Set(
        (terminalsByComponent.get(component.id) ?? [])
          .map((terminal) => terminal.connectionNodeId)
          .filter(Boolean) as string[],
      ),
    ];
    nodeIds.forEach((from) =>
      nodeIds.forEach((to) => {
        if (from !== to) adjacency.get(from)?.add(to);
      }),
    );
  });

  const islandByNode = new Map<string, string>();
  let islandCounter = 0;
  connectionNodes.forEach((node) => {
    if (islandByNode.has(node.id)) return;
    islandCounter += 1;
    const islandId = `island-${islandCounter}`;
    const pending = [node.id];
    while (pending.length) {
      const current = pending.pop();
      if (!current || islandByNode.has(current)) continue;
      islandByNode.set(current, islandId);
      adjacency.get(current)?.forEach((next) => pending.push(next));
    }
  });

  const islandSummary = new Map<
    string,
    { energized: boolean; slackIds: Set<string> }
  >();
  activeComponents.forEach((component) => {
    const nodeIds = [
      ...new Set(
        (terminalsByComponent.get(component.id) ?? [])
          .map((terminal) => terminal.connectionNodeId)
          .filter(Boolean) as string[],
      ),
    ];
    nodeIds.forEach((nodeId) => {
      const islandId = islandByNode.get(nodeId);
      if (!islandId) return;
      const summary = islandSummary.get(islandId) ?? {
        energized: false,
        slackIds: new Set<string>(),
      };
      summary.energized ||= new Set([
        "LOAD",
        "GENERATOR",
        "EXTERNAL_GRID",
        "SHUNT",
      ]).has(component.kind);
      if (slackComponents.some((slack) => slack.id === component.id)) {
        summary.slackIds.add(component.id);
      }
      islandSummary.set(islandId, summary);
    });
  });

  islandSummary.forEach((summary, islandId) => {
    if (summary.energized && summary.slackIds.size === 0) {
      warnings.push(
        createIssue(
          "ISLAND_EXCLUDED_FROM_ANALYSIS",
          `La isla eléctrica ${islandId} no posee referencia Slack y será excluida del estudio.`,
        ),
      );
    }
    if (summary.slackIds.size > 1) {
      warnings.push(
        createIssue(
          "MULTIPLE_SLACK_REFERENCES",
          `La isla eléctrica ${islandId} contiene ${summary.slackIds.size} referencias Slack.`,
        ),
      );
    }
  });

  activeComponents.forEach((component) => {
    const componentTerminals = terminalsByComponent.get(component.id) ?? [];
    if (!componentTerminals.length) {
      errors.push(
        createIssue(
          "COMPONENT_WITHOUT_TERMINALS",
          "Un componente en servicio no contiene terminales eléctricos.",
          component.id,
        ),
      );
    }
    componentTerminals.forEach((terminal) => {
      if (!terminal.connectionNodeId) {
        errors.push(
          createIssue(
            "INCOMPLETE_TERMINAL",
            "Un terminal de un componente en servicio no está conectado.",
            component.id,
          ),
        );
      }
    });

    if (component.kind === "LINE" && componentTerminals.length === 2) {
      if (
        componentTerminals[0]?.connectionNodeId &&
        componentTerminals[0].connectionNodeId ===
          componentTerminals[1]?.connectionNodeId
      ) {
        errors.push(
          createIssue(
            "LINE_SAME_ENDPOINT",
            "La línea conecta el mismo nodo eléctrico en ambos extremos.",
            component.id,
          ),
        );
      }
    }

    Object.values(component.parameters ?? {}).forEach((parameter) => {
      if (parameter?.status === "ASSUMED" && parameter.value != null) {
        warnings.push(
          createIssue(
            "ASSUMED_PARAMETER",
            "El modelo contiene parámetros asumidos.",
            component.id,
          ),
        );
      }
    });
  });

  const kinds = components.reduce<Record<string, number>>(
    (result, component) => {
      result[component.kind] = (result[component.kind] ?? 0) + 1;
      return result;
    },
    {},
  );

  const uniqueWarnings = [
    ...new Map(
      warnings.map((item) => [`${item.code}:${item.componentId || ""}`, item]),
    ).values(),
  ];

  return {
    readiness: errors.length
      ? "NOT_READY"
      : uniqueWarnings.length
        ? "READY_WITH_ASSUMPTIONS"
        : "READY",
    errors,
    warnings: uniqueWarnings,
    statistics: {
      busCount: kinds.BUS ?? 0,
      branchCount:
        (kinds.LINE ?? 0) +
        (kinds.TRANSFORMER_2W ?? 0) +
        (kinds.TRANSFORMER_3W ?? 0),
      loadCount: kinds.LOAD ?? 0,
      generatorCount: (kinds.GENERATOR ?? 0) + (kinds.EXTERNAL_GRID ?? 0),
      componentCount: components.length,
      terminalCount: terminals.length,
      connectionNodeCount: connectionNodes.length,
    },
  };
}

function normalizeSolverOptions(
  candidate: Record<string, unknown> | undefined,
) {
  const algorithms = new Set([
    "NEWTON_RAPHSON",
    "FAST_DECOUPLED",
    "GAUSS_SEIDEL",
  ]);
  const requestedAlgorithm = String(
    candidate?.algorithm || "NEWTON_RAPHSON",
  ).toUpperCase();
  return {
    algorithm: algorithms.has(requestedAlgorithm)
      ? requestedAlgorithm
      : "NEWTON_RAPHSON",
    tolerance: Math.max(
      Number.EPSILON,
      Number(candidate?.tolerance) || 0.000001,
    ),
    maximumIterations: Math.max(
      1,
      Math.round(Number(candidate?.maximumIterations) || 20),
    ),
    calculateVoltageAngles: candidate?.calculateVoltageAngles !== false,
    enforceReactiveLimits: candidate?.enforceReactiveLimits !== false,
    frequencyHz: Number(candidate?.frequencyHz) || 50,
    basePowerMVA: Number(candidate?.basePowerMVA) || 100,
  };
}

function finiteNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((item) => String(item || "").trim()).filter(Boolean)),
  ];
}

function parseAnalysisOptionsJson(value: string | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  if (value.length > 32_000) throw new Error("ANALYSIS_OPTIONS_TOO_LARGE");
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("ANALYSIS_OPTIONS_INVALID");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ANALYSIS_OPTIONS_INVALID"
    ) {
      throw error;
    }
    throw new Error("ANALYSIS_OPTIONS_JSON_INVALID");
  }
}

function normalizeAnalysisOptions(
  analysisType: string,
  candidate: Record<string, unknown>,
) {
  if (analysisType === "DC_POWER_FLOW") {
    return {
      calculateLineLoading: candidate.calculateLineLoading !== false,
    };
  }
  if (analysisType === "CONTINGENCY_N_1") {
    const minimumVoltagePu = finiteNumber(
      candidate.minimumVoltagePu,
      0.95,
      0.1,
      1.5,
    );
    return {
      includeLines: candidate.includeLines !== false,
      includeTransformers: candidate.includeTransformers !== false,
      selectedComponentIds: stringArray(candidate.selectedComponentIds),
      maximumContingencies: Math.round(
        finiteNumber(candidate.maximumContingencies, 50, 1, 100),
      ),
      minimumVoltagePu,
      maximumVoltagePu: finiteNumber(
        candidate.maximumVoltagePu,
        1.05,
        minimumVoltagePu,
        1.5,
      ),
      maximumLoadingPercent: finiteNumber(
        candidate.maximumLoadingPercent,
        100,
        1,
        1000,
      ),
    };
  }
  if (analysisType === "OPERATING_CASE_SWEEP") {
    const minimumVoltagePu = finiteNumber(
      candidate.minimumVoltagePu,
      0.95,
      0.1,
      1.5,
    );
    return {
      caseIds: stringArray(candidate.caseIds).slice(0, 50),
      minimumVoltagePu,
      maximumVoltagePu: finiteNumber(
        candidate.maximumVoltagePu,
        1.05,
        minimumVoltagePu,
        1.5,
      ),
      maximumLoadingPercent: finiteNumber(
        candidate.maximumLoadingPercent,
        100,
        1,
        1000,
      ),
    };
  }
  if (analysisType === "LOADABILITY") {
    const startMultiplier = finiteNumber(
      candidate.startMultiplier,
      1,
      0.01,
      20,
    );
    return {
      selectedComponentIds: stringArray(candidate.selectedComponentIds),
      startMultiplier,
      maximumMultiplier: finiteNumber(
        candidate.maximumMultiplier,
        2,
        startMultiplier,
        20,
      ),
      step: finiteNumber(candidate.step, 0.05, 0.001, 10),
      minimumVoltagePu: finiteNumber(
        candidate.minimumVoltagePu,
        0.95,
        0.1,
        1.5,
      ),
      maximumVoltagePu: finiteNumber(
        candidate.maximumVoltagePu,
        1.05,
        0.1,
        1.5,
      ),
      maximumLoadingPercent: finiteNumber(
        candidate.maximumLoadingPercent,
        100,
        1,
        1000,
      ),
      stopAtFirstViolation: candidate.stopAtFirstViolation !== false,
    };
  }
  return {};
}

function validationFailure(
  validation: ReturnType<typeof validateElectricalModel>,
) {
  if (!validation.errors.length) return;
  const details = validation.errors
    .slice(0, 8)
    .map((item) => `${item.code}: ${item.message}`)
    .join(" | ");
  throw new Error(`ANALYSIS_MODEL_NOT_READY: ${details}`);
}

function modelForOperatingCase(
  document: DiagramDocument,
  operatingCase: OperatingCase,
) {
  const components = document.electricalModel?.components ?? [];
  const terminals = document.electricalModel?.terminals ?? [];
  const connectionNodes = document.electricalModel?.connectionNodes ?? [];
  const appliedComponents = components.map((component) =>
    applyOperatingCase(component, operatingCase),
  );
  const scoped = scopeElectricalModelToSlack(
    appliedComponents,
    terminals,
    connectionNodes,
    Number(document.electricalModel?.schemaVersion) || 1,
  );
  const validation = validateElectricalModel(
    scoped.electricalModel.components,
    scoped.electricalModel.terminals,
    scoped.electricalModel.connectionNodes,
  );
  const combinedValidation = {
    ...validation,
    warnings: [...scoped.warnings, ...validation.warnings],
    readiness: validation.errors.length
      ? "NOT_READY"
      : scoped.warnings.length || validation.warnings.length
        ? "READY_WITH_ASSUMPTIONS"
        : "READY",
  };
  return {
    validation: addValidationIssueContext(
      combinedValidation,
      scoped.electricalModel.components,
    ),
    electricalModel: scoped.electricalModel,
    networkScope: scoped.networkScope,
  };
}

function validateAnalysisSpecificModel(
  analysisType: string,
  analysisOptions: Record<string, unknown>,
  model: ReturnType<typeof modelForOperatingCase>["electricalModel"],
  cases: OperatingCase[],
) {
  const components = model.components.filter(isComponentInService);
  if (analysisType === "CONTINGENCY_N_1") {
    const selected = new Set(stringArray(analysisOptions.selectedComponentIds));
    const includeLines = analysisOptions.includeLines !== false;
    const includeTransformers = analysisOptions.includeTransformers !== false;
    const candidates = components.filter((component) => {
      if (selected.size && !selected.has(component.id)) return false;
      return (
        (includeLines && component.kind === "LINE") ||
        (includeTransformers && component.kind === "TRANSFORMER_2W")
      );
    });
    if (!candidates.length) throw new Error("NO_CONTINGENCY_CANDIDATES");
  }
  if (analysisType === "OPERATING_CASE_SWEEP") {
    const selected = new Set(stringArray(analysisOptions.caseIds));
    const targets = selected.size
      ? cases.filter((item) => selected.has(item.id))
      : cases;
    if (!targets.length) throw new Error("NO_OPERATING_CASES_SELECTED");
    if (targets.length > 50) throw new Error("TOO_MANY_OPERATING_CASES");
  }
  if (analysisType === "LOADABILITY") {
    const selected = new Set(stringArray(analysisOptions.selectedComponentIds));
    const loads = components.filter(
      (component) =>
        component.kind === "LOAD" &&
        (!selected.size || selected.has(component.id)),
    );
    if (!loads.length) throw new Error("NO_LOADS_SELECTED");
    const start = Number(analysisOptions.startMultiplier);
    const maximum = Number(analysisOptions.maximumMultiplier);
    const step = Number(analysisOptions.step);
    const estimatedRuns = Math.floor((maximum - start) / step) + 2;
    if (!Number.isFinite(estimatedRuns) || estimatedRuns > 200) {
      throw new Error("LOADABILITY_RUN_LIMIT_EXCEEDED");
    }
  }
}

function buildAnalysisInput(
  document: DiagramDocument,
  options: {
    studyId: string;
    diagramId: string;
    diagramStorageVersion: number;
    operatingCaseId: string;
    analysisType: string;
    analysisOptions: Record<string, unknown>;
  },
) {
  if (Number(document.schemaVersion) !== 3) {
    throw new Error("DIAGRAM_SCHEMA_VERSION_NOT_SUPPORTED");
  }

  const components = document.electricalModel?.components;
  const terminals = document.electricalModel?.terminals;
  const connectionNodes = document.electricalModel?.connectionNodes;
  if (
    !Array.isArray(components) ||
    !Array.isArray(terminals) ||
    !Array.isArray(connectionNodes)
  ) {
    throw new Error("ELECTRICAL_MODEL_MISSING");
  }

  const cases = normalizeCases(document.operatingCases);
  const operatingCase =
    cases.find((item) => item.id === options.operatingCaseId) ?? null;
  if (!operatingCase) throw new Error("OPERATING_CASE_NOT_FOUND");

  const base = modelForOperatingCase(document, operatingCase);
  validationFailure(base.validation);
  validateAnalysisSpecificModel(
    options.analysisType,
    options.analysisOptions,
    base.electricalModel,
    cases,
  );

  const input: Record<string, unknown> = {
    schemaVersion: 2,
    studyId: options.studyId,
    diagramId: options.diagramId,
    diagramStorageVersion: options.diagramStorageVersion,
    operatingCaseId: operatingCase.id,
    analysisType: options.analysisType,
    solverOptions: normalizeSolverOptions(
      document.analysisConfiguration?.solverOptions,
    ),
    analysisOptions: options.analysisOptions,
    validation: base.validation,
    networkScope: base.networkScope,
    electricalModel: base.electricalModel,
  };

  if (options.analysisType === "OPERATING_CASE_SWEEP") {
    const selected = new Set(stringArray(options.analysisOptions.caseIds));
    const targets = selected.size
      ? cases.filter((item) => selected.has(item.id))
      : cases;
    input.scenarios = targets.map((item) => {
      const scenario = modelForOperatingCase(document, item);
      validationFailure(scenario.validation);
      return {
        operatingCaseId: item.id,
        name: item.name || item.id,
        validation: scenario.validation,
        networkScope: scenario.networkScope,
        electricalModel: scenario.electricalModel,
      };
    });
  }

  return input;
}

async function resolveWorkerArn() {
  if (cachedWorkerArn) return cachedWorkerArn;
  if (!WORKER_PARAMETER) {
    throw new Error("ANALYSIS_WORKER_ARN_PARAMETER_NOT_CONFIGURED");
  }
  const response = await ssm.send(
    new GetParameterCommand({ Name: WORKER_PARAMETER }),
  );
  const workerArn = response.Parameter?.Value?.trim();
  if (!workerArn) throw new Error("ANALYSIS_WORKER_ARN_NOT_FOUND");
  cachedWorkerArn = workerArn;
  return workerArn;
}

async function invokeWorker(studyId: string, correlationId: string) {
  const workerArn = await resolveWorkerArn();
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: workerArn,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ studyId, correlationId })),
    }),
  );
  if (response.StatusCode !== 202) {
    throw new Error(`WORKER_INVOCATION_REJECTED_${response.StatusCode ?? 0}`);
  }
}

function toRequestResult(
  study: Schema["AnalysisStudy"]["type"],
  message?: string,
): AnalysisRequestResult {
  return {
    studyId: study.id,
    status: study.status,
    ...(message ? { message } : {}),
    ...(study.inputStorageKey
      ? { inputStorageKey: study.inputStorageKey }
      : {}),
    ...(study.resultStorageKey
      ? { resultStorageKey: study.resultStorageKey }
      : {}),
    ...(study.diagnosticsStorageKey
      ? { diagnosticsStorageKey: study.diagnosticsStorageKey }
      : {}),
    ...(study.numericalStorageKey
      ? { numericalStorageKey: study.numericalStorageKey }
      : {}),
  };
}

async function findIdempotentStudy(
  clientRequestId: string,
  identity: Identity,
  diagramId: string,
) {
  const result =
    await client.models.AnalysisStudy.listAnalysisStudiesByClientRequest({
      clientRequestId,
    });
  if (result.errors?.length) throw new Error("IDEMPOTENCY_LOOKUP_FAILED");
  const existing = result.data[0] ?? null;
  if (!existing) return null;
  if (
    existing.requestedByProfileId !== identity.sub ||
    existing.diagramId !== diagramId
  ) {
    throw new Error("CLIENT_REQUEST_ID_ALREADY_USED");
  }
  return existing;
}

async function startAnalysis(
  args: StartAnalysisArguments,
  identity: Identity,
): Promise<AnalysisRequestResult> {
  const diagramId = safeSegment(args.diagramId, "diagram_id");
  const operatingCaseId = safeSegment(
    args.operatingCaseId,
    "operating_case_id",
  );
  const clientRequestId = safeSegment(
    args.clientRequestId,
    "client_request_id",
  );
  const analysisType = String(args.analysisType || "POWER_FLOW").toUpperCase();
  const executionPreference = String(
    args.executionPreference || "AUTO",
  ).toUpperCase();
  const expectedVersion = Number(args.expectedDiagramVersion);
  const analysisOptions = normalizeAnalysisOptions(
    analysisType,
    parseAnalysisOptionsJson(args.analysisOptionsJson),
  );

  if (!SUPPORTED_ANALYSIS_TYPES.has(analysisType)) {
    throw new Error("ANALYSIS_TYPE_NOT_SUPPORTED");
  }
  if (!SUPPORTED_EXECUTION_PREFERENCES.has(executionPreference)) {
    throw new Error("EXECUTION_PREFERENCE_NOT_AVAILABLE");
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    throw new Error("INVALID_EXPECTED_DIAGRAM_VERSION");
  }

  const existing = await findIdempotentStudy(
    clientRequestId,
    identity,
    diagramId,
  );
  if (existing) {
    return toRequestResult(existing, "Solicitud idempotente recuperada.");
  }

  const diagramResult = await client.models.Diagram.get({ id: diagramId });
  const diagram = diagramResult.data;
  if (diagramResult.errors?.length || !diagram) {
    throw new Error("DIAGRAM_NOT_FOUND");
  }

  const projectResult = await client.models.Project.get({
    id: diagram.projectId,
  });
  const project = projectResult.data;
  if (projectResult.errors?.length || !project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  const role = resolveProjectRole(project, identity);
  if (role !== "OWNER" && role !== "EDITOR") {
    throw new Error("WRITE_ACCESS_REQUIRED");
  }

  const multiDiagram = Boolean(project.multiDiagram);
  const projectDiagrams = multiDiagram
    ? await listProjectDiagrams(project.id)
    : [diagram];
  if (!projectDiagrams.some((item) => item.id === diagram.id)) {
    throw new Error("ACTIVE_DIAGRAM_NOT_IN_PROJECT");
  }

  const expectedVersions = multiDiagram
    ? parseExpectedDiagramVersions(args.expectedDiagramVersionsJson)
    : { [diagram.id]: expectedVersion };
  const diagramVersions = Object.fromEntries(
    projectDiagrams.map((item) => [item.id, Number(item.storageVersion ?? 0)]),
  );

  projectDiagrams.forEach((item) => {
    const current = Number(item.storageVersion ?? 0);
    const expected = expectedVersions[item.id];
    if (!expected) {
      throw new Error(`EXPECTED_DIAGRAM_VERSION_MISSING:${item.id}`);
    }
    if (current !== expected) {
      throw new Error(
        `DIAGRAM_VERSION_MISMATCH:${item.id}:expected=${expected},current=${current}`,
      );
    }
  });

  const currentVersion = diagramVersions[diagram.id];
  if (currentVersion !== expectedVersion) {
    throw new Error(
      `DIAGRAM_VERSION_MISMATCH:${diagram.id}:expected=${expectedVersion},current=${currentVersion}`,
    );
  }

  const sources = await Promise.all(
    projectDiagrams.map(async (projectDiagram) => ({
      diagram: projectDiagram,
      document: await loadDiagramDocument(project.id, projectDiagram),
    })),
  );
  const document = multiDiagram
    ? composeProjectDocument(sources, diagram.id, project.name)
    : sources[0].document;

  const workspaceId = safeSegment(project.workspaceId, "workspace_id");
  const studyId = `study-${createHash("sha256")
    .update(`${identity.sub}:${clientRequestId}`)
    .digest("hex")
    .slice(0, 32)}`;
  const studyDirectory = `${STORAGE_PREFIX}/${workspaceId}/${diagram.id}/studies/${studyId}`;
  const inputStorageKey = `${studyDirectory}/input.json`;
  const requestedAt = new Date().toISOString();

  const input = buildAnalysisInput(document, {
    studyId,
    diagramId: diagram.id,
    diagramStorageVersion: currentVersion,
    operatingCaseId,
    analysisType,
    analysisOptions,
  });
  Object.assign(input, {
    projectId: project.id,
    multiDiagram,
    diagramVersions,
    sourceDiagramIds: projectDiagrams.map((item) => item.id),
  });

  const createResult = await client.models.AnalysisStudy.create({
    id: studyId,
    workspaceId,
    projectId: project.id,
    diagramId: diagram.id,
    operatingCaseId,
    name: String(
      args.name ||
        `${ANALYSIS_DEFINITIONS[analysisType as keyof typeof ANALYSIS_DEFINITIONS].label} · ${document.name || diagram.name}`,
    )
      .trim()
      .slice(0, 160),
    analysisType: analysisType as keyof typeof ANALYSIS_DEFINITIONS,
    analysisOptionsJson: JSON.stringify(analysisOptions),
    executionPreference:
      executionPreference === "STANDARD" ? "STANDARD" : "AUTO",
    executionTier: "STANDARD",
    computeProvider: "LAMBDA",
    status: "VALIDATING",
    clientRequestId,
    inputDiagramVersion: currentVersion,
    inputProjectVersionsJson: multiDiagram
      ? JSON.stringify(diagramVersions)
      : undefined,
    multiDiagram,
    inputStorageKey,
    requestedMemoryMb: 3072,
    executionTimeoutSeconds: 840,
    reservedUnits:
      ANALYSIS_DEFINITIONS[analysisType as keyof typeof ANALYSIS_DEFINITIONS]
        .units,
    consumedUnits: 0,
    requestedByProfileId: identity.sub,
    requestedAt,
    ownerIdentities: compactIdentityList(
      project.ownerIdentities,
      role === "OWNER" ? identityValues(identity) : [],
    ),
    editorIdentities: compactIdentityList(
      project.editorIdentities,
      role === "EDITOR" ? identityValues(identity) : [],
    ),
    viewerIdentities: compactIdentityList(project.viewerIdentities),
  });

  if (createResult.errors?.length || !createResult.data) {
    throw new Error(
      createResult.errors
        ?.map((item: { message?: string | null }) => item.message)
        .join("; ") || "ANALYSIS_STUDY_CREATE_FAILED",
    );
  }

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: inputStorageKey,
        Body: JSON.stringify(input, null, 2),
        ContentType: "application/json",
        CacheControl: "no-store",
        Metadata: {
          "document-type": "analysis-input",
          "study-id": studyId,
          "diagram-id": diagram.id,
        },
      }),
    );

    const queuedResult = await client.models.AnalysisStudy.update({
      id: studyId,
      status: "QUEUED",
    });
    if (queuedResult.errors?.length || !queuedResult.data) {
      throw new Error("ANALYSIS_STUDY_QUEUE_UPDATE_FAILED");
    }

    await invokeWorker(studyId, clientRequestId);
    return toRequestResult(queuedResult.data, "Estudio enviado al solver.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.models.AnalysisStudy.update({
      id: studyId,
      status: "FAILED",
      completedAt: new Date().toISOString(),
      failureCode: "ORCHESTRATION_FAILED",
      failureMessage: message.slice(0, 1000),
      reservedUnits: 0,
      consumedUnits: 0,
    });
    throw error;
  }
}

function artifactKeyForStudy(
  study: Schema["AnalysisStudy"]["type"],
  artifactType: string,
) {
  const normalized = artifactType.toUpperCase();
  const base = `${STORAGE_PREFIX}/${safeSegment(study.workspaceId, "workspace_id")}/${safeSegment(study.diagramId, "diagram_id")}/studies/${safeSegment(study.id, "study_id")}`;
  const configured =
    normalized === "INPUT"
      ? study.inputStorageKey
      : normalized === "RESULT"
        ? study.resultStorageKey
        : normalized === "DIAGNOSTICS"
          ? study.diagnosticsStorageKey
          : normalized === "NUMERICAL"
            ? study.numericalStorageKey
            : null;
  const fileName =
    normalized === "INPUT"
      ? "input.json"
      : normalized === "RESULT"
        ? "result.json"
        : normalized === "DIAGNOSTICS"
          ? "diagnostics.json"
          : normalized === "NUMERICAL"
            ? "numerical.json"
            : null;
  if (!fileName) throw new Error("ANALYSIS_ARTIFACT_NOT_SUPPORTED");
  if (!configured) throw new Error("ANALYSIS_ARTIFACT_NOT_AVAILABLE");
  const expected = `${base}/${fileName}`;
  if (configured !== expected)
    throw new Error("ANALYSIS_ARTIFACT_KEY_MISMATCH");
  return { normalized, key: configured };
}

async function requestArtifact(
  args: ArtifactArguments,
  identity: Identity,
): Promise<AnalysisArtifactTicket> {
  const studyId = safeSegment(args.studyId, "study_id");
  const result = await client.models.AnalysisStudy.get({ id: studyId });
  const study = result.data;
  if (result.errors?.length || !study)
    throw new Error("ANALYSIS_STUDY_NOT_FOUND");
  if (!canReadStudy(study, identity)) throw new Error("FORBIDDEN");

  const { normalized, key } = artifactKeyForStudy(study, args.artifactType);
  if (
    (normalized === "RESULT" || normalized === "DIAGNOSTICS" || normalized === "NUMERICAL") &&
    !TERMINAL_STATUSES.has(study.status)
  ) {
    throw new Error("ANALYSIS_STUDY_NOT_FINISHED");
  }

  const expiresAt = new Date(
    Date.now() + TICKET_EXPIRATION_SECONDS * 1000,
  ).toISOString();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: TICKET_EXPIRATION_SECONDS },
  );

  return {
    studyId: study.id,
    artifactType: normalized,
    status: study.status,
    url,
    key,
    method: "GET",
    expiresAt,
    contentType: "application/json",
  };
}

function normalizeResultLayoutJson(layoutJson: string) {
  if (typeof layoutJson !== "string" || layoutJson.length > 100_000) {
    throw new Error("ANALYSIS_LAYOUT_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(layoutJson);
  } catch {
    throw new Error("ANALYSIS_LAYOUT_JSON_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ANALYSIS_LAYOUT_INVALID");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 1000)
    throw new Error("ANALYSIS_LAYOUT_ENTRY_LIMIT_EXCEEDED");
  const normalized: Record<string, { x: number; y: number }> = {};
  for (const [key, value] of entries) {
    if (!key || key.length > 240 || !value || typeof value !== "object")
      continue;
    const x = Number((value as { x?: unknown }).x);
    const y = Number((value as { y?: unknown }).y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    normalized[key] = {
      x: Math.max(-100_000, Math.min(100_000, x)),
      y: Math.max(-100_000, Math.min(100_000, y)),
    };
  }
  return JSON.stringify(normalized);
}

async function saveResultLayout(args: LayoutArguments, identity: Identity) {
  const studyId = safeSegment(args.studyId, "study_id");
  const result = await client.models.AnalysisStudy.get({ id: studyId });
  const study = result.data;
  if (result.errors?.length || !study)
    throw new Error("ANALYSIS_STUDY_NOT_FOUND");
  if (!canEditStudyLayout(study, identity))
    throw new Error("WRITE_ACCESS_REQUIRED");
  const layoutJson = normalizeResultLayoutJson(args.layoutJson);
  const update = await client.models.AnalysisStudy.update({
    id: studyId,
    resultLayoutJson: layoutJson,
  });
  if (update.errors?.length || !update.data) {
    throw new Error("ANALYSIS_LAYOUT_SAVE_FAILED");
  }
  return true;
}

export const handler: AppSyncResolverHandler<
  StartAnalysisArguments | ArtifactArguments | LayoutArguments,
  AnalysisRequestResult | AnalysisArtifactTicket | boolean
> = async (event) => {
  const identity = getIdentity(event.identity);
  if (!identity.sub) throw new Error("UNAUTHENTICATED");

  const runtimeEvent = event as unknown as RuntimeEvent;
  console.log("analysis-orchestrator:request", {
    typeName: runtimeEvent.typeName ?? null,
    fieldName: runtimeEvent.fieldName ?? null,
    userSub: identity.sub,
  });

  switch (runtimeEvent.fieldName) {
    case "startAnalysis":
      return startAnalysis(event.arguments as StartAnalysisArguments, identity);
    case "requestAnalysisArtifact":
      return requestArtifact(event.arguments as ArtifactArguments, identity);
    case "saveAnalysisResultLayout":
      return saveResultLayout(event.arguments as LayoutArguments, identity);
    default:
      throw new Error("UNSUPPORTED_ANALYSIS_OPERATION");
  }
};
