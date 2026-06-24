import type { InkPoint, PaperStyle, Stroke } from '../types';
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
    ctx.beginPath();
    ctx.arc(p.x, p.y, (size * pressureScale(p.pressure)) / 2, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.lineWidth = size * pressureScale(curr.pressure);
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
    ctx.stroke();
  }
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

/** Map normalized pressure (0..1) to a width multiplier (0.4x..1.6x). */
function pressureScale(pressure: number): number {
  return 0.4 + pressure * 1.2;
}

function midpoint(a: InkPoint, b: InkPoint): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
