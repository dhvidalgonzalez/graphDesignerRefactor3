import { getPortWorldPosition } from "../catalog/symbolCatalog.js";
import { getEdgeMiddlePoint } from "../diagram/edgeGeometry.js";
import { analysisTypeLabel } from "./analysisRegistry.js";

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
const compactNumberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2, notation: "compact" });

const GLOBAL_RESULT_SEPARATOR = "::";

export function localAnalysisEntityId(value, diagramId) {
  const normalized = String(value || "");
  const prefix = `${String(diagramId || "")}${GLOBAL_RESULT_SEPARATOR}`;
  if (!prefix || prefix === GLOBAL_RESULT_SEPARATOR) return normalized;
  const index = normalized.indexOf(prefix);
  return index >= 0
    ? `${normalized.slice(0, index)}${normalized.slice(index + prefix.length)}`
    : normalized;
}

export function analysisEntityBelongsToDiagram(value, diagramId) {
  const normalized = String(value || "");
  if (!normalized.includes(GLOBAL_RESULT_SEPARATOR)) return true;
  return normalized.includes(`${String(diagramId || "")}${GLOBAL_RESULT_SEPARATOR}`);
}

function setAlias(map, key, value, diagramId) {
  if (key == null || key === "") return;
  const normalized = String(key);
  map.set(normalized, value);
  const local = localAnalysisEntityId(normalized, diagramId);
  if (local && local !== normalized) map.set(local, value);
}

function componentResultMap(rows, diagramId) {
  const map = new Map();
  rows.forEach((item) => setAlias(map, item.componentId, item, diagramId));
  return map;
}

export const DEFAULT_ANALYSIS_OVERLAY_OPTIONS = Object.freeze({
  visible: true,
  colorBusesByVoltage: true,
  colorBranchesByLoading: true,
  showFlowArrows: true,
  showComponentNames: false,

  showBusVoltagePu: true,
  showBusVoltageKv: true,
  showBusAngleDeg: false,
  showBusStatus: false,

  showBranchActivePower: true,
  showBranchReactivePower: false,
  showBranchCurrent: true,
  showBranchLoading: true,
  showBranchLosses: false,
  showBranchDirection: false,

  showTransformerActivePower: true,
  showTransformerReactivePower: false,
  showTransformerLoading: true,
  showTransformerLosses: false,
  showTransformerTap: false,

  showGeneratorActivePower: true,
  showGeneratorReactivePower: true,
  showLoadActivePower: true,
  showLoadReactivePower: true,
});

export function normalizeAnalysisOverlayOptions(options) {
  const value = options && typeof options === "object" ? options : {};
  return {
    ...DEFAULT_ANALYSIS_OVERLAY_OPTIONS,
    ...value,

    // Compatibilidad con las opciones de las primeras versiones de la capa.
    showBusVoltagePu: value.showBusVoltagePu ?? value.showBusVoltages ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBusVoltagePu,
    showBusVoltageKv: value.showBusVoltageKv ?? value.showBusVoltages ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBusVoltageKv,
    showBusAngleDeg: value.showBusAngleDeg ?? value.showBusAngles ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBusAngleDeg,
    showBusStatus: value.showBusStatus ?? false,

    showBranchActivePower: value.showBranchActivePower ?? value.showActivePowerFlows ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBranchActivePower,
    showBranchReactivePower: value.showBranchReactivePower ?? value.showReactivePowerFlows ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBranchReactivePower,
    showBranchCurrent: value.showBranchCurrent ?? value.showCurrents ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBranchCurrent,
    showBranchLoading: value.showBranchLoading ?? value.showLoading ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBranchLoading,
    showBranchLosses: value.showBranchLosses ?? value.showLosses ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showBranchLosses,

    showTransformerActivePower: value.showTransformerActivePower ?? value.showActivePowerFlows ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showTransformerActivePower,
    showTransformerReactivePower: value.showTransformerReactivePower ?? value.showReactivePowerFlows ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showTransformerReactivePower,
    showTransformerLoading: value.showTransformerLoading ?? value.showLoading ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showTransformerLoading,
    showTransformerLosses: value.showTransformerLosses ?? value.showLosses ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showTransformerLosses,

    showGeneratorActivePower: value.showGeneratorActivePower ?? value.showEquipmentPower ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showGeneratorActivePower,
    showGeneratorReactivePower: value.showGeneratorReactivePower ?? value.showEquipmentPower ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showGeneratorReactivePower,
    showLoadActivePower: value.showLoadActivePower ?? value.showEquipmentPower ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showLoadActivePower,
    showLoadReactivePower: value.showLoadReactivePower ?? value.showEquipmentPower ?? DEFAULT_ANALYSIS_OVERLAY_OPTIONS.showLoadReactivePower,
  };
}


