import { Arrow, Group, Rect, Text } from "react-konva";
import { useMemo } from "react";
import { shallowEqual, useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import { getEdgePoints } from "../../domain/diagram/edgeGeometry.js";
import {
  analysisEntityBelongsToDiagram,
  branchFlowArrowSegment,
  createAnalysisResultIndex,
  formatCurrentA,
  formatPowerKw,
  formatReactivePowerKvar,
  formatResultNumber,
  getAnalysisNetworkResult,
  getBranchPosition,
  getConnectionNodePosition,
  getEquipmentPosition,
  getBusResultForNode,
  loadingColor,
  localAnalysisEntityId,
  normalizeAnalysisOverlayOptions,
} from "../../domain/analysis/analysisResults.js";

function ResultLabel({
  id,
  x,
  y,
  title,
  lines,
  showTitle = false,
  anchor = "left",
  offset,
  onMove,
}) {
  const rows = [showTitle ? title : null, ...lines].filter(Boolean);
  if (!rows.length) return null;

  const longest = Math.max(...rows.map((line) => String(line).length));
  const horizontalPadding = 1.45;
  const verticalPadding = 0.8;
  const lineHeight = 2.45;
  const width = Math.max(10.5, Math.min(43, longest * 1.18 + horizontalPadding * 2));
  const height = verticalPadding * 2 + rows.length * lineHeight;
  const anchorOffset = anchor === "center" ? -width / 2 : anchor === "right" ? -width : 0;
  const originX = x + anchorOffset;
  const originY = y;
  const layout = offset ?? { x: 0, y: 0 };

  return (
    <Group
      id={id}
      x={originX + layout.x}
      y={originY + layout.y}
      draggable
      onDragStart={(event) => {
        event.cancelBubble = true;
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = "grabbing";
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = "move";
        onMove?.({
          x: event.target.x() - originX,
          y: event.target.y() - originY,
        });
      }}
      onMouseEnter={(event) => {
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = "move";
      }}
      onMouseLeave={(event) => {
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = "default";
      }}
      onClick={(event) => { event.cancelBubble = true; }}
      onTap={(event) => { event.cancelBubble = true; }}
    >
      <Rect
        width={width}
        height={height}
        fill="rgba(255,255,255,0.94)"
        stroke="rgba(15,23,42,0.72)"
        strokeWidth={0.24}
        cornerRadius={0.65}
        shadowColor="rgba(15,23,42,0.10)"
        shadowBlur={0.45}
        shadowOffsetY={0.2}
      />
      {rows.map((line, index) => (
        <Text
          key={`${line}-${index}`}
          x={horizontalPadding}
          y={verticalPadding + index * lineHeight + 0.25}
          width={width - horizontalPadding * 2}
          text={String(line)}
          fill="#172033"
          fontSize={index === 0 && showTitle ? 1.72 : 1.68}
          fontStyle={index === 0 && showTitle ? "bold" : "normal"}
          wrap="none"
          ellipsis
        />
      ))}
    </Group>
  );
}

function busTitle(node, bus) {
  return node?.properties?.name || bus.busId || bus.connectionNodeId || "Barra";
}

function branchTitle(document, branch) {
  const localId = localAnalysisEntityId(branch.componentId, document.id);
  return document.edges?.[localId]?.properties?.name || localId || "Línea";
}

export default function AnalysisOverlayLayer() {
  const data = useEditorSelector((state) => ({
    document: state.document,
    overlay: state.ui.analysisOverlay,
    scale: state.viewport.scale,
  }), shallowEqual);
  const actions = useEditorActions();
  const rawResult = data.overlay?.result;
  const viewId = data.overlay?.viewId;
  const options = normalizeAnalysisOverlayOptions(data.overlay?.options);
  const result = useMemo(
    () => (rawResult ? getAnalysisNetworkResult(rawResult, viewId) : null),
    [rawResult, viewId],
  );
  const index = useMemo(
    () => (rawResult ? createAnalysisResultIndex(data.document, rawResult, viewId) : null),
    [data.document, rawResult, viewId],
  );

  if (!rawResult || !result || !options.visible || !index) return null;

  const offsetFor = (id) => data.overlay?.labelOffsets?.[`${viewId || "network"}:${id}`] ?? { x: 0, y: 0 };
  const moveLabel = (id, offset) => actions.moveAnalysisResultLabel(`${viewId || "network"}:${id}`, offset);
  const multiDiagramResult = Boolean(
    data.overlay?.study?.multiDiagram
    || rawResult.multiDiagram
    || rawResult.visualElectricalModel,
  );
  const labelId = (kind, localId) => `${kind}:${multiDiagramResult ? `${data.document.id}:` : ""}${localId}`;
  const visibleBusResults = Object.values(data.document.nodes ?? {})
    .filter((node) => node.type === "ElmTerm")
    .map((node) => ({ node, bus: getBusResultForNode(index, node.id) }))
    .filter((item) => Boolean(item.bus));

  return (
    <>
      {options.showFlowArrows && result.branches.map((branch) => {
        if (!analysisEntityBelongsToDiagram(branch.componentId, data.document.id)) return null;
        const localComponentId = localAnalysisEntityId(branch.componentId, data.document.id);
        const edge = data.document.edges?.[localComponentId];
        if (!edge || branch.direction === "NONE") return null;
        const segment = branchFlowArrowSegment(getEdgePoints(data.document, edge), branch.direction);
        if (!segment) return null;
        const color = loadingColor(branch.loadingPercent, branch.status);
        return (
          <Arrow
            key={`flow-${localComponentId}`}
            points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
            stroke={color}
            fill={color}
            strokeWidth={1.05 / Math.sqrt(data.scale)}
            pointerLength={3.4 / Math.sqrt(data.scale)}
            pointerWidth={3.1 / Math.sqrt(data.scale)}
            listening={false}
          />
        );
      })}

      {visibleBusResults.map(({ node, bus }) => {
        const position = getConnectionNodePosition(data.document, index, bus.connectionNodeId, node.id);
        if (!position) return null;
        const id = labelId("bus", node.id);
        const lines = [];
        if (options.showBusVoltagePu) lines.push(`${formatResultNumber(bus.voltagePu, 4)} p.u.`);
        if (options.showBusVoltageKv) lines.push(`${formatResultNumber(bus.voltageKv, 2)} kV`);
        if (options.showBusAngleDeg) lines.push(`${formatResultNumber(bus.angleDeg, 3)}°`);
        if (options.showBusStatus) lines.push(bus.status || "NORMAL");
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 4}
            y={position.y - 6}
            title={busTitle(node, bus)}
            showTitle={options.showComponentNames}
            lines={lines}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.branches.map((branch) => {
        if (!analysisEntityBelongsToDiagram(branch.componentId, data.document.id)) return null;
        const localComponentId = localAnalysisEntityId(branch.componentId, data.document.id);
        const position = getBranchPosition(data.document, localComponentId);
        if (!position) return null;
        const id = labelId("branch", localComponentId);
        const lines = [];
        if (options.showBranchActivePower) lines.push(`P ${formatPowerKw(branch.activePowerFromKw)}`);
        if (options.showBranchReactivePower) lines.push(`Q ${formatReactivePowerKvar(branch.reactivePowerFromKvar)}`);
        if (options.showBranchCurrent) lines.push(`I ${formatCurrentA(branch.currentFromA)}`);
        if (options.showBranchLoading) lines.push(`${formatResultNumber(branch.loadingPercent, 1)} %`);
        if (options.showBranchLosses) lines.push(`ΔP ${formatPowerKw(branch.activeLossKw)}`);
        if (options.showBranchDirection) lines.push(branch.direction || "NONE");
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x}
            y={position.y + 2.2}
            title={branchTitle(data.document, branch)}
            showTitle={options.showComponentNames}
            lines={lines}
            anchor="center"
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.generators.map((generator) => {
        if (!analysisEntityBelongsToDiagram(generator.componentId, data.document.id)) return null;
        const localComponentId = localAnalysisEntityId(generator.componentId, data.document.id);
        const position = getEquipmentPosition(data.document, localComponentId);
        if (!position) return null;
        const id = labelId("generator", localComponentId);
        const lines = [];
        if (options.showGeneratorActivePower) lines.push(`P ${formatPowerKw(generator.activePowerKw)}`);
        if (options.showGeneratorReactivePower) lines.push(`Q ${formatReactivePowerKvar(generator.reactivePowerKvar)}`);
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 5}
            y={position.y + 4.5}
            title={data.document.nodes?.[localComponentId]?.properties?.name || localComponentId}
            showTitle={options.showComponentNames}
            lines={lines}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.loads.map((load) => {
        if (!analysisEntityBelongsToDiagram(load.componentId, data.document.id)) return null;
        const localComponentId = localAnalysisEntityId(load.componentId, data.document.id);
        const position = getEquipmentPosition(data.document, localComponentId);
        if (!position) return null;
        const id = labelId("load", localComponentId);
        const lines = [];
        if (options.showLoadActivePower) lines.push(`P ${formatPowerKw(load.activePowerKw)}`);
        if (options.showLoadReactivePower) lines.push(`Q ${formatReactivePowerKvar(load.reactivePowerKvar)}`);
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 5}
            y={position.y + 4.5}
            title={data.document.nodes?.[localComponentId]?.properties?.name || localComponentId}
            showTitle={options.showComponentNames}
            lines={lines}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.transformers.map((transformer) => {
        if (!analysisEntityBelongsToDiagram(transformer.componentId, data.document.id)) return null;
        const localComponentId = localAnalysisEntityId(transformer.componentId, data.document.id);
        const position = getEquipmentPosition(data.document, localComponentId);
        if (!position) return null;
        const id = labelId("transformer", localComponentId);
        const lines = [];
        if (options.showTransformerActivePower) lines.push(`P ${formatPowerKw(transformer.activePowerPrimaryKw)}`);
        if (options.showTransformerReactivePower) lines.push(`Q ${formatReactivePowerKvar(transformer.reactivePowerPrimaryKvar)}`);
        if (options.showTransformerLoading) lines.push(`${formatResultNumber(transformer.loadingPercent, 1)} %`);
        if (options.showTransformerLosses) lines.push(`ΔP ${formatPowerKw(transformer.activeLossKw)}`);
        if (options.showTransformerTap) lines.push(`Tap ${formatResultNumber(transformer.tapPosition, 0)}`);
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 6}
            y={position.y - 3}
            title={data.document.nodes?.[localComponentId]?.properties?.name || localComponentId}
            showTitle={options.showComponentNames}
            lines={lines}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}
    </>
  );
}
