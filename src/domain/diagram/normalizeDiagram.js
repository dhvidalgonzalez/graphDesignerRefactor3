import { applyDefaultNodeVoltageLevels, createEmptyDiagram, createEdge, createNode } from "./createDiagram.js";
import { normalizeAnalysisConfiguration } from "../analysis/analysisConfiguration.js";
import { normalizeOperatingCases } from "../analysis/operatingCases.js";
import { synchronizeElectricalModel } from "../electrical/electricalModel.js";

export function normalizeCurrentDiagram(candidate) {
  const base = createEmptyDiagram({
    id: candidate.id,
    name: candidate.name,
    metadata: candidate.metadata,
    electricalModel: candidate.electricalModel,
    operatingCases: candidate.operatingCases,
    analysisConfiguration: candidate.analysisConfiguration,
    updatedAt: candidate.updatedAt,
  });

  const nodeValues = Array.isArray(candidate.nodes) ? candidate.nodes : Object.values(candidate.nodes ?? {});
  const nodes = Object.fromEntries(nodeValues.map((raw) => {
    const node = createNode(raw.type, raw.position ?? { x: raw.x ?? 0, y: raw.y ?? 0 }, {
      id: raw.id,
      rotation: Number(raw.rotation ?? 0),
      localName: raw.localName ?? "",
      ports: raw.ports ?? [],
      properties: raw.properties ?? raw.attributes ?? {},
      parameterMetadata: raw.parameterMetadata ?? {},
    });
    applyDefaultNodeVoltageLevels(base, node);
    return [node.id, node];
  }));

  const edgeValues = Array.isArray(candidate.edges) ? candidate.edges : Object.values(candidate.edges ?? {});
  const edges = Object.fromEntries(edgeValues.map((raw) => {
    const edge = createEdge(raw.source, raw.target, {
      id: raw.id,
      kind: raw.kind ?? "path",
      routing: raw.routing ?? ((raw.vertices?.length ?? 0) > 0 ? "free" : "orthogonal"),
      vertices: raw.vertices ?? [],
      properties: raw.properties ?? {},
      parameterMetadata: raw.parameterMetadata ?? {},
    });
    return [edge.id, edge];
  }));

  const normalized = {
    ...base,
    schemaVersion: candidate.schemaVersion,
    nodes,
    edges,
    operatingCases: normalizeOperatingCases(candidate.operatingCases),
    analysisConfiguration: normalizeAnalysisConfiguration(candidate.analysisConfiguration),
  };
  return synchronizeElectricalModel(normalized);
}
