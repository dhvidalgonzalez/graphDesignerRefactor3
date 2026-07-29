import { getPortWorldPosition } from "../catalog/symbolCatalog.js";
import { appendOrthogonalTarget, createOrthogonalVertices, simplifyPolyline } from "../geometry/routing.js";

export function getEdgePoints(diagram, edge) {
  const sourceNode = diagram.nodes[edge.source.nodeId];
  const targetNode = diagram.nodes[edge.target.nodeId];
  if (!sourceNode || !targetNode) return [];

  const source = getPortWorldPosition(sourceNode, edge.source.portId);
  const target = getPortWorldPosition(targetNode, edge.target.portId);
  if (edge.routing === "free") return simplifyPolyline([source, ...edge.vertices, target]);
  if (!edge.vertices.length) return simplifyPolyline([source, ...createOrthogonalVertices(source, target), target]);
  return simplifyPolyline(appendOrthogonalTarget([source, ...edge.vertices], target));
}

export function getEdgeMiddlePoint(diagram, edge) {
  const points = getEdgePoints(diagram, edge);
  if (points.length < 2) return { x: 0, y: 0 };
  let total = 0;
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    total += length;
    segments.push({ start: points[index], end: points[index + 1], length });
  }
  let cursor = total / 2;
  for (const segment of segments) {
    if (cursor <= segment.length) {
      const ratio = segment.length ? cursor / segment.length : 0;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    cursor -= segment.length;
  }
  return points.at(-1);
}
