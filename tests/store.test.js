import { describe, expect, it } from "vitest";
import { EditorStore } from "../src/editor/EditorStore.js";
import { createSampleDiagram } from "../src/domain/diagram/sampleDiagram.js";
import { createDiagramWithEntities } from "../src/domain/diagram/serialization.js";
import { getPortWorldPosition } from "../src/domain/catalog/symbolCatalog.js";

 describe("EditorStore", () => {
  it("mueve un nodo y mantiene el endpoint derivable", () => {
    const store = new EditorStore(createSampleDiagram());
    store.actions.selectNode("tr2-main");
    store.actions.moveNodeTo("tr2-main", { x: 60, y: 50 });

    const state = store.getState();
    const edge = state.document.edges["path-1"];
    const endpoint = getPortWorldPosition(state.document.nodes[edge.target.nodeId], edge.target.portId);
    expect(state.document.nodes["tr2-main"].position).toEqual({ x: 60, y: 50 });
    expect(endpoint).toEqual({ x: 60, y: 45 });
  });

  it("permite deshacer una rotación", () => {
    const store = new EditorStore(createSampleDiagram());
    store.actions.selectNode("tr2-main");
    store.actions.rotateSelection(45);
    expect(store.getState().document.nodes["tr2-main"].rotation).toBe(45);
    store.actions.undo();
    expect(store.getState().document.nodes["tr2-main"].rotation).toBe(0);
  });

  it("propaga el voltaje de una barra a un equipo nuevo", () => {
    const diagram = createDiagramWithEntities({
      nodes: [
        { id: "bus", type: "ElmTerm", position: { x: 0, y: 0 }, properties: { voltageLevelId: "vl-66", symbolName: "TermStrip" } },
        { id: "load", type: "ElmLod", position: { x: 20, y: 20 }, properties: { voltageLevelId: "vl-13-8" } },
      ],
      edges: [],
    });
    const store = new EditorStore(diagram);
    store.actions.setTool("path");
    store.actions.startConnection("bus", "1");
    store.actions.completeConnection("load", "1");
    expect(store.getState().document.nodes.load.properties.voltageLevelId).toBe("vl-66");
  });

  it("detiene la propagación entre devanados del transformador", () => {
    const store = new EditorStore(createSampleDiagram());
    store.actions.setNodeVoltage("tr2-main", "voltageLevelId1", "vl-110");
    const transformer = store.getState().document.nodes["tr2-main"];
    expect(transformer.properties.voltageLevelId1).toBe("vl-110");
    expect(transformer.properties.voltageLevelId2).toBe("vl-66");
    expect(store.getState().document.nodes["term-220"].properties.voltageLevelId).toBe("vl-110");
    expect(store.getState().document.nodes["term-66"].properties.voltageLevelId).toBe("vl-66");
  });

  it("crea un nivel nuevo desde un componente y lo propaga", () => {
    const store = new EditorStore(createSampleDiagram());
    const levelId = store.actions.createAndSetNodeVoltage("term-66", "voltageLevelId", 13.2);
    expect(levelId).toBeTruthy();
    expect(store.getState().document.metadata.voltageLevels.some((level) => level.id === levelId && level.value === 13.2)).toBe(true);
    expect(store.getState().document.nodes["load-1"].properties.voltageLevelId).toBe(levelId);
    expect(store.getState().document.nodes["tr2-main"].properties.voltageLevelId2).toBe(levelId);
    expect(store.getState().document.nodes["tr2-main"].properties.voltageLevelId1).toBe("vl-220");
  });

  it("crea una línea física diferente de un path visual", () => {
    const diagram = createDiagramWithEntities({
      nodes: [
        { id: "a", type: "ElmTerm", position: { x: 0, y: 0 }, properties: { voltageLevelId: "vl-66", symbolName: "PointTerm" } },
        { id: "b", type: "ElmTerm", position: { x: 20, y: 0 }, properties: { voltageLevelId: "vl-66", symbolName: "PointTerm" } },
      ],
      edges: [],
    });
    const store = new EditorStore(diagram);
    store.actions.setTool("line");
    store.actions.startConnection("a", "1");
    store.actions.completeConnection("b", "1");
    const line = Object.values(store.getState().document.edges)[0];
    expect(line.kind).toBe("line");
    expect(line.properties).toHaveProperty("lengthKm");
  });
});
