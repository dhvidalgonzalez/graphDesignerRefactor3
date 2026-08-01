import { buildElectricalModel } from "../electrical/electricalModel.js";
import { applyOperatingCaseToComponent, getOperatingCase } from "./operatingCases.js";

const CONDUCTING_KINDS = new Set(["LINE", "TRANSFORMER_2W", "TRANSFORMER_3W"]);
const ENERGIZED_KINDS = new Set(["LOAD", "GENERATOR", "EXTERNAL_GRID", "SHUNT"]);

function parameterValue(component, key) {
  return component?.parameters?.[key]?.value;
}

export function analysisComponentInService(component) {
  if (component?.operatingState?.inService !== undefined) {
    return Boolean(component.operatingState.inService);
  }
  if (component?.inService !== undefined) return Boolean(component.inService);
  return !Boolean(parameterValue(component, "outOfService"));
}

export function analysisSwitchClosed(component) {
  if (!analysisComponentInService(component)) return false;
  if (component?.operatingState?.switchClosed !== undefined) {
    return Boolean(component.operatingState.switchClosed);
  }
  return String(parameterValue(component, "state") ?? "CLOSED").toUpperCase() !== "OPEN";
}

export function isAnalysisSlack(component) {
  if (!analysisComponentInService(component)) return false;
  if (component?.kind === "EXTERNAL_GRID") return true;
  if (component?.kind !== "GENERATOR") return false;
  const controlMode = String(parameterValue(component, "controlMode") ?? "").toUpperCase();
  const sourceType = String(parameterValue(component, "sourceType") ?? "").toUpperCase();
  return controlMode === "SLACK" || sourceType === "EXTERNAL_GRID";
}

function terminalsByComponent(model) {
  return (model.terminals ?? []).reduce((groups, terminal) => {
    groups.set(terminal.componentId, [...(groups.get(terminal.componentId) ?? []), terminal]);
    return groups;
  }, new Map());
}

function componentNodeIds(component, groupedTerminals) {
  return [...new Set(
    (groupedTerminals.get(component.id) ?? [])
      .map((terminal) => terminal.connectionNodeId)
      .filter(Boolean),
  )];
}

function componentConducts(component) {
  if (!analysisComponentInService(component)) return false;
  if (CONDUCTING_KINDS.has(component.kind)) return true;
  return component.kind === "SWITCH" && analysisSwitchClosed(component);
}

function buildAdjacency(model, groupedTerminals) {
  const nodeIds = (model.connectionNodes ?? []).map((node) => node.id);
  const adjacency = new Map(nodeIds.map((id) => [id, new Set()]));

  (model.components ?? []).filter(componentConducts).forEach((component) => {
    const ids = componentNodeIds(component, groupedTerminals);
    ids.forEach((from) => ids.forEach((to) => {
      if (from !== to) adjacency.get(from)?.add(to);
    }));
  });

  return adjacency;
}

function collectReachable(adjacency, seeds) {
  const reachable = new Set();
  const pending = [...seeds];
  while (pending.length) {
    const current = pending.pop();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    adjacency.get(current)?.forEach((next) => pending.push(next));
  }
  return reachable;
}

function buildIslands(model, adjacency, groupedTerminals) {
  const islandByNode = new Map();
  const islands = [];

  (model.connectionNodes ?? []).forEach((node) => {
    if (islandByNode.has(node.id)) return;
    const id = `island-${islands.length + 1}`;
    const nodeIds = collectReachable(adjacency, [node.id]);
    nodeIds.forEach((nodeId) => islandByNode.set(nodeId, id));
    islands.push({
      id,
      nodeIds,
      componentIds: new Set(),
      slackIds: new Set(),
      energized: false,
    });
  });

  const islandById = new Map(islands.map((island) => [island.id, island]));
  (model.components ?? []).filter(analysisComponentInService).forEach((component) => {
    const ids = componentNodeIds(component, groupedTerminals);
    ids.forEach((nodeId) => {
      const island = islandById.get(islandByNode.get(nodeId));
      if (!island) return;
      island.componentIds.add(component.id);
      island.energized ||= ENERGIZED_KINDS.has(component.kind);
      if (isAnalysisSlack(component)) island.slackIds.add(component.id);
    });
  });

  return islands;
}

function includeComponent(component, groupedTerminals, reachableNodeIds) {
  if (!analysisComponentInService(component)) return false;
  const nodeIds = componentNodeIds(component, groupedTerminals);
  if (!nodeIds.length) return false;
  if (CONDUCTING_KINDS.has(component.kind)) {
    return nodeIds.every((nodeId) => reachableNodeIds.has(nodeId));
  }
  if (component.kind === "SWITCH") {
    return nodeIds.every((nodeId) => reachableNodeIds.has(nodeId));
  }
  return nodeIds.some((nodeId) => reachableNodeIds.has(nodeId));
}

function sourceLocalId(component) {
  return String(
    component?.sourceEntity?.localId
    || component?.sourceEntity?.id
    || component?.id
    || "",
  );
}

export function applyOperatingCaseToElectricalModel(model, operatingCase) {
  return {
    ...structuredClone(model),
    components: (model.components ?? []).map((component) => {
      const applied = applyOperatingCaseToComponent(component, operatingCase);
      return { ...applied, inService: analysisComponentInService(applied) };
    }),
  };
}

