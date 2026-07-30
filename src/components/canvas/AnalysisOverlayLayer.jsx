import { Arrow, Group, Rect, Text } from "react-konva";
import { useMemo } from "react";
import { shallowEqual, useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import { getEdgePoints } from "../../domain/diagram/edgeGeometry.js";
import {
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
  loadingColor,
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

function busTitle(document, index, bus) {
  const connectionNode = index.connectionNodeById.get(bus.connectionNodeId)
    ?? index.connectionNodeById.get(bus.busId)
    ?? index.connectionNodeByBusComponentId.get(bus.busId);
  const visualNode = connectionNode?.busComponentId
    ? document.nodes?.[connectionNode.busComponentId]
    : document.nodes?.[bus.busId];
  return visualNode?.properties?.name || connectionNode?.busComponentId || bus.busId || "Barra";
}

function branchTitle(document, branch) {
  return document.edges?.[branch.componentId]?.properties?.name || branch.componentId || "Línea";
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

  return (
    <>
      {options.showFlowArrows && result.branches.map((branch) => {
        const edge = data.document.edges?.[branch.componentId];
        if (!edge || branch.direction === "NONE") return null;
        const segment = branchFlowArrowSegment(getEdgePoints(data.document, edge), branch.direction);
        if (!segment) return null;
        const color = loadingColor(branch.loadingPercent, branch.status);
        return (
          <Arrow
            key={`flow-${branch.componentId}`}
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

      {result.buses.map((bus) => {
        const position = getConnectionNodePosition(data.document, index, bus.connectionNodeId, bus.busId);
        if (!position) return null;
        const id = `bus:${bus.connectionNodeId || bus.busId}`;
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
            title={busTitle(data.document, index, bus)}
            showTitle={options.showComponentNames}
            lines={lines}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.branches.map((branch) => {
        const position = getBranchPosition(data.document, branch.componentId);
        if (!position) return null;
        const id = `branch:${branch.componentId}`;
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
        const position = getEquipmentPosition(data.document, generator.componentId);
        if (!position) return null;
        const id = `generator:${generator.componentId}`;
        const lines = [];
        if (options.showGeneratorActivePower) lines.push(`P ${formatPowerKw(generator.activePowerKw)}`);
        if (options.showGeneratorReactivePower) lines.push(`Q ${formatReactivePowerKvar(generator.reactivePowerKvar)}`);
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 5}
            y={position.y + 4.5}
            title={data.document.nodes?.[generator.componentId]?.properties?.name || generator.componentId}
            showTitle={options.showComponentNames}
            lines={lines}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.loads.map((load) => {
        const position = getEquipmentPosition(data.document, load.componentId);
        if (!position) return null;
        const id = `load:${load.componentId}`;
        const lines = [];
        if (options.showLoadActivePower) lines.push(`P ${formatPowerKw(load.activePowerKw)}`);
        if (options.showLoadReactivePower) lines.push(`Q ${formatReactivePowerKvar(load.reactivePowerKvar)}`);
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 5}
            y={position.y + 4.5}
            title={data.document.nodes?.[load.componentId]?.properties?.name || load.componentId}
            showTitle={options.showComponentNames}
            lines={lines}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.transformers.map((transformer) => {
        const position = getEquipmentPosition(data.document, transformer.componentId);
        if (!position) return null;
        const id = `transformer:${transformer.componentId}`;
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
            title={data.document.nodes?.[transformer.componentId]?.properties?.name || transformer.componentId}
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
