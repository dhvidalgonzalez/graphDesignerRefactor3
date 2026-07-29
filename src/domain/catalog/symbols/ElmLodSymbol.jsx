import { Line, RegularPolygon } from "react-konva";

export default function ElmLodSymbol({ node, selected, getVoltageColor }) {
  const color = selected ? "#2563eb" : getVoltageColor(node.properties.voltageLevelId, node.properties.outOfService);
  return (
    <>
      <Line points={[0, 0, 0, -13]} stroke={color} strokeWidth={selected ? 1.8 : 1} />
      <RegularPolygon x={0} y={0} sides={3} radius={5} rotation={180} stroke={color} strokeWidth={selected ? 1.8 : 1} />
    </>
  );
}
