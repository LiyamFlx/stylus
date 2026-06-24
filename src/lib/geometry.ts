import type { Stroke } from '../types';

/**
 * Pure geometry helpers for the drawing engine.
 *
 * These were extracted from {@link useDrawing} so they can be unit-tested in
 * isolation — they're the math behind eraser hit-testing and have no React,
 * DOM, or canvas dependencies.
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

/**
 * Axis-aligned bounding box of all ink, padded for stroke width. Returns `null`
 * when there are no points (an "empty" drawing), so callers can short-circuit.
 */
export function inkBounds(strokes: Stroke[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    const half = Math.max(stroke.size, MIN_STROKE_WIDTH) / 2;
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x - half);
      minY = Math.min(minY, p.y - half);
      maxX = Math.max(maxX, p.x + half);
      maxY = Math.max(maxY, p.y + half);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
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
