import { describe, expect, it } from "vitest";
import { createSampleDiagram } from "../src/domain/diagram/sampleDiagram.js";
import { parseAndMigrateDiagram } from "../src/domain/diagram/migrateDiagram.js";
import { validateDiagram } from "../src/domain/diagram/validateDiagram.js";

 describe("documento eléctrico", () => {
  it("genera un ejemplo válido con paths y líneas físicas", () => {
    const diagram = createSampleDiagram();
    expect(diagram.schemaVersion).toBe(3);
    expect(validateDiagram(diagram)).toEqual([]);
    expect(Object.values(diagram.edges).some((edge) => edge.kind === "path")).toBe(true);
    expect(Object.values(diagram.edges).some((edge) => edge.kind === "line" && edge.properties.lengthKm > 0)).toBe(true);
  });

  it("convierte el formato heredado a endpoints lógicos", () => {
    const migrated = parseAndMigrateDiagram({
      nodes: [
        { id: "a", type: "ElmTr2", x: 10, y: 10, attributes: { voltageLevel1: 220, voltageLevel2: 66 } },
        { id: "b", type: "ElmTerm", x: 20, y: 20, sizeX: 1, symbolName: "TermStrip", attributes: { voltageLevel: 66 } },
      ],
      edges: [{ id: "e", fromNodeId: "a", toNodeId: "b", fromPoint: { id: "2" }, toPoint: { id: "1" }, controlPoints: [{ x: 15, y: 15 }] }],
      metadata: {},
    });

    expect(migrated.edges.e.source).toEqual({ nodeId: "a", portId: "2" });
    expect(migrated.edges.e.target).toEqual({ nodeId: "b", portId: "1" });
    expect(migrated.edges.e.routing).toBe("free");
    expect(migrated.nodes.a.properties.voltageLevelId2).toBe(migrated.nodes.b.properties.voltageLevelId);
  });

  it("transforma un antiguo ElmLne de dos extremos en línea real", () => {
    const migrated = parseAndMigrateDiagram({
      schemaVersion: 1,
      id: "legacy-line",
      name: "Línea antigua",
      nodes: [
        { id: "a", type: "ElmTerm", position: { x: 0, y: 0 }, properties: { voltageLevel: 66, symbolName: "PointTerm" } },
        { id: "p", type: "ElmLne", position: { x: 10, y: 5 }, properties: { name: "L1", lengthKm: 12 } },
        { id: "b", type: "ElmTerm", position: { x: 20, y: 0 }, properties: { voltageLevel: 66, symbolName: "PointTerm" } },
      ],
      edges: [
        { id: "e1", source: { nodeId: "a", portId: "1" }, target: { nodeId: "p", portId: "1" }, vertices: [] },
        { id: "e2", source: { nodeId: "p", portId: "2" }, target: { nodeId: "b", portId: "1" }, vertices: [] },
      ],
      metadata: {},
    });

    expect(migrated.nodes.p).toBeUndefined();
    const line = Object.values(migrated.edges).find((edge) => edge.kind === "line");
    expect(line.source.nodeId).toBe("a");
    expect(line.target.nodeId).toBe("b");
    expect(line.properties.lengthKm).toBe(12);
    expect(line.vertices).toContainEqual({ x: 10, y: 5 });
  });
});
