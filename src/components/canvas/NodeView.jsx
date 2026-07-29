import { useRef } from "react";
import { Circle, Group, Rect, Text } from "react-konva";
import { shallowEqual, useEditorActions, useEditorSelector, useEditorStore } from "../../editor/EditorContext.jsx";
import { getNodeBounds, getNodePorts, getSymbolDefinition, getVoltageColor } from "../../domain/catalog/symbolCatalog.js";

const DRAW_TOOLS = new Set(["path", "line"]);

export default function NodeView({ nodeId }) {
  const data = useEditorSelector((state) => ({
    node: state.document.nodes[nodeId],
    metadata: state.document.metadata,
    selected: state.selection.nodeIds.includes(nodeId),
    tool: state.tool,
    showPorts: state.settings.showPorts,
    viewportScale: state.viewport.scale,
    draftSource: state.connectionDraft?.source ?? null,
  }), shallowEqual);
  const actions = useEditorActions();
  const store = useEditorStore();
  const readOnly = store.readOnly;
  const groupRef = useRef(null);
  const { node } = data;
  if (!node) return null;

  const definition = getSymbolDefinition(node.type);
  const SymbolComponent = definition.component;
  const ports = getNodePorts(node);
  const bounds = getNodeBounds(node);
  const label = definition.labelPlacement;
  const drawing = DRAW_TOOLS.has(data.tool);
  const portsVisible = data.showPorts || drawing || data.selected;
  const colorForVoltage = (levelId, outOfService) => getVoltageColor(data.metadata, levelId, outOfService);

  const selectForInteraction = (event) => {
    event.cancelBubble = true;
    if (data.tool !== "select") return;
    const toggle = event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey;
    if (!data.selected || toggle) actions.selectNode(node.id, toggle ? "toggle" : "replace");
  };

  const handleBodyClick = (event) => {
    if (data.tool === "electrical") {
      event.cancelBubble = true;
      actions.selectNode(node.id);
      if (definition.electrical !== false) {
        actions.openElectricalEditor("node", node.id);
      }
      return;
    }
    if (drawing && definition.dynamicPort) {
      event.cancelBubble = true;
      const localPoint = groupRef.current?.getRelativePointerPosition();
      if (localPoint) actions.connectDynamicPort(node.id, localPoint);
    }
  };

  return (
    <Group
      ref={groupRef}
      x={node.position.x}
      y={node.position.y}
      rotation={node.rotation ?? 0}
      draggable={!readOnly && data.tool === "select"}
      onMouseDown={selectForInteraction}
      onClick={handleBodyClick}
      onTap={(event) => {
        if (data.tool === "electrical" || (drawing && definition.dynamicPort)) handleBodyClick(event);
        else selectForInteraction(event);
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        if (!data.selected) actions.selectNode(node.id);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        actions.moveNodeTo(node.id, { x: event.target.x(), y: event.target.y() });
      }}
    >
      <Rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="rgba(255,255,255,0.001)"
        stroke={data.selected ? "#2563eb" : undefined}
        strokeWidth={data.selected ? 0.8 / data.viewportScale : 0}
        dash={data.selected ? [2, 1.5] : undefined}
        listening
      />

      <SymbolComponent node={node} selected={data.selected} getVoltageColor={colorForVoltage} />

      {definition.showDefaultLabel !== false && node.properties.name && (
        <Text text={node.properties.name} x={label.x} y={label.y} width={label.width} align={label.align} fontSize={3.2} fill="#334155" listening={false} />
      )}

      {portsVisible && ports.map((port) => {
        const active = data.draftSource?.nodeId === node.id && String(data.draftSource.portId) === String(port.id);
        return (
          <Circle
            key={`${node.id}-${port.id}`}
            x={port.x}
            y={port.y}
            radius={active ? 1.7 : 1.15}
            fill={active ? "#f59e0b" : "#ffffff"}
            stroke={active ? "#b45309" : drawing ? "#0f766e" : "#64748b"}
            opacity={drawing || data.selected ? 1 : 0.65}
            strokeWidth={0.65}
            hitStrokeWidth={5}
            onMouseDown={(event) => { event.cancelBubble = true; }}
            onClick={(event) => {
              event.cancelBubble = true;
              if (drawing) actions.completeConnection(node.id, port.id);
              else if (data.tool === "electrical") {
                actions.selectNode(node.id);
                if (definition.electrical !== false) {
                  actions.openElectricalEditor("node", node.id);
                }
              }
            }}
            onTap={(event) => {
              event.cancelBubble = true;
              if (drawing) actions.completeConnection(node.id, port.id);
            }}
          />
        );
      })}
    </Group>
  );
}
