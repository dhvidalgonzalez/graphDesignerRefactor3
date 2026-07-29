export const MIN_SCALE = 0.6;
export const MAX_SCALE = 12;

export function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function zoomViewportAt(viewport, screenPoint, nextScale) {
  const scale = clampScale(nextScale);
  const worldPoint = screenToWorld(screenPoint, viewport);

  return {
    ...viewport,
    scale,
    x: screenPoint.x - worldPoint.x * scale,
    y: screenPoint.y - worldPoint.y * scale,
  };
}
