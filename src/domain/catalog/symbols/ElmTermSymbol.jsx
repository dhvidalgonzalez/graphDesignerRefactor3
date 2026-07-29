import { Circle, Line } from "react-konva";

export default function ElmTermSymbol({ node, selected, getVoltageColor }) {
  const width = 30 * (node.properties.sizeX ?? 1);
  const color = selected ? "#2563eb" : getVoltageColor(node.properties.voltageLevelId, node.properties.outOfService);
  const symbolName = node.properties.symbolName ?? "TermStrip";
  if (symbolName === "PointTerm") return <Circle x={0} y={0} radius={1.4} fill={color} />;
  const visualWidth = symbolName === "LineTerm" ? 8 : symbolName === "ShortTermStrip" ? width * 0.55 : width;
  return <Line points={[-visualWidth / 2, 0, visualWidth / 2, 0]} stroke={color} strokeWidth={selected ? 2.4 : 2} />;
}
