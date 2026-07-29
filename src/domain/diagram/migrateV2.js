import { getSymbolDefinition } from "../catalog/symbolCatalog.js";
import { createParameterMetadata } from "../electrical/parameterValue.js";
import { CURRENT_SCHEMA_VERSION, createEdge } from "./createDiagram.js";
import { normalizeCurrentDiagram } from "./normalizeDiagram.js";
import { synchronizeElectricalModel } from "../electrical/electricalModel.js";

function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function inferMetadata(fields, properties, defaults, existing = {}) {
  return Object.fromEntries((fields ?? []).map((field) => {
    const value = properties?.[field.key];
    const saved = existing?.[field.key];
    if (saved) return [field.key, saved];
    const assumedDefault = sameValue(value, defaults?.[field.key]);
    return [field.key, createParameterMetadata({
      source: assumedDefault ? "DEFAULT" : "IMPORTED",
      status: value === undefined || value === null || value === ""
        ? "MISSING"
        : assumedDefault ? "ASSUMED" : "CONFIRMED",
    }, value)];
  }));
}

function prepareCandidate(candidate) {
  const clone = structuredClone(candidate);
  const nodes = Array.isArray(clone.nodes) ? clone.nodes : Object.values(clone.nodes ?? {});
  nodes.forEach((node) => {
    const definition = getSymbolDefinition(node.type);
    node.parameterMetadata = inferMetadata(
      definition.electricalFields,
      node.properties ?? node.attributes ?? {},
      definition.defaultProperties,
      node.parameterMetadata,
    );
  });

  const edges = Array.isArray(clone.edges) ? clone.edges : Object.values(clone.edges ?? {});
  edges.forEach((edge) => {
    const template = createEdge(
      edge.source ?? { nodeId: "source", portId: "1" },
      edge.target ?? { nodeId: "target", portId: "1" },
      { kind: edge.kind ?? "path" },
    );
    edge.parameterMetadata = inferMetadata(
      Object.keys(template.parameterMetadata ?? {}).map((key) => ({ key })),
      edge.properties ?? {},
      template.properties,
      edge.parameterMetadata,
    );
  });
  return clone;
}

export function migrateV2ToV3(candidate) {
  const prepared = prepareCandidate(candidate);
  const diagram = normalizeCurrentDiagram({ ...prepared, schemaVersion: CURRENT_SCHEMA_VERSION });
  diagram.schemaVersion = CURRENT_SCHEMA_VERSION;
  return synchronizeElectricalModel(diagram);
}
