import type { InkPoint, Shape, ShapeType, Stroke, TextItem } from '../types';

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

export interface ZoomRange {
  min: number;
  max: number;
}

/**
 * Clamp zoom. The optional range widens/narrows per mode (Phase 3 item 2:
 * Canvas wants 0.1–8x, Notebook's fixed page stays conservative) — one
 * function, an explicit range, no parallel bounds checks.
 */
export function clampScale(scale: number, range?: ZoomRange): number {
  const min = range?.min ?? MIN_SCALE;
  const max = range?.max ?? MAX_SCALE;
  return Math.max(min, Math.min(max, scale));
}

/** One two-finger frame: both touch points in screen coords. */
export interface PinchSample {
  ax: number; ay: number;
  bx: number; by: number;
}

/**
 * Pure pinch step between two samples: scale factor from the distance ratio,
 * the current midpoint (zoom anchor), and the midpoint's screen movement
 * (pan). Rotation is deliberately NOT derived here — it lands as its own
 * transform-audit ticket, not a by-product of pinch.
 */
export function pinchDelta(prev: PinchSample, next: PinchSample): {
  factor: number;
  midX: number;
  midY: number;
  panDx: number;
  panDy: number;
} {
  const prevDist = Math.hypot(prev.bx - prev.ax, prev.by - prev.ay);
  const nextDist = Math.hypot(next.bx - next.ax, next.by - next.ay);
  const factor = prevDist > 0 ? nextDist / prevDist : 1;
  const prevMidX = (prev.ax + prev.bx) / 2;
  const prevMidY = (prev.ay + prev.by) / 2;
  const midX = (next.ax + next.bx) / 2;
  const midY = (next.ay + next.by) / 2;
  return { factor, midX, midY, panDx: midX - prevMidX, panDy: midY - prevMidY };
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
 * Padding is PER-POINT: pressure-derived point widths can exceed the base
 * size, and padding only by `size` clipped heavy-pressure ink at viewport-cull
 * edges (and drew selection rects that didn't hug wide strokes). Returns
 * `null` for a pointless stroke. Pure — per-frame consumers (viewport
 * culling) cache the result per committed stroke in render.ts.
 */
export function strokeBounds(stroke: Stroke): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const base = Math.max(stroke.size, MIN_STROKE_WIDTH);
  for (const p of stroke.points) {
    const half = Math.max(base, p.width ?? 0) / 2;
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
    acc = acc ? mergeBounds(acc, b) : { ...b };
  }
  return acc;
}

/** Union of two bounds rects — the smallest rect containing both. */
export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Approximate bounding box of a text box: width from its longest line at
 * ~0.6em/char (a reasonable average glyph-width heuristic, no DOM measurement
 * available here), height from line count at 1.2em line-height. Good enough
 * for "zoom to fit" — not used for hit-testing or layout precision.
 */
export function textItemBounds(item: TextItem): Bounds {
  const lines = (item.text || ' ').split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const width = longest * item.size * 0.6;
  const height = lines.length * item.size * 1.2;
  return { minX: item.x, minY: item.y, maxX: item.x + width, maxY: item.y + height };
}

/** Axis-aligned bounding box of every text item, or `null` when there are none. */
export function textBounds(items: TextItem[]): Bounds | null {
  let acc: Bounds | null = null;
  for (const item of items) {
    const b = textItemBounds(item);
    acc = acc ? mergeBounds(acc, b) : b;
  }
  return acc;
}

/**
 * Axis-aligned bounding box of a shape, padded for its stroke width — same
 * padding reasoning as {@link strokeBounds} (a thick outline extends past
 * the raw x1/y1–x2/y2 corners). `(x1,y1)`/`(x2,y2)` aren't guaranteed
 * min/max ordered (a rect dragged up-and-left has x2<x1, y2<y1), so this
 * normalizes before padding.
 *
 * When `rotation` is set, the AABB is computed from the shape's 4 corners
 * rotated about its own center (not just the unrotated box) — a rotated
 * rectangle's true screen footprint is larger than its unrotated one, and
 * culling/selection-rect display both need the REAL footprint, not a box
 * that clips the rotated corners.
 */
export function shapeBounds(shape: Shape): Bounds {
  const half = Math.max(shape.size, MIN_STROKE_WIDTH) / 2;
  const unrotated: Bounds = {
    minX: Math.min(shape.x1, shape.x2) - half,
    minY: Math.min(shape.y1, shape.y2) - half,
    maxX: Math.max(shape.x1, shape.x2) + half,
    maxY: Math.max(shape.y1, shape.y2) + half,
  };
  if (!shape.rotation) return unrotated;

  const cx = (unrotated.minX + unrotated.maxX) / 2;
  const cy = (unrotated.minY + unrotated.maxY) / 2;
  const cos = Math.cos(shape.rotation);
  const sin = Math.sin(shape.rotation);
  const corners = [
    [unrotated.minX, unrotated.minY],
    [unrotated.maxX, unrotated.minY],
    [unrotated.minX, unrotated.maxY],
    [unrotated.maxX, unrotated.maxY],
  ] as const;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    const dx = x - cx;
    const dy = y - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }
  return { minX, minY, maxX, maxY };
}

