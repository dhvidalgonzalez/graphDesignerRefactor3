import { getNodePorts, getSymbolDefinition } from "../catalog/symbolCatalog.js";
import { buildElectricalModel } from "./electricalModel.js";

const GLOBAL_SEPARATOR = "::";

class UnionFind {
  constructor(keys = []) {
    this.parent = new Map(keys.map((key) => [key, key]));
  }

  add(key) {
    if (key && !this.parent.has(key)) this.parent.set(key, key);
  }

  find(key) {
    const parent = this.parent.get(key);
    if (parent === undefined) return null;
    if (parent === key) return key;
    const root = this.find(parent);
    if (root) this.parent.set(key, root);
    return root;
  }

  union(left, right) {
    this.add(left);
    this.add(right);
    const rootLeft = this.find(left);
    const rootRight = this.find(right);
    if (!rootLeft || !rootRight || rootLeft === rootRight) return;
    const [first, second] = [rootLeft, rootRight].sort();
    this.parent.set(second, first);
  }
}

function hashToken(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function loadedSheets(projectOrSheets) {
  const sheets = Array.isArray(projectOrSheets)
    ? projectOrSheets
    : projectOrSheets?.diagrams ?? [];
  return sheets.filter((sheet) => sheet?.id && sheet?.document);
}

export function globalComponentId(diagramId, componentId) {
  return `${String(diagramId)}${GLOBAL_SEPARATOR}${String(componentId)}`;
}

export function globalTerminalId(diagramId, terminalId) {
  return `${String(diagramId)}${GLOBAL_SEPARATOR}${String(terminalId)}`;
}

export function globalConnectionNodeId(diagramId, connectionNodeId) {
  return `${String(diagramId)}${GLOBAL_SEPARATOR}${String(connectionNodeId)}`;
}

export function localIdFromGlobal(globalId, diagramId) {
  const prefix = `${String(diagramId)}${GLOBAL_SEPARATOR}`;
  return String(globalId || "").startsWith(prefix)
    ? String(globalId).slice(prefix.length)
    : String(globalId || "");
}

export function normalizeLogicalConnectionReference(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const diagramId = String(candidate.diagramId || "").trim();
  const entityId = String(candidate.entityId || candidate.componentId || "").trim();
  const entityKind = String(candidate.entityKind || candidate.kind || "node").toLowerCase();
  const terminalKey = String(candidate.terminalKey || candidate.portId || "").trim();
  if (!diagramId || !entityId || !terminalKey || !["node", "edge"].includes(entityKind)) return null;
  return {
    diagramId,
    entityKind,
    entityId,
    terminalKey,
  };
}

export function serializeLogicalConnectionReference(reference) {
  const normalized = normalizeLogicalConnectionReference(reference);
  return normalized ? JSON.stringify(normalized) : "";
}

export function parseLogicalConnectionReference(value) {
  if (!value) return null;
  try {
    return normalizeLogicalConnectionReference(JSON.parse(value));
  } catch {
    return null;
  }
}

export function getEntityTerminalDescriptors(document, entityKind, entityId) {
  if (!document || !entityId) return [];
  if (entityKind === "edge") {
    const edge = document.edges?.[entityId];
    if (!edge || edge.kind !== "line") return [];
    return [
      { key: "from", label: "Nodo 1 / origen", modelTerminalId: `${edge.id}:terminal:from` },
      { key: "to", label: "Nodo 2 / destino", modelTerminalId: `${edge.id}:terminal:to` },
    ];
  }

  const node = document.nodes?.[entityId];
  if (!node) return [];
  try {
    return getNodePorts(node).map((port, index) => ({
      key: String(port.id),
      label: port.name || `Terminal ${index + 1}`,
      modelTerminalId: `${node.id}:terminal:${String(port.id)}`,
    }));
  } catch {
    return [];
  }
}

export function getEntityLogicalConnections(entity) {
  if (!entity?.logicalConnections || typeof entity.logicalConnections !== "object") return {};
  return Object.fromEntries(
    Object.entries(entity.logicalConnections)
      .map(([terminalKey, reference]) => [String(terminalKey), normalizeLogicalConnectionReference(reference)])
      .filter(([, reference]) => Boolean(reference)),
  );
}

export function getStoredLogicalConnection(entity, terminalKey) {
  return normalizeLogicalConnectionReference(entity?.logicalConnections?.[String(terminalKey)]);
}

function edgeEndpointTerminalKey(edge, endpoint) {
  return edge.source.nodeId === endpoint.nodeId && String(edge.source.portId) === String(endpoint.portId)
    ? "from"
    : "to";
}

function logicalNodeTerminalKey(document, nodeId, terminalKey) {
  const node = document?.nodes?.[nodeId];
  if (node?.type !== "ElmTerm") return String(terminalKey);
  const firstPort = getEntityTerminalDescriptors(document, "node", nodeId)[0];
  return firstPort?.key ?? String(terminalKey);
}

export function inferDiagramConnection(document, entityKind, entityId, terminalKey) {
  if (!document) return null;

  if (entityKind === "edge") {
    const edge = document.edges?.[entityId];
    if (!edge || edge.kind !== "line") return null;
    const endpoint = terminalKey === "to" ? edge.target : edge.source;
    return normalizeLogicalConnectionReference({
      diagramId: document.id,
      entityKind: "node",
      entityId: endpoint.nodeId,
      terminalKey: logicalNodeTerminalKey(document, endpoint.nodeId, endpoint.portId),
    });
  }

  const node = document.nodes?.[entityId];
  if (!node) return null;
  const matching = Object.values(document.edges ?? {})
    .filter((edge) => (
      (edge.source.nodeId === entityId && String(edge.source.portId) === String(terminalKey)) ||
      (edge.target.nodeId === entityId && String(edge.target.portId) === String(terminalKey))
    ))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const edge = matching[0];
  if (!edge) return null;

  if (edge.kind === "line") {
    return normalizeLogicalConnectionReference({
      diagramId: document.id,
      entityKind: "edge",
      entityId: edge.id,
      terminalKey: edgeEndpointTerminalKey(edge, { nodeId: entityId, portId: terminalKey }),
    });
  }

  const sourceMatches = edge.source.nodeId === entityId && String(edge.source.portId) === String(terminalKey);
  const opposite = sourceMatches ? edge.target : edge.source;
  return normalizeLogicalConnectionReference({
    diagramId: document.id,
    entityKind: "node",
    entityId: opposite.nodeId,
    terminalKey: logicalNodeTerminalKey(document, opposite.nodeId, opposite.portId),
  });
}

export function getEffectiveLogicalConnection(document, entityKind, entityId, terminalKey) {
  const entity = entityKind === "edge" ? document?.edges?.[entityId] : document?.nodes?.[entityId];
  const manual = getStoredLogicalConnection(entity, terminalKey);
  if (manual) return { reference: manual, source: "MANUAL" };
  const automatic = inferDiagramConnection(document, entityKind, entityId, terminalKey);
  return automatic ? { reference: automatic, source: "TOPOLOGY" } : { reference: null, source: "NONE" };
}

function electricalNode(node) {
  try {
    return getSymbolDefinition(node.type).electrical !== false;
  } catch {
    return false;
  }
}

export function buildProjectComponentCatalog(projectOrSheets) {
  return loadedSheets(projectOrSheets).map((sheet) => {
    const document = sheet.document;
    const components = [
      ...Object.values(document.nodes ?? {})
        .filter(electricalNode)
        .map((node) => {
          const terminals = getEntityTerminalDescriptors(document, "node", node.id);
          return {
            diagramId: sheet.id,
            diagramName: sheet.name || document.name || sheet.id,
            entityKind: "node",
            entityId: node.id,
            componentName: node.properties?.name || node.id,
            componentType: getSymbolDefinition(node.type).displayName,
            terminals: node.type === "ElmTerm" && terminals.length
              ? [{ ...terminals[0], label: "Barra / nodo eléctrico" }]
              : terminals,
          };
        }),
      ...Object.values(document.edges ?? {})
        .filter((edge) => edge.kind === "line")
        .map((edge) => ({
          diagramId: sheet.id,
          diagramName: sheet.name || document.name || sheet.id,
          entityKind: "edge",
          entityId: edge.id,
          componentName: edge.properties?.name || "Línea eléctrica",
          componentType: "Línea eléctrica",
          terminals: getEntityTerminalDescriptors(document, "edge", edge.id),
        })),
    ];
    return {
      diagramId: sheet.id,
      diagramName: sheet.name || document.name || sheet.id,
      components,
    };
  });
}

export function resolveProjectConnectionLabel(projectOrSheets, reference) {
  const normalized = normalizeLogicalConnectionReference(reference);
  if (!normalized) return "Sin conexión lógica";
  const sheet = loadedSheets(projectOrSheets).find((item) => item.id === normalized.diagramId);
  if (!sheet) return "Referencia a diagrama inexistente";
  const entity = normalized.entityKind === "edge"
    ? sheet.document.edges?.[normalized.entityId]
    : sheet.document.nodes?.[normalized.entityId];
  if (!entity) return `${sheet.name} · componente inexistente`;
  const name = entity.properties?.name || entity.id;
  const terminal = getEntityTerminalDescriptors(
    sheet.document,
    normalized.entityKind,
    normalized.entityId,
  ).find((item) => item.key === normalized.terminalKey);
  return `${sheet.name} · ${name}${terminal ? ` · ${terminal.label}` : ""}`;
}

function terminalLookupKey(diagramId, entityKind, entityId, terminalKey) {
  return [diagramId, entityKind, entityId, terminalKey].join("|");
}

function cloneAndNamespaceModel(sheet) {
  const model = buildElectricalModel(sheet.document);
  const componentIdMap = new Map();
  const connectionNodeIdMap = new Map();

  model.components.forEach((component) => {
    componentIdMap.set(component.id, globalComponentId(sheet.id, component.id));
  });
  model.connectionNodes.forEach((node) => {
    connectionNodeIdMap.set(node.id, globalConnectionNodeId(sheet.id, node.id));
  });

  const components = model.components.map((component) => ({
    ...structuredClone(component),
    id: componentIdMap.get(component.id),
    terminalIds: (component.terminalIds ?? []).map((id) => globalTerminalId(sheet.id, id)),
    sourceEntity: {
      ...(component.sourceEntity ?? {}),
      diagramId: sheet.id,
      diagramName: sheet.name,
      localId: component.id,
    },
  }));

  const terminals = model.terminals.map((terminal) => ({
    ...structuredClone(terminal),
    id: globalTerminalId(sheet.id, terminal.id),
    componentId: componentIdMap.get(terminal.componentId),
    connectionNodeId: terminal.connectionNodeId
      ? connectionNodeIdMap.get(terminal.connectionNodeId)
      : null,
    sourceEndpoint: terminal.sourceEndpoint
      ? { ...terminal.sourceEndpoint, diagramId: sheet.id }
      : terminal.sourceEndpoint,
  }));

  const connectionNodes = model.connectionNodes.map((node) => ({
    ...structuredClone(node),
    id: connectionNodeIdMap.get(node.id),
    voltageLevelId: node.voltageLevelId
      ? `${sheet.id}${GLOBAL_SEPARATOR}${node.voltageLevelId}`
      : null,
    voltageLevelIds: (node.voltageLevelIds ?? []).map((id) => `${sheet.id}${GLOBAL_SEPARATOR}${id}`),
    busComponentId: node.busComponentId
      ? componentIdMap.get(node.busComponentId)
      : undefined,
    memberEndpointIds: (node.memberEndpointIds ?? []).map((id) => `${sheet.id}${GLOBAL_SEPARATOR}${id}`),
    sourceDiagramId: sheet.id,
  }));

  const terminalLookup = new Map();
  Object.values(sheet.document.nodes ?? {}).forEach((node) => {
    getEntityTerminalDescriptors(sheet.document, "node", node.id).forEach((terminal) => {
      terminalLookup.set(
        terminalLookupKey(sheet.id, "node", node.id, terminal.key),
        globalTerminalId(sheet.id, terminal.modelTerminalId),
      );
    });
  });
  Object.values(sheet.document.edges ?? {})
    .filter((edge) => edge.kind === "line")
    .forEach((edge) => {
      getEntityTerminalDescriptors(sheet.document, "edge", edge.id).forEach((terminal) => {
        terminalLookup.set(
          terminalLookupKey(sheet.id, "edge", edge.id, terminal.key),
          globalTerminalId(sheet.id, terminal.modelTerminalId),
        );
      });
    });

  return { components, terminals, connectionNodes, terminalLookup };
}

function namespaceOperatingCases(cases, activeDiagramId) {
  return (Array.isArray(cases) ? cases : []).map((operatingCase) => ({
    ...structuredClone(operatingCase),
    overrides: Object.fromEntries(Object.entries(operatingCase.overrides ?? {}).map(([componentId, patch]) => [
      componentId.includes(GLOBAL_SEPARATOR)
        ? componentId
        : globalComponentId(activeDiagramId, componentId),
      patch,
    ])),
  }));
}

export function buildProjectAnalysisDocument(project, activeDiagramId = project?.activeDiagramId) {
  const allSheets = project?.diagrams ?? [];
  const sheets = loadedSheets(project);
  const activeSheet = sheets.find((sheet) => sheet.id === activeDiagramId) ?? sheets[0] ?? null;
  if (!activeSheet) return null;
  if (!project?.multiDiagram) return activeSheet.document;

  const missingSheets = allSheets.filter((sheet) => !sheet?.document);
  const models = sheets.map(cloneAndNamespaceModel);
  const components = models.flatMap((item) => item.components);
  const terminals = models.flatMap((item) => item.terminals);
  const connectionNodes = models.flatMap((item) => item.connectionNodes);
  const terminalLookup = new Map(models.flatMap((item) => [...item.terminalLookup.entries()]));
  const terminalById = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  const unionFind = new UnionFind(connectionNodes.map((node) => node.id));
  const topologyIssues = missingSheets.map((sheet) => ({
    code: "PROJECT_DIAGRAM_NOT_LOADED",
    message: `El diagrama ${sheet.name || sheet.id} no está cargado y no puede incorporarse al análisis multidiagrama.`,
    componentId: null,
  }));

  sheets.forEach((sheet) => {
    const entities = [
      ...Object.values(sheet.document.nodes ?? {}).map((entity) => ({ entity, entityKind: "node" })),
      ...Object.values(sheet.document.edges ?? {})
        .filter((edge) => edge.kind === "line")
        .map((entity) => ({ entity, entityKind: "edge" })),
    ];

    entities.forEach(({ entity, entityKind }) => {
      Object.entries(getEntityLogicalConnections(entity)).forEach(([terminalKey, reference]) => {
        const sourceTerminalId = terminalLookup.get(
          terminalLookupKey(sheet.id, entityKind, entity.id, terminalKey),
        );
        const targetTerminalId = terminalLookup.get(
          terminalLookupKey(reference.diagramId, reference.entityKind, reference.entityId, reference.terminalKey),
        );
        if (!sourceTerminalId) {
          topologyIssues.push({
            code: "LOGICAL_CONNECTION_SOURCE_TERMINAL_MISSING",
            message: `El terminal ${terminalKey} del componente ${entity.id} ya no existe.`,
            componentId: globalComponentId(sheet.id, entity.id),
          });
          return;
        }
        if (!targetTerminalId) {
          topologyIssues.push({
            code: "LOGICAL_CONNECTION_TARGET_MISSING",
            message: `La conexión lógica de ${entity.properties?.name || entity.id} apunta a un componente o terminal inexistente.`,
            componentId: globalComponentId(sheet.id, entity.id),
          });
          return;
        }
        const sourceConnectionNodeId = terminalById.get(sourceTerminalId)?.connectionNodeId;
        const targetConnectionNodeId = terminalById.get(targetTerminalId)?.connectionNodeId;
        if (!sourceConnectionNodeId || !targetConnectionNodeId) {
          topologyIssues.push({
            code: "LOGICAL_CONNECTION_NODE_MISSING",
            message: "No fue posible resolver uno de los nodos eléctricos de la conexión lógica.",
            componentId: globalComponentId(sheet.id, entity.id),
          });
          return;
        }
        unionFind.union(sourceConnectionNodeId, targetConnectionNodeId);
      });
    });
  });

  const grouped = new Map();
  connectionNodes.forEach((node) => {
    const root = unionFind.find(node.id) ?? node.id;
    grouped.set(root, [...(grouped.get(root) ?? []), node]);
  });

  const canonicalIdByOriginal = new Map();
  const mergedConnectionNodes = [...grouped.values()].map((nodes) => {
    const originalIds = nodes.map((node) => node.id).sort();
    const busComponentIds = [...new Set(nodes.map((node) => node.busComponentId).filter(Boolean))].sort();
    const id = busComponentIds.length === 1
      ? `cn-${busComponentIds[0]}`
      : `cn-project-${hashToken(originalIds.join("|"))}`;
    originalIds.forEach((originalId) => canonicalIdByOriginal.set(originalId, id));

    const nominalVoltages = [...new Set(nodes
      .map((node) => Number(node.nominalVoltageKv))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Number(value.toFixed(9))))];
    const voltageLevelIds = [...new Set(nodes.flatMap((node) => node.voltageLevelIds ?? []).filter(Boolean))].sort();
    return {
      id,
      nominalVoltageKv: nominalVoltages[0] ?? null,
      voltageLevelId: voltageLevelIds[0] ?? null,
      voltageLevelIds,
      voltageConflict: nominalVoltages.length > 1 || nodes.some((node) => node.voltageConflict),
      ...(busComponentIds[0] ? { busComponentId: busComponentIds[0] } : {}),
      busComponentIds,
      memberEndpointIds: [...new Set(nodes.flatMap((node) => node.memberEndpointIds ?? []))].sort(),
      sourceDiagramIds: [...new Set(nodes.map((node) => node.sourceDiagramId).filter(Boolean))].sort(),
    };
  });

  const mergedTerminals = terminals.map((terminal) => ({
    ...terminal,
    connectionNodeId: terminal.connectionNodeId
      ? canonicalIdByOriginal.get(terminal.connectionNodeId) ?? terminal.connectionNodeId
      : null,
  }));

  return {
    ...structuredClone(activeSheet.document),
    id: activeSheet.id,
    name: project.name,
    analysisScope: "PROJECT",
    projectId: project.id,
    multiDiagram: true,
    sourceDiagramId: activeSheet.id,
    sourceDiagramIds: sheets.map((sheet) => sheet.id),
    electricalModel: {
      schemaVersion: 2,
      components,
      terminals: mergedTerminals,
      connectionNodes: mergedConnectionNodes,
    },
    projectTopologyIssues: topologyIssues,
    operatingCases: namespaceOperatingCases(activeSheet.document.operatingCases, activeSheet.id),
    analysisConfiguration: structuredClone(activeSheet.document.analysisConfiguration),
  };
}

