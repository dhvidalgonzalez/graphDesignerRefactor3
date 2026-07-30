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
const STORAGE_PREFIX = String(env.ANALYSIS_STORAGE_PREFIX || "power-flow")
  .replace(/^\/+|\/+$/g, "");
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
};

type ElectricalTerminal = {
  id: string;
  componentId: string;
  role?: string;
  connectionNodeId?: string | null;
};

type ConnectionNode = {
  id: string;
  nominalVoltageKv?: number | null;
  busComponentId?: string | null;
};

type OperatingCase = {
  id: string;
  name?: string;
  description?: string;
  isDefault?: boolean;
  overrides?: Record<string, Record<string, unknown>>;
};

type DiagramDocument = {
  schemaVersion?: number;
  id?: string;
  name?: string;
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
  if (!body) throw new Error("EMPTY_S3_OBJECT");
  const candidate = body as {
    transformToString?: (encoding?: string) => Promise<string>;
  };
  if (typeof candidate.transformToString === "function") {
    return candidate.transformToString("utf-8");
  }
  throw new Error("UNSUPPORTED_S3_BODY");
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

function normalizeCases(candidate: OperatingCase[] | undefined) {
  const cases = Array.isArray(candidate) && candidate.length
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
    id: safeSegment(String(item?.id || `case-${index + 1}`), "operating_case_id"),
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
  const baseInService = !Boolean(parameterValue(component, "outOfService"));
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
) {
  return {
    code,
    message,
    ...(componentId ? { componentId } : {}),
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

  const slackComponents = activeComponents.filter((component) => {
    if (component.kind === "EXTERNAL_GRID") return true;
    return (
      component.kind === "GENERATOR" &&
      String(parameterValue(component, "controlMode") || "").toUpperCase() ===
        "SLACK"
    );
  });

  if (!slackComponents.length) {
    errors.push(
      createIssue(
        "NO_SLACK_REFERENCE",
        "No existe una red externa ni un generador configurado como Slack.",
      ),
    );
  }

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

  const kinds = components.reduce<Record<string, number>>((result, component) => {
    result[component.kind] = (result[component.kind] ?? 0) + 1;
    return result;
  }, {});

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
      generatorCount:
        (kinds.GENERATOR ?? 0) + (kinds.EXTERNAL_GRID ?? 0),
      componentCount: components.length,
      terminalCount: terminals.length,
      connectionNodeCount: connectionNodes.length,
    },
  };
}

function normalizeSolverOptions(candidate: Record<string, unknown> | undefined) {
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
  return [...new Set(value
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
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
    if (error instanceof Error && error.message === "ANALYSIS_OPTIONS_INVALID") {
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
      maximumContingencies: Math.round(finiteNumber(
        candidate.maximumContingencies,
        50,
        1,
        100,
      )),
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
      minimumVoltagePu: finiteNumber(candidate.minimumVoltagePu, 0.95, 0.1, 1.5),
      maximumVoltagePu: finiteNumber(candidate.maximumVoltagePu, 1.05, 0.1, 1.5),
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

function validationFailure(validation: ReturnType<typeof validateElectricalModel>) {
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
  const validation = validateElectricalModel(
    appliedComponents,
    terminals,
    connectionNodes,
  );
  return {
    validation,
    electricalModel: {
      schemaVersion: Number(document.electricalModel?.schemaVersion) || 1,
      components: appliedComponents,
      terminals,
      connectionNodes,
    },
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
      return (includeLines && component.kind === "LINE") ||
        (includeTransformers && component.kind === "TRANSFORMER_2W");
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
    const loads = components.filter((component) =>
      component.kind === "LOAD" && (!selected.size || selected.has(component.id))
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

  const currentVersion = Number(diagram.storageVersion ?? 0);
  if (currentVersion !== expectedVersion) {
    throw new Error(
      `DIAGRAM_VERSION_MISMATCH: expected=${expectedVersion}, current=${currentVersion}`,
    );
  }

  const expectedDiagramKey = `projects/${project.id}/diagrams/${diagram.id}/document.json`;
  if (diagram.storageKey !== expectedDiagramKey) {
    throw new Error("DIAGRAM_STORAGE_KEY_MISMATCH");
  }

  const diagramObject = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: expectedDiagramKey }),
  );
  const document = JSON.parse(
    await bodyToString(diagramObject.Body),
  ) as DiagramDocument;

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

  const createResult = await client.models.AnalysisStudy.create({
    id: studyId,
    workspaceId,
    projectId: project.id,
    diagramId: diagram.id,
    operatingCaseId,
    name: String(
      args.name || `${ANALYSIS_DEFINITIONS[analysisType as keyof typeof ANALYSIS_DEFINITIONS].label} · ${document.name || diagram.name}`,
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
    inputStorageKey,
    requestedMemoryMb: 3072,
    executionTimeoutSeconds: 840,
    reservedUnits: ANALYSIS_DEFINITIONS[analysisType as keyof typeof ANALYSIS_DEFINITIONS].units,
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
      createResult.errors?.map((item: { message?: string | null }) => item.message).join("; ") ||
        "ANALYSIS_STUDY_CREATE_FAILED",
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
          : null;
  const fileName =
    normalized === "INPUT"
      ? "input.json"
      : normalized === "RESULT"
        ? "result.json"
        : normalized === "DIAGNOSTICS"
          ? "diagnostics.json"
          : null;
  if (!fileName) throw new Error("ANALYSIS_ARTIFACT_NOT_SUPPORTED");
  if (!configured) throw new Error("ANALYSIS_ARTIFACT_NOT_AVAILABLE");
  const expected = `${base}/${fileName}`;
  if (configured !== expected) throw new Error("ANALYSIS_ARTIFACT_KEY_MISMATCH");
  return { normalized, key: configured };
}

async function requestArtifact(
  args: ArtifactArguments,
  identity: Identity,
): Promise<AnalysisArtifactTicket> {
  const studyId = safeSegment(args.studyId, "study_id");
  const result = await client.models.AnalysisStudy.get({ id: studyId });
  const study = result.data;
  if (result.errors?.length || !study) throw new Error("ANALYSIS_STUDY_NOT_FOUND");
  if (!canReadStudy(study, identity)) throw new Error("FORBIDDEN");

  const { normalized, key } = artifactKeyForStudy(study, args.artifactType);
  if (
    (normalized === "RESULT" || normalized === "DIAGNOSTICS") &&
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
  if (entries.length > 1000) throw new Error("ANALYSIS_LAYOUT_ENTRY_LIMIT_EXCEEDED");
  const normalized: Record<string, { x: number; y: number }> = {};
  for (const [key, value] of entries) {
    if (!key || key.length > 240 || !value || typeof value !== "object") continue;
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

async function saveResultLayout(
  args: LayoutArguments,
  identity: Identity,
) {
  const studyId = safeSegment(args.studyId, "study_id");
  const result = await client.models.AnalysisStudy.get({ id: studyId });
  const study = result.data;
  if (result.errors?.length || !study) throw new Error("ANALYSIS_STUDY_NOT_FOUND");
  if (!canEditStudyLayout(study, identity)) throw new Error("WRITE_ACCESS_REQUIRED");
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
      return startAnalysis(
        event.arguments as StartAnalysisArguments,
        identity,
      );
    case "requestAnalysisArtifact":
      return requestArtifact(event.arguments as ArtifactArguments, identity);
    case "saveAnalysisResultLayout":
      return saveResultLayout(event.arguments as LayoutArguments, identity);
    default:
      throw new Error("UNSUPPORTED_ANALYSIS_OPERATION");
  }
};
