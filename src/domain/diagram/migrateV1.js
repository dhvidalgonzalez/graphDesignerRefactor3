import { createEmptyDiagram, createEdge, createNode, applyDefaultNodeVoltageLevels } from "./createDiagram.js";
import { ensureVoltageLevel, voltageLevelsFromLegacyColors, findVoltageLevelByValue } from "../electrical/voltageLevels.js";

const VOLTAGE_KEYS = ["voltageLevel", "voltageLevel1", "voltageLevel2", "voltageLevel3"];

function nodeValues(candidate) {
  return Array.isArray(candidate.nodes) ? candidate.nodes : Object.values(candidate.nodes ?? {});
}

function edgeValues(candidate) {
  return Array.isArray(candidate.edges) ? candidate.edges : Object.values(candidate.edges ?? {});
}

function collectVoltageValues(candidate) {
  const values = new Set();
  nodeValues(candidate).forEach((node) => {
    const properties = node.properties ?? node.attributes ?? {};
    VOLTAGE_KEYS.forEach((key) => {
      const value = properties[key];
      if (value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value))) values.add(Number(value));
    });
  });
  return [...values];
}

function levelIdForValue(document, value) {
  if (value === undefined || value === null || value === "") return null;
  return findVoltageLevelByValue(document.metadata, value)?.id ?? ensureVoltageLevel(document, { value }).id;
}

function migrateNodeProperties(document, raw) {
  const properties = { ...(raw.properties ?? raw.attributes ?? {}) };
  if (properties.voltageLevel !== undefined) properties.voltageLevelId = levelIdForValue(document, properties.voltageLevel);
  if (properties.voltageLevel1 !== undefined) properties.voltageLevelId1 = levelIdForValue(document, properties.voltageLevel1);
  if (properties.voltageLevel2 !== undefined) properties.voltageLevelId2 = levelIdForValue(document, properties.voltageLevel2);
  if (properties.voltageLevel3 !== undefined) properties.voltageLevelId3 = levelIdForValue(document, properties.voltageLevel3);
  VOLTAGE_KEYS.forEach((key) => delete properties[key]);
  return properties;
}

function normalizeEdge(raw) {
  return {
    id: String(raw.id),
    source: { nodeId: String(raw.source.nodeId), portId: String(raw.source.portId) },
    target: { nodeId: String(raw.target.nodeId), portId: String(raw.target.portId) },
    routing: raw.routing === "manual" ? "free" : (raw.routing ?? "orthogonal"),
    vertices: (raw.vertices ?? []).map((point) => ({ x: Number(point.x), y: Number(point.y) })),
    properties: raw.properties ?? {},
  };
}

function endpointOpposite(edge, nodeId) {
  return edge.source.nodeId === nodeId ? edge.target : edge.source;
}

function verticesBetweenOtherAndLine(edge, lineNodeId) {
  return edge.target.nodeId === lineNodeId ? edge.vertices : [...edge.vertices].reverse();
}

function verticesBetweenLineAndOther(edge, lineNodeId) {
  return edge.source.nodeId === lineNodeId ? edge.vertices : [...edge.vertices].reverse();
}

export function migrateV1ToV2(candidate) {
  const legacyLevels = voltageLevelsFromLegacyColors(candidate.metadata?.voltageColors ?? {});
  const diagram = createEmptyDiagram({
    id: candidate.id,
    name: candidate.name,
    metadata: {
      voltageLevels: legacyLevels,
      activeVoltageLevelId: legacyLevels[0]?.id,
    },
    updatedAt: candidate.updatedAt,
  });

  collectVoltageValues(candidate).forEach((value) => ensureVoltageLevel(diagram, { value }));
  const linePoints = new Map();

  nodeValues(candidate).forEach((raw) => {
    if (raw.type === "ElmLne") {
      linePoints.set(String(raw.id), raw);
      return;
    }
    const node = createNode(raw.type, raw.position ?? { x: raw.x ?? 0, y: raw.y ?? 0 }, {
      id: String(raw.id),
      rotation: Number(raw.rotation ?? 0),
      localName: raw.localName ?? "",
      ports: raw.ports ?? raw.connectionPoints ?? [],
      properties: migrateNodeProperties(diagram, raw),
    });
    applyDefaultNodeVoltageLevels(diagram, node);
    diagram.nodes[node.id] = node;
  });

  const oldEdges = edgeValues(candidate).map(normalizeEdge);
  const consumedEdges = new Set();

  linePoints.forEach((rawLine, lineId) => {
    const incident = oldEdges.filter((edge) => edge.source.nodeId === lineId || edge.target.nodeId === lineId);
    if (incident.length === 2) {
      const [first, second] = incident;
      const source = endpointOpposite(first, lineId);
      const target = endpointOpposite(second, lineId);
      if (diagram.nodes[source.nodeId] && diagram.nodes[target.nodeId]) {
        const linePosition = rawLine.position ?? { x: Number(rawLine.x ?? 0), y: Number(rawLine.y ?? 0) };
        const properties = migrateNodeProperties(diagram, rawLine);
        const edge = createEdge(source, target, {
          id: `line-${lineId}`,
          kind: "line",
          routing: "free",
          vertices: [
            ...verticesBetweenOtherAndLine(first, lineId),
            { x: Number(linePosition.x), y: Number(linePosition.y) },
            ...verticesBetweenLineAndOther(second, lineId),
          ],
          properties: {
            name: properties.name ?? rawLine.localName ?? "Línea importada",
            lengthKm: Number(properties.lengthKm ?? properties.length ?? 0),
            voltageLevelId: properties.voltageLevelId ?? null,
          },
        });
        diagram.edges[edge.id] = edge;
        consumedEdges.add(first.id);
        consumedEdges.add(second.id);
        return;
      }
    }

    const portIds = new Set();
    incident.forEach((edge) => {
      if (edge.source.nodeId === lineId) portIds.add(edge.source.portId);
      if (edge.target.nodeId === lineId) portIds.add(edge.target.portId);
    });
    const fallbackNode = createNode("ElmTerm", rawLine.position ?? { x: rawLine.x ?? 0, y: rawLine.y ?? 0 }, {
      id: lineId,
      rotation: Number(rawLine.rotation ?? 0),
      ports: [...portIds].map((id) => ({ id, name: "Unión importada", x: 0, y: 0 })),
      properties: {
        name: rawLine.properties?.name ?? rawLine.attributes?.name ?? "Unión importada",
        symbolName: "PointTerm",
        sizeX: 1,
        ...migrateNodeProperties(diagram, rawLine),
      },
    });
    applyDefaultNodeVoltageLevels(diagram, fallbackNode);
    diagram.nodes[fallbackNode.id] = fallbackNode;
  });

  oldEdges.forEach((raw) => {
    if (consumedEdges.has(raw.id)) return;
    if (!diagram.nodes[raw.source.nodeId] || !diagram.nodes[raw.target.nodeId]) return;
    const edge = createEdge(raw.source, raw.target, {
      ...raw,
      kind: "path",
      properties: {
        ...raw.properties,
        voltageLevelId: levelIdForValue(diagram, raw.properties?.voltageLevel),
      },
    });
    diagram.edges[edge.id] = edge;
  });

  diagram.schemaVersion = 2;
  return diagram;
}
