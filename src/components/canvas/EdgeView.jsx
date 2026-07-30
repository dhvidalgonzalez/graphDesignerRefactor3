import { Circle, Line, Text } from "react-konva";
import { shallowEqual, useEditorActions, useEditorSelector, useEditorStore } from "../../editor/EditorContext.jsx";
import { getEdgeMiddlePoint, getEdgePoints } from "../../domain/diagram/edgeGeometry.js";
import { getVoltageColor } from "../../domain/catalog/symbolCatalog.js";
import { getEndpointVoltageLevelId } from "../../domain/electrical/topology.js";
import { createAnalysisResultIndex, loadingColor } from "../../domain/analysis/analysisResults.js";

export default function EdgeView({ edgeId }) {
  const data = useEditorSelector((state) => ({
    edge: state.document.edges[edgeId],
    document: state.document,
    selected: state.selection.edgeId === edgeId,
    selectedVertex: state.selection.edgeId === edgeId ? state.selection.vertexIndex : null,
    tool: state.tool,
    scale: state.viewport.scale,
    analysisOverlay: state.ui.analysisOverlay,
  }), shallowEqual);
  const actions = useEditorActions();
  const store = useEditorStore();
  const readOnly = store.readOnly;
  const { edge } = data;
  if (!edge) return null;

  const path = getEdgePoints(data.document, edge);
  const flatPoints = path.flatMap((point) => [point.x, point.y]);
  const levelId = edge.properties.voltageLevelId ?? getEndpointVoltageLevelId(data.document, edge.source);
  const color = getVoltageColor(data.document.metadata, levelId, edge.properties.outOfService);
  const isLine = edge.kind === "line";
  const middle = isLine ? getEdgeMiddlePoint(data.document, edge) : null;
  const resultIndex = data.analysisOverlay?.result
    ? createAnalysisResultIndex(data.document, data.analysisOverlay.result, data.analysisOverlay.viewId)
    : null;
  const branchResult = resultIndex?.branchByComponentId.get(edge.id) ?? null;
  const resultColor = branchResult && data.analysisOverlay?.options?.visible && data.analysisOverlay?.options?.colorBranchesByLoading
    ? loadingColor(branchResult.loadingPercent, branchResult.status)
    : color;
  const stroke = data.selected ? "#2563eb" : resultColor;

  const handleClick = (event) => {
    event.cancelBubble = true;
    if (data.tool === "select") actions.selectEdge(edge.id);
    if (data.tool === "electrical" && isLine) {
      actions.selectEdge(edge.id);
      actions.openElectricalEditor("edge", edge.id);
    }
  };

  return (
    <>
      {isLine && <Line points={flatPoints} stroke="#ffffff" strokeWidth={(data.selected ? 3.8 : 3.2) / Math.sqrt(data.scale)} lineCap="round" lineJoin="round" listening={false} />}
      <Line
        points={flatPoints}
        stroke={stroke}
        strokeWidth={(data.selected ? (isLine ? 2.5 : 2) : (isLine ? 1.9 : 1.15)) / Math.sqrt(data.scale)}
        lineCap="round"
        lineJoin="round"
        dash={edge.properties.outOfService ? [3, 2] : undefined}
        hitStrokeWidth={9 / data.scale}
        onClick={handleClick}
        onTap={handleClick}
      />

      {isLine && middle && (
        <Text
          x={middle.x - 13}
          y={middle.y - 4.8}
          width={26}
          align="center"
          text={`${edge.properties.name || "Línea"}${Number(edge.properties.lengthKm) > 0 ? ` · ${edge.properties.lengthKm} km` : ""}`}
          fontSize={2.8}
          fill={data.selected ? "#1d4ed8" : "#475569"}
          padding={1}
          listening={false}
        />
      )}

      {data.selected && !readOnly && edge.vertices.map((point, index) => (
        <Circle
          key={`${edge.id}-vertex-${index}`}
          x={point.x}
          y={point.y}
          radius={1.7}
          fill={data.selectedVertex === index ? "#f59e0b" : "#ffffff"}
          stroke="#2563eb"
          strokeWidth={0.65}
          draggable
          onMouseDown={(event) => { event.cancelBubble = true; actions.selectVertex(edge.id, index); }}
          onDragEnd={(event) => { event.cancelBubble = true; actions.updateEdgeVertex(edge.id, index, { x: event.target.x(), y: event.target.y() }); }}
        />
      ))}
    </>
  );
}
