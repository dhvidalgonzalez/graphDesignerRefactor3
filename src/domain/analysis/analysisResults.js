import { getPortWorldPosition } from "../catalog/symbolCatalog.js";
import { getEdgeMiddlePoint } from "../diagram/edgeGeometry.js";
import { analysisTypeLabel } from "./analysisRegistry.js";

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
const compactNumberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2, notation: "compact" });

export const DEFAULT_ANALYSIS_OVERLAY_OPTIONS = Object.freeze({
  visible: true,
  colorBusesByVoltage: true,
  colorBranchesByLoading: true,
  showBusVoltages: true,
  showBusAngles: true,
  showActivePowerFlows: true,
  showReactivePowerFlows: false,
  showCurrents: true,
  showLosses: false,
  showLoading: true,
  showFlowArrows: true,
  showEquipmentPower: true,
  labelsCompact: true,
});

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
  const model = document.electricalModel ?? { components: [], terminals: [], connectionNodes: [] };
  const connectionNodes = Array.isArray(model.connectionNodes) ? model.connectionNodes : [];
  const terminals = Array.isArray(model.terminals) ? model.terminals : [];
  const connectionNodeById = new Map(connectionNodes.map((item) => [item.id, item]));
  const connectionNodeByBusComponentId = new Map(
    connectionNodes.filter((item) => item.busComponentId).map((item) => [item.busComponentId, item]),
  );
  const terminalConnectionByComponentId = new Map();
  terminals.forEach((terminal) => {
    if (!terminalConnectionByComponentId.has(terminal.componentId)) terminalConnectionByComponentId.set(terminal.componentId, []);
    terminalConnectionByComponentId.get(terminal.componentId).push(terminal.connectionNodeId);
  });
  const busByConnectionNodeId = new Map();
  const busByBusId = new Map();
  result.buses.forEach((item) => {
    if (item.connectionNodeId) busByConnectionNodeId.set(item.connectionNodeId, item);
    if (item.busId) busByBusId.set(item.busId, item);
  });
  return {
    result,
    connectionNodeById,
    connectionNodeByBusComponentId,
    terminalConnectionByComponentId,
    busByConnectionNodeId,
    busByBusId,
    branchByComponentId: new Map(result.branches.map((item) => [item.componentId, item])),
    transformerByComponentId: new Map(result.transformers.map((item) => [item.componentId, item])),
    generatorByComponentId: new Map(result.generators.map((item) => [item.componentId, item])),
    loadByComponentId: new Map(result.loads.map((item) => [item.componentId, item])),
    shuntByComponentId: new Map(result.shunts.map((item) => [item.componentId, item])),
    switchByComponentId: new Map(result.switches.map((item) => [item.componentId, item])),
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
  const connectionNode = index.connectionNodeById.get(connectionNodeId)
    ?? index.connectionNodeById.get(busId)
    ?? index.connectionNodeByBusComponentId.get(busId);
  if (connectionNode?.busComponentId && document.nodes?.[connectionNode.busComponentId]) {
    return { ...document.nodes[connectionNode.busComponentId].position, visualNodeId: connectionNode.busComponentId };
  }
  if (document.nodes?.[busId]) return { ...document.nodes[busId].position, visualNodeId: busId };
  const memberEndpointIds = connectionNode?.memberEndpointIds ?? [];
  const points = memberEndpointIds.flatMap((endpointId) => {
    const separator = endpointId.indexOf("::");
    if (separator < 0) return [];
    const nodeId = endpointId.slice(0, separator);
    const portId = endpointId.slice(separator + 2);
    const node = document.nodes?.[nodeId];
    if (!node) return [];
    try { return [getPortWorldPosition(node, portId)]; } catch { return []; }
  });
  return averagePoints(points);
}

export function getBranchPosition(document, componentId) {
  const edge = document.edges?.[componentId];
  return edge ? getEdgeMiddlePoint(document, edge) : null;
}

export function getEquipmentPosition(document, componentId) {
  return document.nodes?.[componentId]?.position ?? null;
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