/** Axis-aligned bounding box of a set of shapes, or `null` when empty —
 *  mirrors {@link inkBounds}'s contract for strokes. */
export function shapesBounds(shapes: Shape[]): Bounds | null {
  let acc: Bounds | null = null;
  for (const shape of shapes) {
    const b = shapeBounds(shape);
    acc = acc ? mergeBounds(acc, b) : b;
  }
  return acc;
}

/**
 * Combined bounding box of a mixed stroke+shape selection — the union rect
 * of {@link inkBounds} and {@link shapesBounds}. `null` only when both are
 * empty; either alone is returned as-is (no merge against a nonexistent box).
 */
export function combinedBounds(strokes: Stroke[], shapes: Shape[]): Bounds | null {
  const sb = inkBounds(strokes);
  const pb = shapesBounds(shapes);
  if (sb && pb) return mergeBounds(sb, pb);
  return sb ?? pb;
}

/**
 * Conservative lasso hit-test for a shape: true if the shape's bounding box
 * overlaps the lasso region at all — checked both directions (any bounding-
 * box corner inside the lasso polygon, OR any lasso point inside the
 * bounding box) so a lasso drawn entirely inside a large shape still counts
 * as a hit, not just a lasso that crosses the shape's edge. This is the
 * shape analog of {@link strokeInLasso}'s per-point polygon containment —
 * shapes have no point array to test, so their bounding box stands in for
 * "any part of it," which is correct for the use case (rough gestural
 * selection, not pixel-perfect path intersection) per the same reasoning
 * that already applies to stroke lasso-selection.
 */
export function shapeInLasso(
  shape: Shape,
  lasso: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  if (lasso.length < 3) return false;
  const b = shapeBounds(shape);
  const corners: [number, number][] = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.minX, b.maxY],
    [b.maxX, b.maxY],
  ];
  for (const [x, y] of corners) {
    if (pointInPolygon(x, y, lasso)) return true;
  }
  for (const p of lasso) {
    if (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY) return true;
  }
  return false;
}

/** Translate the selected shapes by (dx, dy) — the shape analog of
 *  {@link applyMoveOffset}. Shapes not in `ids` are returned by reference. */
