import type { InkPoint, Stroke } from '../types';

/**
 * Pure geometry helpers for the drawing engine.
 *
 * These were extracted from {@link useDrawing} so they can be unit-tested in
 * isolation — they're the math behind eraser hit-testing and selection, and
 * have no React, DOM, or canvas dependencies.
 */

/** Shortest distance from point P to segment AB, for eraser hit-testing. */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Minimum line width so thin ink stays legible to the OCR engine. */
export const MIN_STROKE_WIDTH = 6;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** View transform: world → screen is `screen = (world - pan) * scale`. */
export interface ViewTransform {
  scale: number;
  panX: number;
  panY: number;
}

export const IDENTITY_VIEW: ViewTransform = { scale: 1, panX: 0, panY: 0 };

/** Allowed zoom range. */
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** Convert a screen-space (canvas-relative) point to world space. */
export function screenToWorld(
  sx: number,
  sy: number,
  view: ViewTransform,
): { x: number; y: number } {
  return { x: sx / view.scale + view.panX, y: sy / view.scale + view.panY };
}

/** Convert a world-space point to screen space (canvas-relative). */
export function worldToScreen(
  wx: number,
  wy: number,
  view: ViewTransform,
): { x: number; y: number } {
  return { x: (wx - view.panX) * view.scale, y: (wy - view.panY) * view.scale };
}

/**
 * Axis-aligned bounding box of a single stroke, padded for stroke width.
 * Returns `null` for a pointless stroke. Pure — per-frame consumers (viewport
 * culling) cache the result per committed stroke in render.ts.
 */
export function strokeBounds(stroke: Stroke): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const half = Math.max(stroke.size, MIN_STROKE_WIDTH) / 2;
  for (const p of stroke.points) {
    minX = Math.min(minX, p.x - half);
    minY = Math.min(minY, p.y - half);
    maxX = Math.max(maxX, p.x + half);
    maxY = Math.max(maxY, p.y + half);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Axis-aligned bounding box of all ink, padded for stroke width. Returns `null`
 * when there are no points (an "empty" drawing), so callers can short-circuit.
 */
export function inkBounds(strokes: Stroke[]): Bounds | null {
  let acc: Bounds | null = null;
  for (const stroke of strokes) {
    const b = strokeBounds(stroke);
    if (!b) continue;
    if (!acc) {
      acc = { ...b };
    } else {
      acc.minX = Math.min(acc.minX, b.minX);
      acc.minY = Math.min(acc.minY, b.minY);
      acc.maxX = Math.max(acc.maxX, b.maxX);
      acc.maxY = Math.max(acc.maxY, b.maxY);
    }
  }
  return acc;
}

/** True when two bounds rects overlap (touching edges count as overlap). */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Eraser contact radius scales with the selected size, with a usable floor. */
export function eraserRadius(size: number): number {
  return Math.max(12, size * 3);
}

/** True if any segment of the stroke comes within `radius` of (x, y). */
export function hitsStroke(
  stroke: Stroke,
  x: number,
  y: number,
  radius: number,
): boolean {
  const pts = stroke.points;
  const threshold = radius + stroke.size / 2;
  if (pts.length === 0) return false;
  if (pts.length === 1) {
    return Math.hypot(pts[0].x - x, pts[0].y - y) <= threshold;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Ray-casting point-in-polygon test.
 * Returns true if (px, py) is strictly inside the closed polygon defined by
 * `path`. Points exactly on an edge may return either true or false.
 */
export function pointInPolygon(
  px: number,
  py: number,
  path: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  let inside = false;
  const n = path.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = path[i].x, yi = path[i].y;
    const xj = path[j].x, yj = path[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * True if at least one point of the stroke lies inside the lasso polygon.
 * Requires at least 3 lasso points to form a closed region.
 */
export function strokeInLasso(
  stroke: Stroke,
  lasso: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  if (lasso.length < 3) return false;
  for (const p of stroke.points) {
    if (pointInPolygon(p.x, p.y, lasso)) return true;
  }
  return false;
}

/** Translate a Bounds rect by (dx, dy). */
export function shiftBounds(b: Bounds, dx: number, dy: number): Bounds {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}

/**
 * True when (x, y) lies within the bounds rect expanded outward by `pad` px.
 * `pad` should match the visual selection rect padding so the hit zone equals
 * what the user sees.
 */
export function hitsSelectionBounds(
  b: Bounds,
  x: number,
  y: number,
  pad = 8,
): boolean {
  return x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;
}

/**
 * Return a new stroke array with (dx, dy) applied to all points of strokes
 * whose id is in `ids`. Strokes not in `ids` are returned by reference
 * (no allocation).
 */
export function applyMoveOffset(
  strokes: Stroke[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): Stroke[] {
  return strokes.map((s) => {
    if (!ids.has(s.id)) return s;
    return {
      ...s,
      points: s.points.map((p: InkPoint) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    };
  });
}
