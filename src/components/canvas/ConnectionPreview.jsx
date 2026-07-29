import { Line } from "react-konva";
import { shallowEqual, useEditorSelector } from "../../editor/EditorContext.jsx";
import { getPortWorldPosition } from "../../domain/catalog/symbolCatalog.js";
import { appendOrthogonalTarget, createOrthogonalVertices, simplifyPolyline } from "../../domain/geometry/routing.js";

export default function ConnectionPreview() {
  const data = useEditorSelector((state) => ({ draft: state.connectionDraft, document: state.document, scale: state.viewport.scale }), shallowEqual);
  if (!data.draft?.pointer) return null;
  const sourceNode = data.document.nodes[data.draft.source.nodeId];
  if (!sourceNode) return null;
  const source = getPortWorldPosition(sourceNode, data.draft.source.portId);
  const path = data.draft.routing === "free"
    ? [source, ...data.draft.vertices, data.draft.pointer]
    : data.draft.vertices.length
      ? appendOrthogonalTarget([source, ...data.draft.vertices], data.draft.pointer)
      : [source, ...createOrthogonalVertices(source, data.draft.pointer), data.draft.pointer];
  const points = simplifyPolyline(path).flatMap((point) => [point.x, point.y]);
  const isLine = data.draft.kind === "line";

  return (
    <Line
      points={points}
      stroke={isLine ? "#b45309" : "#0f766e"}
      strokeWidth={(isLine ? 1.9 : 1.2) / Math.sqrt(data.scale)}
      dash={[2.5, 1.5]}
      lineCap="round"
      lineJoin="round"
      listening={false}
    />
  );
}
