import { Arrow, Group, Rect, Text } from "react-konva";
import { useMemo, useState } from "react";
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
} from "../../domain/analysis/analysisResults.js";

function ResultLabel({
  id,
  x,
  y,
  title,
  lines,
  anchor = "left",
  offset,
  onMove,
}) {
  const [hovered, setHovered] = useState(false);
  const safeLines = lines.filter(Boolean);
  if (!safeLines.length) return null;

  const displayedLines = hovered ? safeLines : safeLines.slice(0, 1);
  const compactText = displayedLines[0] || title || "Resultado";
  const longest = Math.max(
    hovered ? title?.length ?? 0 : 0,
    ...displayedLines.map((line) => line.length),
  );
  const width = hovered
    ? Math.max(24, Math.min(52, longest * 1.48 + 5))
    : Math.max(14, Math.min(32, compactText.length * 1.33 + 4));
  const lineHeight = hovered ? 3.25 : 2.9;
  const titleHeight = hovered && title ? 3.6 : 0;
  const height = 2.3 + titleHeight + displayedLines.length * lineHeight;
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
      onDragStart={(event) => { event.cancelBubble = true; }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onMove?.({
          x: event.target.x() - originX,
          y: event.target.y() - originY,
        });
      }}
      onMouseEnter={(event) => {
        setHovered(true);
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = "move";
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = "default";
      }}
      onClick={(event) => { event.cancelBubble = true; }}
      onTap={(event) => { event.cancelBubble = true; }}
    >
      <Rect
        width={width}
        height={height}
        fill={hovered ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.9)"}
        stroke="rgba(15,23,42,0.72)"
        strokeWidth={hovered ? 0.42 : 0.28}
        cornerRadius={1.05}
        shadowColor="rgba(15,23,42,0.16)"
        shadowBlur={hovered ? 2.2 : 0.8}
        shadowOffsetY={hovered ? 0.7 : 0.3}
      />
      {hovered && title && (
        <Text
          x={2}
          y={0.85}
          width={width - 4}
          text={title}
          fill="#0f172a"
          fontSize={2.15}
          fontStyle="bold"
          ellipsis
          wrap="none"
        />
      )}
      {displayedLines.map((line, index) => (
        <Text
          key={`${line}-${index}`}
          x={2}
          y={1.05 + titleHeight + index * lineHeight}
          width={width - 4}
          text={line}
          fill="#1e293b"
          fontSize={hovered ? 2.05 : 1.9}
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
  const options = data.overlay?.options;
  const result = useMemo(
    () => (rawResult ? getAnalysisNetworkResult(rawResult, viewId) : null),
    [rawResult, viewId],
  );
  const index = useMemo(
    () => (rawResult ? createAnalysisResultIndex(data.document, rawResult, viewId) : null),
    [data.document, rawResult, viewId],
  );

  if (!rawResult || !result || !options?.visible || !index) return null;

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
        if (options.showBusVoltages) lines.push(`${formatResultNumber(bus.voltagePu, 4)} p.u. · ${formatResultNumber(bus.voltageKv, 2)} kV`);
        if (options.showBusAngles) lines.push(`${formatResultNumber(bus.angleDeg, 3)}° · ${bus.status || "NORMAL"}`);
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 4}
            y={position.y - 7}
            title={busTitle(data.document, index, bus)}
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
        if (options.showActivePowerFlows) lines.push(`P ${formatPowerKw(branch.activePowerFromKw)}`);
        if (options.showReactivePowerFlows) lines.push(`Q ${formatReactivePowerKvar(branch.reactivePowerFromKvar)}`);
        if (options.showCurrents) lines.push(`I ${formatCurrentA(branch.currentFromA)}`);
        if (options.showLoading) lines.push(`${formatResultNumber(branch.loadingPercent, 1)} %`);
        if (options.showLosses) lines.push(`ΔP ${formatPowerKw(branch.activeLossKw)}`);
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x}
            y={position.y + 2.8}
            title={branchTitle(data.document, branch)}
            lines={lines}
            anchor="center"
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {options.showEquipmentPower && result.generators.map((generator) => {
        const position = getEquipmentPosition(data.document, generator.componentId);
        if (!position) return null;
        const id = `generator:${generator.componentId}`;
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 5}
            y={position.y + 5}
            title={data.document.nodes?.[generator.componentId]?.properties?.name || generator.componentId}
            lines={[`P ${formatPowerKw(generator.activePowerKw)}`, `Q ${formatReactivePowerKvar(generator.reactivePowerKvar)}`]}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {options.showEquipmentPower && result.loads.map((load) => {
        const position = getEquipmentPosition(data.document, load.componentId);
        if (!position) return null;
        const id = `load:${load.componentId}`;
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 5}
            y={position.y + 5}
            title={data.document.nodes?.[load.componentId]?.properties?.name || load.componentId}
            lines={[`P ${formatPowerKw(load.activePowerKw)}`, `Q ${formatReactivePowerKvar(load.reactivePowerKvar)}`]}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}

      {result.transformers.map((transformer) => {
        const position = getEquipmentPosition(data.document, transformer.componentId);
        if (!position) return null;
        const id = `transformer:${transformer.componentId}`;
        return (
          <ResultLabel
            key={id}
            id={`analysis-${id}`}
            x={position.x + 6}
            y={position.y - 3}
            title={data.document.nodes?.[transformer.componentId]?.properties?.name || transformer.componentId}
            lines={[
              options.showActivePowerFlows ? `P ${formatPowerKw(transformer.activePowerPrimaryKw)}` : null,
              options.showLoading ? `${formatResultNumber(transformer.loadingPercent, 1)} %` : null,
              options.showLosses ? `ΔP ${formatPowerKw(transformer.activeLossKw)}` : null,
            ]}
            offset={offsetFor(id)}
            onMove={(offset) => moveLabel(id, offset)}
          />
        );
      })}
    </>
  );
}
