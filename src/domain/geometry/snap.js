export const DEFAULT_GRID_SIZE = 2.5;

export function snapValue(value, gridSize = DEFAULT_GRID_SIZE) {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point, gridSize = DEFAULT_GRID_SIZE, enabled = true) {
  if (!enabled) return { ...point };
  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}