function networkShape(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...source,
    summary: source.summary && typeof source.summary === "object" ? source.summary : {},
    convergence: source.convergence && typeof source.convergence === "object" ? source.convergence : {},
    buses: Array.isArray(source.buses) ? source.buses : [],
    branches: Array.isArray(source.branches) ? source.branches : [],
    transformers: Array.isArray(source.transformers) ? source.transformers : [],
    generators: Array.isArray(source.generators) ? source.generators : [],
    loads: Array.isArray(source.loads) ? source.loads : [],
    shunts: Array.isArray(source.shunts) ? source.shunts : [],
    switches: Array.isArray(source.switches) ? source.switches : [],
    warnings: Array.isArray(source.warnings) ? source.warnings : [],
  };
}

export function normalizeAnalysisResult(result) {
  const value = result && typeof result === "object" ? result : {};
  return {
    ...value,
    analysisType: String(value.analysisType || "POWER_FLOW").toUpperCase(),
    summary: value.summary && typeof value.summary === "object" ? value.summary : {},
    convergence: value.convergence && typeof value.convergence === "object" ? value.convergence : {},
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
    buses: Array.isArray(value.buses) ? value.buses : [],
    branches: Array.isArray(value.branches) ? value.branches : [],
    transformers: Array.isArray(value.transformers) ? value.transformers : [],
    generators: Array.isArray(value.generators) ? value.generators : [],
    loads: Array.isArray(value.loads) ? value.loads : [],
    shunts: Array.isArray(value.shunts) ? value.shunts : [],
    switches: Array.isArray(value.switches) ? value.switches : [],
    contingencies: Array.isArray(value.contingencies) ? value.contingencies : [],
    cases: Array.isArray(value.cases) ? value.cases : [],
    steps: Array.isArray(value.steps) ? value.steps : [],
  };
}

export function parseAnalysisResultText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("El archivo result.json no contiene JSON válido.");
  }
  const result = normalizeAnalysisResult(parsed);
  if (!result.studyId || !result.diagramId) {
    throw new Error("El resultado no contiene studyId o diagramId.");
  }
  return result;
}

export function analysisResultViews(rawResult) {
  const result = normalizeAnalysisResult(rawResult);
  if (result.analysisType === "CONTINGENCY_N_1") {
    return [
      ...(result.baseCase ? [{ id: "base", label: "Caso base", description: "Red sin contingencia", networkResult: networkShape(result.baseCase) }] : []),
      ...result.contingencies
        .filter((item) => item?.networkResult)
        .map((item) => ({
          id: `contingency:${item.componentId}`,
          label: `Salida ${item.componentId}`,
          description: `${item.componentKind || "Elemento"} · ${item.status || ""}`,
          networkResult: networkShape(item.networkResult),
          source: item,
        })),
    ];
  }
  if (result.analysisType === "OPERATING_CASE_SWEEP") {
    return result.cases
      .filter((item) => item?.networkResult)
      .map((item) => ({
        id: `case:${item.operatingCaseId}`,
        label: item.name || item.operatingCaseId,
        description: item.status || "Caso de operación",
        networkResult: networkShape(item.networkResult),
        source: item,
      }));
  }
  if (result.analysisType === "LOADABILITY") {
    return [
      ...(result.lastAcceptableResult ? [{
        id: "last-acceptable",
        label: `Último aceptable · ×${formatResultNumber(result.summary?.lastAcceptableMultiplier, 3)}`,
        description: "Último punto sin violaciones",
        networkResult: networkShape(result.lastAcceptableResult),
      }] : []),
      ...(result.limitingResult ? [{
        id: "limiting",
        label: `Punto limitante · ×${formatResultNumber(result.summary?.firstViolationMultiplier, 3)}`,
        description: result.summary?.limitingCondition || "Primera violación",
        networkResult: networkShape(result.limitingResult),
      }] : []),
    ];
  }
  return [{
    id: "network",
    label: analysisTypeLabel(result.analysisType),
    description: result.operatingCaseId || "Resultado de red",
    networkResult: networkShape(result),
  }];
}

