import { Line, Rect, RegularPolygon } from "react-konva";

export default function ElmGenstatSymbol({ node, selected, getVoltageColor }) {
  const color = selected ? "#2563eb" : getVoltageColor(node.properties.voltageLevelId, node.properties.outOfService);
  return (
    <>
      <Line points={[0, 0, 0, -13]} stroke={color} strokeWidth={selected ? 1.8 : 1} />
      <RegularPolygon x={0} y={0} sides={3} radius={3} rotation={180} stroke={color} strokeWidth={selected ? 1.8 : 1} />
      <Rect x={-3} y={-2} width={6} height={10} stroke={color} strokeWidth={selected ? 1.8 : 1} />
    </>
  );
}