export function applyMoveOffsetToShapes(
  shapes: Shape[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): Shape[] {
  return shapes.map((s) => {
    if (!ids.has(s.id)) return s;
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  });
}

/** Uniform scale of the selected shapes about a fixed pivot — the shape
 *  analog of {@link applyScaleOffset}. Both corners scale, and the outline
 *  width scales too (same "don't keep a too-thick line after shrinking"
 *  reasoning as the stroke version). */
export function applyScaleOffsetToShapes(
  shapes: Shape[],
  ids: ReadonlySet<string>,
  pivotX: number,
  pivotY: number,
  scale: number,
): Shape[] {
  return shapes.map((s) => {
    if (!ids.has(s.id)) return s;
    return {
      ...s,
      size: s.size * scale,
      x1: pivotX + (s.x1 - pivotX) * scale,
      y1: pivotY + (s.y1 - pivotY) * scale,
      x2: pivotX + (s.x2 - pivotX) * scale,
      y2: pivotY + (s.y2 - pivotY) * scale,
    };
  });
}

/**
 * Rotate the selected shapes about a fixed pivot (the selection's center,
 * per the selection-toolbar rotate gesture — not necessarily any one
 * shape's own center) — the shape analog of {@link applyRotateOffset}.
 *
 * Branches by type because rect/ellipse and line/arrow encode orientation
 * differently, and rotating both the same way double-applies the rotation:
 *
 * - **line/arrow**: the two endpoints ARE the orientation — no separate
 *   `rotation` concept. Rotate the endpoints about the pivot directly, the
 *   same as a stroke's points. `rotation` stays untouched (always 0/unset).
 * - **rect/ellipse**: x1/y1–x2/y2 must keep describing the shape's
 *   UNROTATED box (shapeBounds and the renderer both rely on that), so
 *   rotate must NOT touch the corners directly — only the shape's CENTER
 *   moves (orbiting the pivot, so the box relocates correctly within a
 *   multi-shape selection), and the box keeps its original width/height
 *   re-centered there. The `rotation` field is the only thing that
 *   accumulates the angle. Doing both (rotating corners AND incrementing
 *   `rotation`) would apply the same rotation twice.
 */
export function applyRotateOffsetToShapes(
  shapes: Shape[],
  ids: ReadonlySet<string>,
  pivotX: number,
  pivotY: number,
  angleRad: number,
): Shape[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rotateAboutPivot = (x: number, y: number) => {
    const dx = x - pivotX;
    const dy = y - pivotY;
    return { x: pivotX + dx * cos - dy * sin, y: pivotY + dx * sin + dy * cos };
  };
  return shapes.map((s) => {
    if (!ids.has(s.id)) return s;

    if (s.type === 'line' || s.type === 'arrow') {
      const p1 = rotateAboutPivot(s.x1, s.y1);
      const p2 = rotateAboutPivot(s.x2, s.y2);
      return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }

    // rect / ellipse: reposition the center, keep the box's own
    // width/height, only the `rotation` field absorbs the angle.
    const cx = (s.x1 + s.x2) / 2;
    const cy = (s.y1 + s.y2) / 2;
    const nextCenter = rotateAboutPivot(cx, cy);
    const halfW = (s.x2 - s.x1) / 2;
    const halfH = (s.y2 - s.y1) / 2;
    return {
      ...s,
      x1: nextCenter.x - halfW,
      y1: nextCenter.y - halfH,
      x2: nextCenter.x + halfW,
      y2: nextCenter.y + halfH,
      rotation: (s.rotation ?? 0) + angleRad,
    };
  });
}

/** A4 page rect in CSS px at 96dpi (210mm × 297mm) — the world-space page
 *  bounds for notebook documents. */
export const A4_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 794, maxY: 1123 };

/** Minimum px of the bounds rect that must stay visible on each axis. */
const MIN_BOUNDS_VISIBLE = 48;

/** Max px of empty space allowed above the page top (matches the initial
 *  TOP_GAP the page opens at, so scrolling up can't reveal more black space
 *  above the sheet than the toolbar clearance already accounts for). */
const MAX_TOP_GAP = 132;

/**
 * Clamp a view's pan so `bounds` can never be panned fully off-screen
 * (Phase 1 item 5 — notebook fixed-page feel). Pure: returns the same object
 * when no clamping is needed. Applied at the commitView choke point so zoom
 * anchoring and pan share one rule; `null` bounds = infinite modes, no-op.
 */
