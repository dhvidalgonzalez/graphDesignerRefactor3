import { Circle, Line } from "react-konva";

export default function ElmTr2Symbol({ node, selected, getVoltageColor }) {
  const first = getVoltageColor(node.properties.voltageLevelId1, node.properties.outOfService);
  const second = getVoltageColor(node.properties.voltageLevelId2, node.properties.outOfService);
  const selectedColor = "#2563eb";
  return (
    <>
      <Line points={[0, -5, 0, -4.8]} stroke={selected ? selectedColor : first} />
      <Circle x={0} y={-2} radius={3} stroke={selected ? selectedColor : first} strokeWidth={selected ? 1.8 : 1} />
      <Circle x={0} y={2} radius={3} stroke={selected ? selectedColor : second} strokeWidth={selected ? 1.8 : 1} />
    </>
  );
}