export function defaultAnalysisResultViewId(result) {
  const views = analysisResultViews(result);
  if (!views.length) return null;
  if (normalizeAnalysisResult(result).analysisType === "LOADABILITY") {
    return views.find((item) => item.id === "last-acceptable")?.id ?? views[0].id;
  }
  return views[0].id;
}

export function getAnalysisResultView(result, viewId) {
  const views = analysisResultViews(result);
  return views.find((item) => item.id === viewId) ?? views[0] ?? null;
}

export function getAnalysisNetworkResult(result, viewId) {
  return getAnalysisResultView(result, viewId)?.networkResult ?? networkShape(null);
}

export function createAnalysisResultIndex(document, rawResult, viewId) {
  const result = getAnalysisNetworkResult(rawResult, viewId);
  const diagramId = document?.id;
  const model = document.electricalModel ?? { components: [], terminals: [], connectionNodes: [] };
  const connectionNodes = Array.isArray(model.connectionNodes) ? model.connectionNodes : [];
  const terminals = Array.isArray(model.terminals) ? model.terminals : [];
  const connectionNodeById = new Map();
  const connectionNodeByBusComponentId = new Map();

  connectionNodes.forEach((item) => {
    setAlias(connectionNodeById, item.id, item, diagramId);
    if (diagramId) setAlias(connectionNodeById, `${diagramId}::${item.id}`, item, diagramId);
    if (item.busComponentId) {
      setAlias(connectionNodeByBusComponentId, item.busComponentId, item, diagramId);
      if (diagramId) {
        setAlias(
          connectionNodeByBusComponentId,
          `${diagramId}::${item.busComponentId}`,
          item,
          diagramId,
        );
        setAlias(
          connectionNodeById,
          `cn-${diagramId}::${item.busComponentId}`,
          item,
          diagramId,
        );
      }
    }
  });

  const terminalConnectionByComponentId = new Map();
  terminals.forEach((terminal) => {
    const componentIds = new Set([
      String(terminal.componentId || ""),
      localAnalysisEntityId(terminal.componentId, diagramId),
      ...(diagramId ? [`${diagramId}::${terminal.componentId}`] : []),
    ].filter(Boolean));
    componentIds.forEach((componentId) => {
      if (!terminalConnectionByComponentId.has(componentId)) {
        terminalConnectionByComponentId.set(componentId, []);
      }
      const current = terminalConnectionByComponentId.get(componentId);
      const candidates = [
        terminal.connectionNodeId,
        localAnalysisEntityId(terminal.connectionNodeId, diagramId),
        ...(diagramId && terminal.connectionNodeId
          ? [`${diagramId}::${terminal.connectionNodeId}`]
          : []),
      ].filter(Boolean);
      candidates.forEach((connectionNodeId) => {
        if (!current.includes(connectionNodeId)) current.push(connectionNodeId);
      });
    });
  });

  const busByConnectionNodeId = new Map();
  const busByBusId = new Map();
  result.buses.forEach((item) => {
    const connectionIdentifiers = [
      item.connectionNodeId,
      item.id,
    ];
    connectionIdentifiers.forEach((identifier) => {
      setAlias(busByConnectionNodeId, identifier, item, diagramId);
    });

    const busIdentifiers = [
      item.busId,
      item.busComponentId,
      ...(Array.isArray(item.busComponentIds) ? item.busComponentIds : []),
    ];
    busIdentifiers.forEach((identifier) => {
      setAlias(busByBusId, identifier, item, diagramId);
    });
  });

  const visualModel = rawResult?.visualElectricalModel;
  const visualConnectionNodes = Array.isArray(visualModel?.connectionNodes)
    ? visualModel.connectionNodes
    : [];
  visualConnectionNodes.forEach((visualNode) => {
    const identifiers = [
      visualNode.id,
      visualNode.busComponentId,
      ...(Array.isArray(visualNode.busComponentIds) ? visualNode.busComponentIds : []),
    ].filter(Boolean);
    const busResult = identifiers.reduce((found, identifier) => (
      found
      ?? busByConnectionNodeId.get(identifier)
      ?? busByBusId.get(identifier)
    ), null);
    if (!busResult) return;

    setAlias(busByConnectionNodeId, visualNode.id, busResult, diagramId);
    identifiers.forEach((identifier) => setAlias(busByBusId, identifier, busResult, diagramId));

    const activeBusComponentId = identifiers
      .map((identifier) => localAnalysisEntityId(identifier, diagramId))
      .find((identifier) => Boolean(document.nodes?.[identifier]));
    if (!activeBusComponentId) return;
    const localConnectionNode = connectionNodeByBusComponentId.get(activeBusComponentId);
    if (!localConnectionNode) return;
    setAlias(connectionNodeById, visualNode.id, localConnectionNode, diagramId);
    setAlias(busByConnectionNodeId, localConnectionNode.id, busResult, diagramId);
    setAlias(busByBusId, activeBusComponentId, busResult, diagramId);
  });

  return {
    result,
    diagramId,
    connectionNodeById,
    connectionNodeByBusComponentId,
    terminalConnectionByComponentId,
    busByConnectionNodeId,
    busByBusId,
    branchByComponentId: componentResultMap(result.branches, diagramId),
    transformerByComponentId: componentResultMap(result.transformers, diagramId),
    generatorByComponentId: componentResultMap(result.generators, diagramId),
    loadByComponentId: componentResultMap(result.loads, diagramId),
    shuntByComponentId: componentResultMap(result.shunts, diagramId),
    switchByComponentId: componentResultMap(result.switches, diagramId),
  };
}

