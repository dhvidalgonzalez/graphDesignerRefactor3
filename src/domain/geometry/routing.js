export function createOrthogonalVertices(source, target) {
  if (source.x === target.x || source.y === target.y) return [];
  const middleX = (source.x + target.x) / 2;
  return [
    { x: middleX, y: source.y },
    { x: middleX, y: target.y },
  ];
}

export function orthogonalizeWaypoint(anchor, point) {
  const deltaX = Math.abs(point.x - anchor.x);
  const deltaY = Math.abs(point.y - anchor.y);
  return deltaX >= deltaY
    ? { x: point.x, y: anchor.y }
    : { x: anchor.x, y: point.y };
}

export function appendOrthogonalTarget(points, target) {
  const anchor = points.at(-1);
  if (!anchor) return [target];
  if (anchor.x === target.x || anchor.y === target.y) return [...points, target];
  const elbow = Math.abs(target.x - anchor.x) >= Math.abs(target.y - anchor.y)
    ? { x: target.x, y: anchor.y }
    : { x: anchor.x, y: target.y };
  return [...points, elbow, target];
}

export function simplifyPolyline(points) {
  const withoutDuplicates = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  if (withoutDuplicates.length <= 2) return withoutDuplicates;
  const simplified = [withoutDuplicates[0]];
  for (let index = 1; index < withoutDuplicates.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = withoutDuplicates[index];
    const next = withoutDuplicates[index + 1];
    const sameVertical = previous.x === current.x && current.x === next.x;
    const sameHorizontal = previous.y === current.y && current.y === next.y;
    if (!sameVertical && !sameHorizontal) simplified.push(current);
  }
  simplified.push(withoutDuplicates.at(-1));
  return simplified;
}
