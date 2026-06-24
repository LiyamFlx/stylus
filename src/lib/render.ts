import type { InkPoint, PaperStyle, Stroke } from '../types';
import type { Bounds } from './geometry';
import { drawPaper } from './paper';

/**
 * Canvas rendering helpers.
 *
 * Strokes are drawn as a smooth path using quadratic curves through the
 * midpoints of consecutive sample points (Catmull-Rom-ish smoothing without
 * overshoot). Pressure modulates line width per-segment when available.
 */

/** Draw a single stroke onto a 2D context (already DPR-scaled). */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { points, color, size } = stroke;
  if (points.length === 0) return;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A single tap → render a dot so dotting an "i" works.
  if (points.length === 1) {
    const p = points[0];
    ctx.globalAlpha = p.opacity ?? 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pointWidth(p, size) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  // Draw segment-by-segment so width can follow pressure. Each segment runs
  // from the midpoint of (i-1, i) to the midpoint of (i, i+1), curving through
  // point i — this is the classic quadratic-midpoint smoothing.
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const mid = midpoint(prev, curr);
    const prevMid = i > 1 ? midpoint(points[i - 2], prev) : prev;

    ctx.beginPath();
    ctx.lineWidth = pointWidth(curr, size);
    ctx.globalAlpha = curr.opacity ?? 1;
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export interface RenderOptions {
  /** Paper guide to draw beneath the ink. Defaults to `blank` (none). */
  paper?: PaperStyle;
  /** Opaque background fill. Omit for a transparent base (the on-screen canvas
   *  sits over a CSS background); set it for exports so the bitmap isn't
   *  transparent. */
  background?: string;
}

/**
 * Repaint the whole drawing: clear, optional opaque fill, paper guide, then
 * strokes in order. The fill is applied *after* the clear so callers that want
 * an opaque export background actually get one.
 */
export function renderAll(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  { paper = 'blank', background }: RenderOptions = {},
): void {
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  drawPaper(ctx, paper, width, height);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
}

/**
 * Draw the in-progress lasso path as a dashed blue line. Call after
 * `renderAll` so it sits on top of the ink.
 */
export function drawLasso(
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<{ x: number; y: number }>,
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.globalAlpha = 0.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the dashed selection bounding box and corner handles around `bounds`.
 * `pad` controls how much the rect extends beyond the ink bounds — must match
 * the pad used in `hitsSelectionBounds` so the visual and hit zone agree.
 */
export function drawSelectionRect(
  ctx: CanvasRenderingContext2D,
  bounds: Bounds,
  pad = 8,
): void {
  const x = bounds.minX - pad;
  const y = bounds.minY - pad;
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;

  ctx.save();

  // Dashed selection rect.
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.globalAlpha = 0.9;
  ctx.strokeRect(x, y, w, h);

  // Corner handles.
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 1;
  const r = 4;
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Effective width for a point. If the capture pipeline computed an explicit
 * width (pressure/tilt-aware), use it; otherwise fall back to base size scaled
 * by pressure — keeps old saved strokes and mouse input looking right.
 */
function pointWidth(p: InkPoint, baseSize: number): number {
  return p.width ?? baseSize * pressureScale(p.pressure);
}

/** Map normalized pressure (0..1) to a width multiplier (0.4x..1.6x). */
function pressureScale(pressure: number): number {
  return 0.4 + pressure * 1.2;
}

function midpoint(a: InkPoint, b: InkPoint): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