export function clampPanToBounds(
  view: { scale: number; panX: number; panY: number },
  bounds: Bounds,
  viewportW: number,
  viewportH: number,
): { scale: number; panX: number; panY: number } {
  const { scale } = view;
  const mv = MIN_BOUNDS_VISIBLE;

  // panX range keeping ≥mv px of bounds on screen horizontally.
  const minPanX = bounds.minX - (viewportW - mv) / scale;
  const maxPanX = bounds.maxX - mv / scale;
  // panY's lower bound is the tighter of "mv px visible" and "no more than
  // MAX_TOP_GAP of empty space above the page top" — otherwise scrolling up
  // reveals a large empty gap between the toolbar and the page.
  const minPanY = Math.max(
    bounds.minY - (viewportH - mv) / scale,
    bounds.minY - MAX_TOP_GAP / scale,
  );
  const maxPanY = bounds.maxY - mv / scale;

  // Degenerate window (extreme zoom): pin to the range midpoint.
  const panX = minPanX > maxPanX
    ? (minPanX + maxPanX) / 2
    : Math.min(Math.max(view.panX, minPanX), maxPanX);
  const panY = minPanY > maxPanY
    ? (minPanY + maxPanY) / 2
    : Math.min(Math.max(view.panY, minPanY), maxPanY);

  if (panX === view.panX && panY === view.panY) return view;
  return { scale, panX, panY };
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
 * Splits a stroke's points at eraser contact, returning the surviving runs
 * of contiguous points (each a fragment of the original stroke) — or `null`
 * if the eraser doesn't touch the stroke at all, so callers can leave it
 * untouched. An empty array means every point was erased (stroke removed).
 *
 * A point is "erased" if it falls within contact threshold of (x, y); a
 * segment between two surviving points is also erased if the segment itself
 * passes within threshold, even when both endpoints survive (fast eraser
 * strokes can hop over a point while still crossing the line between two
 * survivors) — in that case the segment is cut and the two points become
 * endpoints of separate fragments.
 */
export function splitStrokeAtErase(
  stroke: Stroke,
  x: number,
  y: number,
  radius: number,
): InkPoint[][] | null {
  const pts = stroke.points;
  const threshold = radius + stroke.size / 2;
  if (pts.length === 0) return null;

  if (pts.length === 1) {
    return Math.hypot(pts[0].x - x, pts[0].y - y) <= threshold ? [] : null;
  }

  const fragments: InkPoint[][] = [];
  let current: InkPoint[] = [];
  let hitAny = false;

  const pointErased = (p: InkPoint) => Math.hypot(p.x - x, p.y - y) <= threshold;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (pointErased(p)) {
      hitAny = true;
      if (current.length > 0) fragments.push(current);
      current = [];
      continue;
    }
    if (i > 0) {
      const prev = pts[i - 1];
      if (
        !pointErased(prev) &&
        distanceToSegment(x, y, prev.x, prev.y, p.x, p.y) <= threshold
      ) {
        hitAny = true;
        if (current.length > 0) fragments.push(current);
        current = [];
      }
    }
    current.push(p);
  }
  if (current.length > 0) fragments.push(current);

  if (!hitAny) return null;
  return fragments.filter((f) => f.length > 1);
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

/**
 * Which selection handle a pointer landed on, or null for "inside the
 * selection body" / "outside entirely". Corner handles resize (uniform
 * scale, anchored at the opposite corner); the rotate handle sits above
 * top-center on a stem, matching the constants drawSelectionRect uses to
 * paint them — HANDLE_HIT_RADIUS is deliberately larger than the painted
 * handle radius (a bigger hit target than visual target is standard touch
 * UX, not a bug).
 */
export type SelectionHandle =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'rotate';

/** World-space distance above the top edge where the rotate handle sits. */
export const ROTATE_HANDLE_OFFSET = 28;
/** Generous hit radius around each handle center — bigger than the painted
 *  dot so corner/rotate handles are easy to grab with a fingertip, not just
 *  a stylus tip. */
const HANDLE_HIT_RADIUS = 14;

export function hitsSelectionHandle(
  b: Bounds,
  x: number,
  y: number,
  pad = 8,
): SelectionHandle | null {
  const minX = b.minX - pad;
  const minY = b.minY - pad;
  const maxX = b.maxX + pad;
  const maxY = b.maxY + pad;
  const centerX = (minX + maxX) / 2;

  const corners: [SelectionHandle, number, number][] = [
    ['nw', minX, minY],
    ['ne', maxX, minY],
    ['sw', minX, maxY],
    ['se', maxX, maxY],
  ];
  for (const [handle, hx, hy] of corners) {
    if (Math.hypot(x - hx, y - hy) <= HANDLE_HIT_RADIUS) return handle;
  }

  const rotateY = minY - ROTATE_HANDLE_OFFSET;
  if (Math.hypot(x - centerX, y - rotateY) <= HANDLE_HIT_RADIUS) return 'rotate';

  return null;
}

/**
 * Uniform scale of the selected strokes' points (and their pen width, so a
 * shrunk sketch doesn't keep a proportionally-too-thick line) about a fixed
 * pivot — the corner OPPOSITE the handle being dragged, so the far corner
 * stays put exactly like every other app's corner-resize convention.
 * `scale` is clamped by the caller (useDrawing), not here — this function
 * has no opinion on min/max size, only on the transform math.
 */
export function applyScaleOffset(
  strokes: Stroke[],
  ids: ReadonlySet<string>,
  pivotX: number,
  pivotY: number,
  scale: number,
): Stroke[] {
  return strokes.map((s) => {
    if (!ids.has(s.id)) return s;
    return {
      ...s,
      size: s.size * scale,
      points: s.points.map((p: InkPoint) => ({
        ...p,
        x: pivotX + (p.x - pivotX) * scale,
        y: pivotY + (p.y - pivotY) * scale,
        width: p.width !== undefined ? p.width * scale : undefined,
      })),
    };
  });
}

/**
 * Rotate the selected strokes' points by `angleRad` (radians, standard
 * math convention — positive = counter-clockwise in math space, which on a
 * y-down canvas reads as clockwise on screen, matching how users expect
 * dragging the rotate handle rightward to feel) about a fixed pivot — the
 * selection's own center, so rotation always feels like spinning the
 * group in place rather than orbiting some other point.
 */
export function applyRotateOffset(
  strokes: Stroke[],
  ids: ReadonlySet<string>,
  pivotX: number,
  pivotY: number,
  angleRad: number,
): Stroke[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return strokes.map((s) => {
    if (!ids.has(s.id)) return s;
    return {
      ...s,
      points: s.points.map((p: InkPoint) => {
        const dx = p.x - pivotX;
        const dy = p.y - pivotY;
        return {
          ...p,
          x: pivotX + dx * cos - dy * sin,
          y: pivotY + dx * sin + dy * cos,
        };
      }),
    };
  });
}

/**
 * Snap a shape's live end-point (x2,y2) while drag-drawing, when Shift is
 * held — different snap behavior per shape type, per the drawing tool spec:
 *
 * - **line/arrow**: snap the ANGLE from the start point to the nearest 45°
 *   increment (0/45/90/135/...), preserving the drawn length. Standard
 *   "constrain to common angles" behavior for a directional shape.
 * - **rect/ellipse**: snap to a SQUARE/CIRCLE — force the drag's larger axis
 *   delta onto both axes (same sign as the actual drag on each), since a
 *   rect/ellipse has no "angle" to speak of, only a width/height ratio.
 *
 * Returns the unmodified `(x2, y2)` when `shiftHeld` is false — snapping is
 * opt-in, matching the "Shift constrains" convention already established
 * project-wide (Shift-drag conventions in most drawing tools).
 */
export function snapShapeEndpoint(
  type: ShapeType,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  shiftHeld: boolean,
): { x: number; y: number } {
  if (!shiftHeld) return { x: x2, y: y2 };

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (type === 'line' || type === 'arrow') {
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x: x2, y: y2 };
    const angle = Math.atan2(dy, dx);
    const step = Math.PI / 4; // 45°
    const snappedAngle = Math.round(angle / step) * step;
    return {
      x: x1 + dist * Math.cos(snappedAngle),
      y: y1 + dist * Math.sin(snappedAngle),
    };
  }

  // rect / ellipse: force a square/circle using the larger axis magnitude,
  // preserving each axis's own drag direction (sign).
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: x1 + Math.sign(dx || 1) * side,
    y: y1 + Math.sign(dy || 1) * side,
  };
}