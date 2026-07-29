import { Line } from "react-konva";
import { useMemo } from "react";
import { useEditorSelector, shallowEqual } from "../../editor/EditorContext.jsx";

export default function GridLayer({ width, height }) {
  const { viewport, settings } = useEditorSelector(
    (state) => ({ viewport: state.viewport, settings: state.settings }),
    shallowEqual,
  );

  const lines = useMemo(() => {
    if (!settings.gridVisible) return [];
    const grid = settings.gridSize;
    const left = -viewport.x / viewport.scale;
    const top = -viewport.y / viewport.scale;
    const right = left + width / viewport.scale;
    const bottom = top + height / viewport.scale;
    const startX = Math.floor(left / grid) * grid;
    const startY = Math.floor(top / grid) * grid;
    const result = [];

    for (let x = startX; x <= right + grid; x += grid) {
      const index = Math.round(x / grid);
      result.push({ key: `v-${index}`, points: [x, top, x, bottom], major: index % 5 === 0 });
    }
    for (let y = startY; y <= bottom + grid; y += grid) {
      const index = Math.round(y / grid);
      result.push({ key: `h-${index}`, points: [left, y, right, y], major: index % 5 === 0 });
    }
    return result;
  }, [height, settings.gridSize, settings.gridVisible, viewport, width]);

  return lines.map((line) => (
    <Line
      key={line.key}
      points={line.points}
      stroke={line.major ? "#cbd5e1" : "#e8edf3"}
      strokeWidth={(line.major ? 0.7 : 0.35) / viewport.scale}
      listening={false}
    />
  ));
}