function busResultForConnectionNode(index, connectionNodeId) {
  if (!connectionNodeId) return null;
  const connectionNode = index.connectionNodeById.get(connectionNodeId);
  return index.busByConnectionNodeId.get(connectionNodeId)
    ?? index.busByBusId.get(connectionNodeId)
    ?? (connectionNode?.busComponentId ? index.busByBusId.get(connectionNode.busComponentId) : null)
    ?? null;
}

export function getBusResultForNode(index, nodeId) {
  const explicitConnectionNode = index.connectionNodeByBusComponentId.get(nodeId);
  const explicit = busResultForConnectionNode(index, explicitConnectionNode?.id);
  if (explicit) return explicit;
  const connectionNodeIds = index.terminalConnectionByComponentId.get(nodeId) ?? [];
  for (const connectionNodeId of connectionNodeIds) {
    const found = busResultForConnectionNode(index, connectionNodeId);
    if (found) return found;
  }
  return index.busByBusId.get(nodeId) ?? null;
}

export function getBusResultsForComponent(index, componentId) {
  if (!index || !componentId) return [];
  const connectionNodeIds = index.terminalConnectionByComponentId.get(componentId) ?? [];
  const unique = new Map();
  connectionNodeIds.forEach((connectionNodeId) => {
    const result = busResultForConnectionNode(index, connectionNodeId);
    if (result) unique.set(result.connectionNodeId || result.busId, result);
  });
  return [...unique.values()];
}

export function getEntityAnalysisResult(index, kind, entityId) {
  if (!index || !entityId) return null;
  if (kind === "edge") return index.branchByComponentId.get(entityId) ?? null;
  return index.transformerByComponentId.get(entityId)
    ?? index.generatorByComponentId.get(entityId)
    ?? index.loadByComponentId.get(entityId)
    ?? index.shuntByComponentId.get(entityId)
    ?? index.switchByComponentId.get(entityId)
    ?? getBusResultForNode(index, entityId)
    ?? null;
}

function averagePoints(points) {
  if (!points.length) return null;
  return {
    x: points.reduce((sum, item) => sum + item.x, 0) / points.length,
    y: points.reduce((sum, item) => sum + item.y, 0) / points.length,
  };
}

