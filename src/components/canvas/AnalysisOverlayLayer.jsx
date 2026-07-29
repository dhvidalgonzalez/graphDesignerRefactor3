import { Arrow, Group, Rect, Text } from "react-konva";
import { useMemo } from "react";
import { shallowEqual, useEditorSelector } from "../../editor/EditorContext.jsx";
import { getEdgePoints } from "../../domain/diagram/edgeGeometry.js";
import {
  branchFlowArrowSegment,
  createAnalysisResultIndex,
  formatCurrentA,
  formatPowerKw,
  formatReactivePowerKvar,
  formatResultNumber,
  getBranchPosition,
  getConnectionNodePosition,
  getEquipmentPosition,
  loadingColor,
  voltagePuColor,
} from "../../domain/analysis/analysisResults.js";

function ResultLabel({ x, y, title, lines, accent = "#2563eb", anchor = "left" }) {
  const safeLines = lines.filter(Boolean);
  if (!safeLines.length) return null;
  const longest = Math.max(title?.length ?? 0, ...safeLines.map((line) => line.length));
  const width = Math.max(25, Math.min(54, longest * 1.65 + 6));
  const lineHeight = 3.5;
  const height = 5.2 + safeLines.length * lineHeight;
  const offsetX = anchor === "center" ? -width / 2 : anchor === "right" ? -width : 0;
  return (
    <Group x={x + offsetX} y={y} listening={false}>
      <Rect
        width={width}
        height={height}
        fill="rgba(255,255,255,0.94)"
        stroke={accent}
        strokeWidth={0.45}
        cornerRadius={1.6}
        shadowColor="rgba(15,23,42,0.22)"
        shadowBlur={2.2}
        shadowOffsetY={0.8}
      />
      <Rect width={1.4} height={height} fill={accent} cornerRadius={[1.6, 0, 0, 1.6]} />
      {title && (
        <Text
          x={3.2}
          y={1.25}
          width={width - 5}
          text={title}
          fill="#0f172a"
          fontSize={2.45}
          fontStyle="bold"
          ellipsis
          wrap="none"
        />
      )}
      {safeLines.map((line, index) => (
        <Text
          key={`${line}-${index}`}
          x={3.2}
          y={title ? 4.25 + index * lineHeight : 1.5 + index * lineHeight}
          width={width - 5}
          text={line}
          fill="#334155"
          fontSize={2.25}
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
  const visualNode = connectionNode?.busComponentId ? document.nodes?.[connectionNode.busComponentId] : document.nodes?.[bus.busId];
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
  const result = data.overlay?.result;
  const options = data.overlay?.options;
  const index = useMemo(
    () => (result ? createAnalysisResultIndex(data.document, result) : null),
    [data.document, result],
  );

  if (!result || !options?.visible || !index) return null;

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
        const lines = [];
        if (options.showBusVoltages) {
          lines.push(`${formatResultNumber(bus.voltageKv, 3)} kV · ${formatResultNumber(bus.voltagePu, 4)} p.u.`);
        }
        if (options.showBusAngles) lines.push(`${formatResultNumber(bus.angleDeg, 3)}° · ${bus.status || "NORMAL"}`);
        return (
          <ResultLabel
            key={`bus-${bus.connectionNodeId || bus.busId}`}
            x={position.x + 5}
            y={position.y - 12}
            title={busTitle(data.document, index, bus)}
            lines={lines}
            accent={voltagePuColor(bus.voltagePu, bus.status)}
          />
        );
      })}

      {result.branches.map((branch) => {
        const position = getBranchPosition(data.document, branch.componentId);
        if (!position) return null;
        const lines = [];
        if (options.showActivePowerFlows) lines.push(`P: ${formatPowerKw(branch.activePowerFromKw)}`);
        if (options.showReactivePowerFlows) lines.push(`Q: ${formatReactivePowerKvar(branch.reactivePowerFromKvar)}`);
        if (options.showCurrents) lines.push(`I: ${formatCurrentA(branch.currentFromA)}`);
        if (options.showLoading) lines.push(`Carga: ${formatResultNumber(branch.loadingPercent, 1)} %`);
        if (options.showLosses) lines.push(`Pérdidas: ${formatPowerKw(branch.activeLossKw)}`);
        return (
          <ResultLabel
            key={`branch-${branch.componentId}`}
            x={position.x}
            y={position.y + 4.2}
            title={branchTitle(data.document, branch)}
            lines={lines}
            accent={loadingColor(branch.loadingPercent, branch.status)}
            anchor="center"
          />
        );
      })}

      {options.showEquipmentPower && result.generators.map((generator) => {
        const position = getEquipmentPosition(data.document, generator.componentId);
        if (!position) return null;
        return (
          <ResultLabel
            key={`generator-${generator.componentId}`}
            x={position.x + 6}
            y={position.y + 7}
            title={data.document.nodes?.[generator.componentId]?.properties?.name || generator.componentId}
            lines={[
              `P: ${formatPowerKw(generator.activePowerKw)}`,
              `Q: ${formatReactivePowerKvar(generator.reactivePowerKvar)}`,
            ]}
            accent="#2563eb"
          />
        );
      })}

      {options.showEquipmentPower && result.loads.map((load) => {
        const position = getEquipmentPosition(data.document, load.componentId);
        if (!position) return null;
        return (
          <ResultLabel
            key={`load-${load.componentId}`}
            x={position.x + 6}
            y={position.y + 7}
            title={data.document.nodes?.[load.componentId]?.properties?.name || load.componentId}
            lines={[
              `P: ${formatPowerKw(load.activePowerKw)}`,
              `Q: ${formatReactivePowerKvar(load.reactivePowerKvar)}`,
            ]}
            accent="#7c3aed"
          />
        );
      })}

      {result.transformers.map((transformer) => {
        const position = getEquipmentPosition(data.document, transformer.componentId);
        if (!position) return null;
        return (
          <ResultLabel
            key={`transformer-${transformer.componentId}`}
            x={position.x + 7}
            y={position.y - 4}
            title={data.document.nodes?.[transformer.componentId]?.properties?.name || transformer.componentId}
            lines={[
              options.showActivePowerFlows ? `P: ${formatPowerKw(transformer.activePowerPrimaryKw)}` : null,
              options.showLoading ? `Carga: ${formatResultNumber(transformer.loadingPercent, 1)} %` : null,
              options.showLosses ? `Pérdidas: ${formatPowerKw(transformer.activeLossKw)}` : null,
            ]}
            accent={loadingColor(transformer.loadingPercent, transformer.status)}
          />
        );
      })}
    </>
  );
}
