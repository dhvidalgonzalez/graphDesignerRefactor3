import { applyDefaultNodeVoltageLevels, createEmptyDiagram, createNode, createEdge } from "./createDiagram.js";
import { synchronizeElectricalModel } from "../electrical/electricalModel.js";

export function createDiagramWithEntities(input) {
  const diagram = createEmptyDiagram(input);
  const nodes = Object.fromEntries((input.nodes ?? []).map((candidate) => {
    const node = createNode(candidate.type, candidate.position, candidate);
    applyDefaultNodeVoltageLevels(diagram, node);
    return [node.id, node];
  }));
  const edges = Object.fromEntries((input.edges ?? []).map((candidate) => {
    const edge = createEdge(candidate.source, candidate.target, candidate);
    return [edge.id, edge];
  }));
  return synchronizeElectricalModel({ ...diagram, nodes, edges });
}

export function serializeDiagram(diagram) {
  return JSON.stringify(synchronizeElectricalModel(structuredClone(diagram)), null, 2);
}

export function cloneDiagram(diagram) {
  return structuredClone(diagram);
}
