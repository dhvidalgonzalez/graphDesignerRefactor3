import { getSymbolDefinition } from "../catalog/symbolCatalog.js";
import { DEFAULT_VOLTAGE_LEVELS, getActiveVoltageLevelId, normalizeVoltageLevels } from "../electrical/voltageLevels.js";
import { createId } from "../../utils/id.js";
import { createDefaultAnalysisConfiguration } from "../analysis/analysisConfiguration.js";
import { normalizeOperatingCases } from "../analysis/operatingCases.js";
import { createParameterMetadata } from "../electrical/parameterValue.js";

export const CURRENT_SCHEMA_VERSION = 3;

export function createEmptyDiagram(overrides = {}) {
  const requestedMetadata = overrides.metadata ?? {};
  const voltageLevels = normalizeVoltageLevels(requestedMetadata.voltageLevels ?? DEFAULT_VOLTAGE_LEVELS);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: overrides.id ?? "prototype-diagram",
    name: overrides.name ?? "Diagrama eléctrico de prueba",
    nodes: overrides.nodes ?? {},
    edges: overrides.edges ?? {},
    metadata: {
      ...requestedMetadata,
      voltageLevels,
      activeVoltageLevelId: requestedMetadata.activeVoltageLevelId ?? voltageLevels[0]?.id ?? null,
    },
    electricalModel: overrides.electricalModel ?? {
      schemaVersion: 1,
      components: [],
      terminals: [],
      connectionNodes: [],
    },
    operatingCases: normalizeOperatingCases(overrides.operatingCases),
    analysisConfiguration: createDefaultAnalysisConfiguration(overrides.analysisConfiguration),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

function createParameterMetadataMap(fields, properties, explicitProperties, suppliedMetadata = {}) {
  return Object.fromEntries((fields ?? []).map((field) => {
    const value = properties[field.key];
    const explicit = Object.prototype.hasOwnProperty.call(explicitProperties, field.key);
    const supplied = suppliedMetadata?.[field.key];
    return [field.key, createParameterMetadata({
      source: supplied?.source ?? (explicit ? "IMPORTED" : "DEFAULT"),
      status: supplied?.status,
      updatedAt: supplied?.updatedAt,
    }, value)];
  }));
}

export function createNode(type, position, overrides = {}) {
  const definition = getSymbolDefinition(type);
  const explicitProperties = overrides.properties ?? {};
  const properties = {
    ...definition.defaultProperties,
    ...explicitProperties,
  };
  const logicalConnections = overrides.logicalConnections
    && typeof overrides.logicalConnections === "object"
    ? structuredClone(overrides.logicalConnections)
    : {};
  return {
    id: overrides.id ?? createId("node"),
    type,
    position: { x: Number(position.x), y: Number(position.y) },
    rotation: overrides.rotation ?? 0,
    localName: overrides.localName ?? "",
    ports: (overrides.ports ?? []).map((port) => ({ ...port, id: String(port.id) })),
    properties,
    parameterMetadata: createParameterMetadataMap(
      definition.electricalFields,
      properties,
      explicitProperties,
      overrides.parameterMetadata,
    ),
    logicalConnections,
  };
}

export function applyDefaultNodeVoltageLevels(document, node) {
  const definition = getSymbolDefinition(node.type);
  if (definition.electrical === false) return node;
  const levels = document.metadata.voltageLevels;
  const activeId = getActiveVoltageLevelId(document.metadata);
  if (definition.voltagePropertiesByPort) {
    const keys = [...new Set(Object.values(definition.voltagePropertiesByPort))];
    const orderedLevels = [
      levels.find((level) => level.id === activeId),
      ...levels.filter((level) => level.id !== activeId),
    ].filter(Boolean);
    keys.forEach((key, index) => {
      if (!node.properties[key]) {
        node.properties[key] = orderedLevels[index]?.id ?? activeId;
        node.parameterMetadata = {
          ...(node.parameterMetadata ?? {}),
          [key]: createParameterMetadata({ source: "DEFAULT", status: "ASSUMED" }, node.properties[key]),
        };
      }
    });
  } else if (!node.properties.voltageLevelId) {
    node.properties.voltageLevelId = activeId;
    node.parameterMetadata = {
      ...(node.parameterMetadata ?? {}),
      voltageLevelId: createParameterMetadata({ source: "DEFAULT", status: "ASSUMED" }, activeId),
    };
  }
  return node;
}

export function createEdge(source, target, overrides = {}) {
  const kind = overrides.kind ?? "path";
  const explicitProperties = overrides.properties ?? {};
  const properties = {
    name: kind === "line" ? "Línea eléctrica" : "",
    voltageLevelId: null,
    outOfService: false,
    ...(kind === "line" ? {
      lengthKm: 1,
      circuitCount: 1,
      conductor: "",
      ratedCurrentA: 0,
      resistanceOhmPerKm: 0,
      reactanceOhmPerKm: 0,
      susceptanceUsPerKm: 0,
    } : {}),
    ...explicitProperties,
  };
  const parameterFields = kind === "line"
    ? [
        "name", "voltageLevelId", "outOfService", "lengthKm", "circuitCount",
        "conductor", "ratedCurrentA", "resistanceOhmPerKm",
        "reactanceOhmPerKm", "susceptanceUsPerKm",
      ].map((key) => ({ key }))
    : ["voltageLevelId", "outOfService"].map((key) => ({ key }));
  const logicalConnections = overrides.logicalConnections
    && typeof overrides.logicalConnections === "object"
    ? structuredClone(overrides.logicalConnections)
    : {};
  return {
    id: overrides.id ?? createId(kind === "line" ? "line" : "path"),
    kind,
    source: { nodeId: source.nodeId, portId: String(source.portId) },
    target: { nodeId: target.nodeId, portId: String(target.portId) },
    routing: overrides.routing === "manual" ? "free" : (overrides.routing ?? "orthogonal"),
    vertices: (overrides.vertices ?? []).map((point) => ({ x: Number(point.x), y: Number(point.y) })),
    properties,
    parameterMetadata: createParameterMetadataMap(
      parameterFields,
      properties,
      explicitProperties,
      overrides.parameterMetadata,
    ),
    logicalConnections,
  };
}
