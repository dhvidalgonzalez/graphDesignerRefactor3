import { Circle, Rect, Text } from "react-konva";

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function AnnotationRectangleSymbol({ node }) {
  const width = Math.max(2, number(node.properties.width, 24));
  const height = Math.max(2, number(node.properties.height, 14));
  return (
    <Rect
      x={-width / 2}
      y={-height / 2}
      width={width}
      height={height}
      cornerRadius={Math.max(0, number(node.properties.cornerRadius, 0))}
      fill={node.properties.fillColor || "#dbeafe"}
      stroke={node.properties.strokeColor || "#2563eb"}
      strokeWidth={Math.max(0.1, number(node.properties.strokeWidth, 0.8))}
      opacity={Math.min(1, Math.max(0.05, number(node.properties.opacity, 0.35)))}
      listening={false}
    />
  );
}

export function AnnotationSquareSymbol({ node }) {
  const size = Math.max(2, number(node.properties.size, 16));
  return (
    <Rect
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      cornerRadius={Math.max(0, number(node.properties.cornerRadius, 0))}
      fill={node.properties.fillColor || "#dcfce7"}
      stroke={node.properties.strokeColor || "#15803d"}
      strokeWidth={Math.max(0.1, number(node.properties.strokeWidth, 0.8))}
      opacity={Math.min(1, Math.max(0.05, number(node.properties.opacity, 0.35)))}
      listening={false}
    />
  );
}

export function AnnotationCircleSymbol({ node }) {
  const radius = Math.max(1, number(node.properties.radius, 8));
  return (
    <Circle
      radius={radius}
      fill={node.properties.fillColor || "#fef3c7"}
      stroke={node.properties.strokeColor || "#b45309"}
      strokeWidth={Math.max(0.1, number(node.properties.strokeWidth, 0.8))}
      opacity={Math.min(1, Math.max(0.05, number(node.properties.opacity, 0.35)))}
      listening={false}
    />
  );
}

export function AnnotationTextSymbol({ node }) {
  const width = Math.max(5, number(node.properties.width, 40));
  const fontSize = Math.max(1.5, number(node.properties.fontSize, 5));
  const text = String(node.properties.text || node.properties.name || "Texto");
  return (
    <Text
      text={text}
      x={-width / 2}
      y={-fontSize * 0.65}
      width={width}
      align={node.properties.align || "left"}
      fontSize={fontSize}
      fontStyle={node.properties.bold ? "bold" : "normal"}
      fontFamily={node.properties.fontFamily || "Arial"}
      fill={node.properties.color || "#0f172a"}
      padding={number(node.properties.padding, 0)}
      listening={false}
    />
  );
}
