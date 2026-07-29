import { Line } from "react-konva";

export default function ElmCoupSymbol({ node, selected, getVoltageColor }) {
  const color = selected ? "#2563eb" : getVoltageColor(node.properties.voltageLevelId, node.properties.outOfService);
  const open = node.properties.switchingState === "Abierto";
  return (
    <>
      <Line points={[0, -6, 0, -1.5]} stroke={color} strokeWidth={selected ? 1.8 : 0.9} />
      <Line points={[0, 1.5, 0, 6]} stroke={color} strokeWidth={selected ? 1.8 : 0.9} />
      <Line points={open ? [0, -1.5, 2.2, 1.2] : [0, -1.5, 0, 1.5]} stroke={color} strokeWidth={selected ? 1.8 : 0.9} />
    </>
  );
}
