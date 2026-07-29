import { Line } from "react-konva";

export default function ElmShntSymbol({ node, selected, getVoltageColor }) {
  const color = selected ? "#2563eb" : getVoltageColor(node.properties.voltageLevelId, node.properties.outOfService);
  return (
    <>
      <Line points={[0, 0, 0, -13]} stroke={color} strokeWidth={selected ? 1.8 : 1} />
      <Line points={[-2.5, 0, 2.5, 0]} stroke={color} strokeWidth={selected ? 1.8 : 1} />
      <Line points={[-2.5, 2, 2.5, 2]} stroke={color} strokeWidth={selected ? 1.8 : 1} />
      <Line points={[-1.5, 4, 1.5, 4]} stroke={color} strokeWidth={selected ? 1.8 : 1} />
    </>
  );
}
