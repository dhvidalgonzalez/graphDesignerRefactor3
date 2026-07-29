import { Circle } from "react-konva";

export default function ElmTr3Symbol({ node, selected, getVoltageColor }) {
  const radius = 3;
  const offset = radius / 2;
  const colors = [
    getVoltageColor(node.properties.voltageLevelId1, node.properties.outOfService),
    getVoltageColor(node.properties.voltageLevelId2, node.properties.outOfService),
    getVoltageColor(node.properties.voltageLevelId3, node.properties.outOfService),
  ];
  const selectedColor = "#2563eb";
  return (
    <>
      <Circle x={0} y={-offset} radius={radius} stroke={selected ? selectedColor : colors[0]} strokeWidth={selected ? 1.8 : 1} />
      <Circle x={-offset} y={radius - offset} radius={radius} stroke={selected ? selectedColor : colors[1]} strokeWidth={selected ? 1.8 : 1} />
      <Circle x={offset} y={radius - offset} radius={radius} stroke={selected ? selectedColor : colors[2]} strokeWidth={selected ? 1.8 : 1} />
    </>
  );
}