export function scopeElectricalModelToSlack(model) {
  const cloned = structuredClone(model ?? { components: [], terminals: [], connectionNodes: [] });
  const groupedTerminals = terminalsByComponent(cloned);
  const adjacency = buildAdjacency(cloned, groupedTerminals);
  const slackComponents = (cloned.components ?? []).filter(isAnalysisSlack);
  const slackNodeIds = new Set(
    slackComponents.flatMap((component) => componentNodeIds(component, groupedTerminals)),
  );
  const reachableNodeIds = collectReachable(adjacency, slackNodeIds);
  const islands = buildIslands(cloned, adjacency, groupedTerminals);

  const includedComponentIds = new Set(
    (cloned.components ?? [])
      .filter((component) => includeComponent(component, groupedTerminals, reachableNodeIds))
      .map((component) => component.id),
  );
  const excludedComponentIds = new Set(
    (cloned.components ?? [])
      .filter((component) => !includedComponentIds.has(component.id))
      .map((component) => component.id),
  );
  const excludedConnectionNodeIds = new Set(
    (cloned.connectionNodes ?? [])
      .filter((node) => !reachableNodeIds.has(node.id))
      .map((node) => node.id),
  );

  const excludedIslands = islands.filter((island) => !island.slackIds.size && island.componentIds.size);
  const warnings = excludedIslands.map((island) => ({
    code: "ISLAND_EXCLUDED_FROM_ANALYSIS",
    message: `La ${island.id} no tiene referencia Slack y será excluida del estudio (${island.componentIds.size} componente(s)).`,
    islandId: island.id,
    componentIds: [...island.componentIds].sort(),
    connectionNodeIds: [...island.nodeIds].sort(),
  }));

  const electricalModel = slackNodeIds.size
    ? {
        ...cloned,
        components: (cloned.components ?? []).filter((component) => includedComponentIds.has(component.id)),
        terminals: (cloned.terminals ?? []).filter((terminal) => (
          includedComponentIds.has(terminal.componentId)
          && Boolean(terminal.connectionNodeId)
          && reachableNodeIds.has(terminal.connectionNodeId)
        )),
        connectionNodes: (cloned.connectionNodes ?? []).filter((node) => reachableNodeIds.has(node.id)),
      }
    : cloned;

  return {
    electricalModel,
    warnings,
    hasSlackReference: slackNodeIds.size > 0,
    slackComponentIds: new Set(slackComponents.map((component) => component.id)),
    reachableConnectionNodeIds: reachableNodeIds,
    includedComponentIds,
    excludedComponentIds,
    excludedConnectionNodeIds,
    excludedIslands,
  };
}

export function createAnalysisTopologyScope(document, operatingCaseId) {
  const operatingCase = getOperatingCase(document, operatingCaseId);
  const baseModel = document?.analysisScope === "PROJECT" && document?.electricalModel
    ? structuredClone(document.electricalModel)
    : buildElectricalModel(document);
  const appliedModel = applyOperatingCaseToElectricalModel(baseModel, operatingCase);
  return {
    operatingCase,
    appliedModel,
    ...scopeElectricalModelToSlack(appliedModel),
  };
}

export function getDiagramEnergizationState(
  document,
  operatingCaseId,
  sourceDiagramId = document?.sourceDiagramId ?? document?.id,
) {
  const scope = createAnalysisTopologyScope(document, operatingCaseId);
  const electricalNodeIds = new Set();
  const electricalEdgeIds = new Set();
  const deenergizedNodeIds = new Set();
  const deenergizedEdgeIds = new Set();

  (scope.appliedModel.components ?? []).forEach((component) => {
    const componentDiagramId = component?.sourceEntity?.diagramId;
    if (componentDiagramId && sourceDiagramId && componentDiagramId !== sourceDiagramId) return;
    const localId = sourceLocalId(component);
    if (!localId) return;
    const isEdge = component?.sourceEntity?.type === "EDGE";
    if (isEdge) electricalEdgeIds.add(localId);
    else electricalNodeIds.add(localId);

    if (!scope.includedComponentIds.has(component.id)) {
      if (isEdge) deenergizedEdgeIds.add(localId);
      else deenergizedNodeIds.add(localId);
    }
  });

  const connectionNodeByEndpoint = new Map();
  (scope.appliedModel.connectionNodes ?? []).forEach((connectionNode) => {
    (connectionNode.memberEndpointIds ?? []).forEach((endpointId) => {
      connectionNodeByEndpoint.set(String(endpointId), connectionNode.id);
    });
  });
  const endpointKeys = (endpoint) => {
    const localKey = `${endpoint?.nodeId ?? ""}::${String(endpoint?.portId ?? "")}`;
    return sourceDiagramId ? [localKey, `${sourceDiagramId}::${localKey}`] : [localKey];
  };
  const connectionNodeForEndpoint = (endpoint) => endpointKeys(endpoint)
    .map((key) => connectionNodeByEndpoint.get(key))
    .find(Boolean);
  Object.values(document?.edges ?? {})
    .filter((edge) => edge.kind === "path")
    .forEach((edge) => {
      const sourceConnectionNodeId = connectionNodeForEndpoint(edge.source);
      const targetConnectionNodeId = connectionNodeForEndpoint(edge.target);
      const isDeenergized = Boolean(edge.properties?.outOfService)
        || (sourceConnectionNodeId && scope.excludedConnectionNodeIds.has(sourceConnectionNodeId))
        || (targetConnectionNodeId && scope.excludedConnectionNodeIds.has(targetConnectionNodeId));
      if (isDeenergized) deenergizedEdgeIds.add(edge.id);
    });

  return {
    ...scope,
    electricalNodeIds,
    electricalEdgeIds,
    deenergizedNodeIds,
    deenergizedEdgeIds,
  };
}