export function projectDiagramVersions(project) {
  return Object.fromEntries((project?.diagrams ?? []).map((sheet) => [
    sheet.id,
    Number(sheet.storageVersion ?? 0),
  ]));
}

export function remapInternalDiagramReferences(document, sourceDiagramId, targetDiagramId) {
  const clone = structuredClone(document);
  const entities = [
    ...Object.values(clone.nodes ?? {}),
    ...Object.values(clone.edges ?? {}),
  ];
  entities.forEach((entity) => {
    if (!entity.logicalConnections || typeof entity.logicalConnections !== "object") return;
    entity.logicalConnections = Object.fromEntries(
      Object.entries(entity.logicalConnections).map(([terminalKey, rawReference]) => {
        const reference = normalizeLogicalConnectionReference(rawReference);
        if (!reference) return [terminalKey, rawReference];
        return [
          terminalKey,
          reference.diagramId === sourceDiagramId
            ? { ...reference, diagramId: targetDiagramId }
            : reference,
        ];
      }),
    );
  });
  return clone;
}

export function removeLogicalConnectionsToDiagram(document, targetDiagramId) {
  const clone = structuredClone(document);
  let removedCount = 0;
  const entities = [
    ...Object.values(clone.nodes ?? {}),
    ...Object.values(clone.edges ?? {}),
  ];
  entities.forEach((entity) => {
    if (!entity.logicalConnections || typeof entity.logicalConnections !== "object") return;
    const next = {};
    Object.entries(entity.logicalConnections).forEach(([terminalKey, rawReference]) => {
      const reference = normalizeLogicalConnectionReference(rawReference);
      if (reference?.diagramId === targetDiagramId) {
        removedCount += 1;
        return;
      }
      next[terminalKey] = rawReference;
    });
    entity.logicalConnections = next;
  });
  return { document: clone, removedCount };
}
