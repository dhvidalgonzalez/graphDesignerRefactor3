import { getNodePorts, getNodePortVoltageLevelId, getVoltagePropertyForPort, setNodePortVoltageLevelId, isVoltageBoundary } from "../catalog/symbolCatalog.js";
import { createParameterMetadata } from "./parameterValue.js";

export function endpointKey(endpoint) {
  return `${endpoint.nodeId}::${String(endpoint.portId)}`;
}

export function endpointFromKey(key) {
  const separator = key.indexOf("::");
  return { nodeId: key.slice(0, separator), portId: key.slice(separator + 2) };
}

function addNeighbor(adjacency, a, b) {
  if (!adjacency.has(a)) adjacency.set(a, new Set());
  if (!adjacency.has(b)) adjacency.set(b, new Set());
  adjacency.get(a).add(b);
  adjacency.get(b).add(a);
}

export function buildElectricalAdjacency(diagram, { excludedEdgeId = null } = {}) {
  const adjacency = new Map();

  Object.values(diagram.nodes).forEach((node) => {
    const portKeys = getNodePorts(node).map((port) => endpointKey({ nodeId: node.id, portId: port.id }));
    portKeys.forEach((key) => {
      if (!adjacency.has(key)) adjacency.set(key, new Set());
    });
    if (!isVoltageBoundary(node) && portKeys.length > 1) {
      const anchor = portKeys[0];
      portKeys.slice(1).forEach((key) => addNeighbor(adjacency, anchor, key));
    }
  });

  Object.values(diagram.edges).forEach((edge) => {
    if (edge.id === excludedEdgeId) return;
    const sourceKey = endpointKey(edge.source);
    const targetKey = endpointKey(edge.target);
    addNeighbor(adjacency, sourceKey, targetKey);
  });

  return adjacency;
}

export function getElectricalIsland(diagram, seed, options) {
  const seedKey = endpointKey(seed);
  const adjacency = buildElectricalAdjacency(diagram, options);
  const visited = new Set();
  const pending = [seedKey];

  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    adjacency.get(current)?.forEach((neighbor) => {
      if (!visited.has(neighbor)) pending.push(neighbor);
    });
  }

  return visited;
}

export function getIslandVoltageSummary(diagram, island) {
  const counts = new Map();
  island.forEach((key) => {
    const endpoint = endpointFromKey(key);
    const node = diagram.nodes[endpoint.nodeId];
    if (!node) return;
    const levelId = getNodePortVoltageLevelId(node, endpoint.portId);
    if (levelId) counts.set(levelId, (counts.get(levelId) ?? 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    dominantLevelId: ranked[0]?.[0] ?? null,
    counts,
    size: island.size,
  };
}

export function assignVoltageToIsland(diagram, seed, levelId) {
  if (!levelId) return new Set();
  const island = getElectricalIsland(diagram, seed);
  island.forEach((key) => {
    const endpoint = endpointFromKey(key);
    const node = diagram.nodes[endpoint.nodeId];
    if (node) {
      const propertyKey = getVoltagePropertyForPort(node, endpoint.portId);
      setNodePortVoltageLevelId(node, endpoint.portId, levelId);
      node.parameterMetadata = {
        ...(node.parameterMetadata ?? {}),
        [propertyKey]: createParameterMetadata({ source: "CALCULATED", status: "ASSUMED" }, levelId),
      };
    }
  });

  Object.values(diagram.edges).forEach((edge) => {
    if (island.has(endpointKey(edge.source)) && island.has(endpointKey(edge.target))) {
      edge.properties = { ...edge.properties, voltageLevelId: levelId };
      edge.parameterMetadata = {
        ...(edge.parameterMetadata ?? {}),
        voltageLevelId: createParameterMetadata({ source: "CALCULATED", status: "ASSUMED" }, levelId),
      };
    }
  });
  return island;
}

export function chooseVoltageForConnection(diagram, source, target, { excludedEdgeId = null } = {}) {
  const sourceIsland = getElectricalIsland(diagram, source, { excludedEdgeId });
  const targetIsland = getElectricalIsland(diagram, target, { excludedEdgeId });
  const sourceSummary = getIslandVoltageSummary(diagram, sourceIsland);
  const targetSummary = getIslandVoltageSummary(diagram, targetIsland);
  const sourceLevelId = sourceSummary.dominantLevelId;
  const targetLevelId = targetSummary.dominantLevelId;

  if (!sourceLevelId && !targetLevelId) return { levelId: null, conflict: false, sourceSummary, targetSummary };
  if (!sourceLevelId) return { levelId: targetLevelId, conflict: false, sourceSummary, targetSummary };
  if (!targetLevelId) return { levelId: sourceLevelId, conflict: false, sourceSummary, targetSummary };
  if (sourceLevelId === targetLevelId) return { levelId: sourceLevelId, conflict: false, sourceSummary, targetSummary };

  const levelId = sourceSummary.size >= targetSummary.size ? sourceLevelId : targetLevelId;
  return {
    levelId,
    conflict: true,
    replacedLevelId: levelId === sourceLevelId ? targetLevelId : sourceLevelId,
    sourceSummary,
    targetSummary,
  };
}

export function propagateConnectionVoltage(diagram, edge) {
  const decision = chooseVoltageForConnection(diagram, edge.source, edge.target, { excludedEdgeId: edge.id });
  if (decision.levelId) assignVoltageToIsland(diagram, edge.source, decision.levelId);
  return decision;
}

export function getEndpointVoltageLevelId(diagram, endpoint) {
  const node = diagram.nodes[endpoint.nodeId];
  return node ? getNodePortVoltageLevelId(node, endpoint.portId) : null;
}