export function getConnectionNodePosition(document, index, connectionNodeId, busId) {
  const localConnectionNodeId = localAnalysisEntityId(connectionNodeId, document?.id);
  const localBusId = localAnalysisEntityId(busId, document?.id);
  const connectionNode = index.connectionNodeById.get(connectionNodeId)
    ?? index.connectionNodeById.get(localConnectionNodeId)
    ?? index.connectionNodeById.get(busId)
    ?? index.connectionNodeById.get(localBusId)
    ?? index.connectionNodeByBusComponentId.get(busId)
    ?? index.connectionNodeByBusComponentId.get(localBusId);
  const localBusComponentId = localAnalysisEntityId(
    connectionNode?.busComponentId,
    document?.id,
  );
  if (localBusComponentId && document.nodes?.[localBusComponentId]) {
    return {
      ...document.nodes[localBusComponentId].position,
      visualNodeId: localBusComponentId,
    };
  }
  if (document.nodes?.[localBusId]) {
    return { ...document.nodes[localBusId].position, visualNodeId: localBusId };
  }
  const memberEndpointIds = connectionNode?.memberEndpointIds ?? [];
  const points = memberEndpointIds.flatMap((endpointId) => {
    const localEndpointId = localAnalysisEntityId(endpointId, document?.id);
    const separator = localEndpointId.indexOf("::");
    if (separator < 0) return [];
    const nodeId = localEndpointId.slice(0, separator);
    const portId = localEndpointId.slice(separator + 2);
    const node = document.nodes?.[nodeId];
    if (!node) return [];
    try { return [getPortWorldPosition(node, portId)]; } catch { return []; }
  });
  return averagePoints(points);
}

export function getBranchPosition(document, componentId) {
  const localId = localAnalysisEntityId(componentId, document?.id);
  const edge = document.edges?.[localId];
  return edge ? getEdgeMiddlePoint(document, edge) : null;
}

export function getEquipmentPosition(document, componentId) {
  const localId = localAnalysisEntityId(componentId, document?.id);
  return document.nodes?.[localId]?.position ?? null;
}

export function voltagePuColor(value, status = "NORMAL") {
  if (status === "DEENERGIZED" || !Number.isFinite(Number(value))) return "#64748b";
  const voltage = Number(value);
  if (voltage <= 0.90) return "#dc2626";
  if (voltage < 0.95) return "#f97316";
  if (voltage < 0.98) return "#eab308";
  if (voltage <= 1.02) return "#16a34a";
  if (voltage <= 1.05) return "#0284c7";
  if (voltage <= 1.10) return "#7c3aed";
  return "#be123c";
}

export function loadingColor(value, status = "NORMAL") {
  if (status === "OUT_OF_SERVICE") return "#94a3b8";
  const loading = Number(value);
  if (!Number.isFinite(loading)) return "#64748b";
  if (loading < 70) return "#16a34a";
  if (loading < 90) return "#ca8a04";
  if (loading <= 100) return "#ea580c";
  return "#dc2626";
}

export function formatResultNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: digits }).format(number);
}
export function formatPowerKw(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Math.abs(number) >= 1000 ? `${numberFormatter.format(number / 1000)} MW` : `${numberFormatter.format(number)} kW`;
}
export function formatReactivePowerKvar(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Math.abs(number) >= 1000 ? `${numberFormatter.format(number / 1000)} MVAr` : `${numberFormatter.format(number)} kVAr`;
}
export function formatCurrentA(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${numberFormatter.format(number)} A` : "—";
}
export function formatCompactValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? compactNumberFormatter.format(number) : "—";
}

export function branchFlowArrowSegment(points, direction) {
  if (!Array.isArray(points) || points.length < 2 || direction === "NONE") return null;
  const pairs = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length > 0.01) pairs.push({ start, end, length });
  }
  if (!pairs.length) return null;
  const segment = pairs.sort((left, right) => right.length - left.length)[0];
  const centerX = (segment.start.x + segment.end.x) / 2;
  const centerY = (segment.start.y + segment.end.y) / 2;
  const ux = (segment.end.x - segment.start.x) / segment.length;
  const uy = (segment.end.y - segment.start.y) / segment.length;
  const half = Math.min(6, segment.length * 0.28);
  let start = { x: centerX - ux * half, y: centerY - uy * half };
  let end = { x: centerX + ux * half, y: centerY + uy * half };
  if (direction === "TO_FROM") [start, end] = [end, start];
  return { start, end };
}

export function resultMetricRows(result, category, viewId) {
  return getAnalysisNetworkResult(result, viewId)[category] ?? [];
}
