import { Circle, Line } from "react-konva";

export default function ElmSymSymbol({ node, selected, getVoltageColor }) {
  const color = selected ? "#2563eb" : getVoltageColor(node.properties.voltageLevelId, node.properties.outOfService);
  return (
    <>
      <Line points={[0, 2, 0, -13]} stroke={color} strokeWidth={selected ? 1.8 : 1} />
      <Circle x={0} y={2} radius={3} stroke={color} strokeWidth={selected ? 1.8 : 1} />
    </>
  );
}
