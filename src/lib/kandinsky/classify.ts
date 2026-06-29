import type { InkPoint } from '../../types';

export type ShapeClass = 'line' | 'circle' | 'triangle' | 'square' | 'freeform';

export interface ClassifiedShape {
  type: ShapeClass;
  /** Leftmost x of the stroke — used as the playhead trigger position. */
  minX: number;
  /** Vertical center — mapped to pitch. */
  centerY: number;
}

/** Squared distance from point p to segment p1→p2. */
function sqSegDist(p: InkPoint, p1: InkPoint, p2: InkPoint): number {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}

/** Ramer–Douglas–Peucker simplification; returns the kept corner points. */
function rdp(points: InkPoint[], epsilon: number): InkPoint[] {
  if (points.length <= 2) return points;
  let maxSq = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = sqSegDist(points[i], points[0], points[end]);
    if (d > maxSq) {
      index = i;
      maxSq = d;
    }
  }
  if (maxSq > epsilon * epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [points[0], points[end]];
}

/** Normalized radius variance about the centroid (0 = perfect circle). */
function circleVariance(points: InkPoint[], cx: number, cy: number): number {
  const dists = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const avg = dists.reduce((s, d) => s + d, 0) / dists.length;
  const variance = dists.reduce((s, d) => s + (d - avg) ** 2, 0) / dists.length;
  return variance / (avg * avg || 1);
}

export function classifyShape(points: InkPoint[]): ClassifiedShape {
  if (points.length < 3) {
    return { type: 'line', minX: points[0]?.x ?? 0, centerY: points[0]?.y ?? 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }
  const centerX = sumX / points.length;
  const centerY = sumY / points.length;
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const start = points[0];
  const end = points[points.length - 1];
  const endpointsDist = Math.hypot(start.x - end.x, start.y - end.y);

  // Closed-loop gate: endpoints near each other relative to the shape's size.
  const isClosed =
    endpointsDist < diag * 0.25 || (points.length > 20 && endpointsDist < 30);

  if (!isClosed) {
    return { type: diag > 150 ? 'line' : 'freeform', minX, centerY };
  }

  // A square's corner-vs-edge radius variance (~0.015) is low enough to look
  // round under a loose threshold; keep this tight so squares fall through to
  // corner-counting. A true circle sits near 0.
  if (circleVariance(points, centerX, centerY) < 0.008) {
    return { type: 'circle', minX, centerY };
  }

  // Corner count on the closed path. RDP keeps the duplicated closing point,
  // so a triangle simplifies to 4 kept points and a square to 5.
  const simplified = rdp(points, diag * 0.08);
  const corners = simplified.length - 1;
  if (corners === 3) return { type: 'triangle', minX, centerY };
  if (corners === 4) return { type: 'square', minX, centerY };

  return { type: 'freeform', minX, centerY };
}
