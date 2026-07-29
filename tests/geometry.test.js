import { describe, expect, it } from "vitest";
import { rotatePoint } from "../src/domain/geometry/point.js";
import { createNode } from "../src/domain/diagram/createDiagram.js";
import { getPortWorldPosition } from "../src/domain/catalog/symbolCatalog.js";
import { orthogonalizeWaypoint } from "../src/domain/geometry/routing.js";

 describe("geometría del editor", () => {
  it("rota un punto 90 grados", () => {
    const result = rotatePoint({ x: 0, y: -5 }, 90);
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(0);
  });

  it("deriva la posición absoluta sin almacenarla en el trazado", () => {
    const node = createNode("ElmTr2", { x: 20, y: 30 }, { id: "tr", rotation: 90 });
    const point = getPortWorldPosition(node, "1");
    expect(point.x).toBeCloseTo(25);
    expect(point.y).toBeCloseTo(30);
  });

  it("fija un waypoint ortogonal sobre el eje dominante", () => {
    expect(orthogonalizeWaypoint({ x: 0, y: 0 }, { x: 12, y: 4 })).toEqual({ x: 12, y: 0 });
    expect(orthogonalizeWaypoint({ x: 0, y: 0 }, { x: 3, y: 10 })).toEqual({ x: 0, y: 10 });
  });
});
