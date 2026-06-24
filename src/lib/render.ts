import type { InkPoint, Stroke } from '../types';
import { isTextStroke } from '../types';
import type { TextStroke } from '../types/extensions';
import { FONT_FAMILY_CSS } from '../types/extensions';

/**
 * Canvas rendering helpers.
 *
 * Strokes are drawn as a smooth path using quadratic curves through the
 * midpoints of consecutive sample points (Catmull-Rom-ish smoothing without
 * overshoot). Pressure modulates line width per-segment when available.
 */

/** Draw a single stroke onto a 2D context (already DPR-scaled). */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (isTextStroke(stroke)) {
    drawTextStroke(ctx, stroke);
    return;
  }
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

/**
 * Render a TextStroke. Coords are CSS px; the context is already DPR-scaled by
 * the caller, so we draw in CSS units (no extra dpr math here).
 */
function drawTextStroke(ctx: CanvasRenderingContext2D, stroke: TextStroke): void {
  const { x, y, content, styles } = stroke;
  ctx.save();
  ctx.font = `${styles.bold ? 700 : 400} ${styles.fontSize}px ${FONT_FAMILY_CSS[styles.fontFamily]}`;
  ctx.fillStyle = styles.color;
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 1;
  const lineHeight = styles.fontSize * 1.4;
  content.split('\n').forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
  ctx.restore();
}

/** Repaint the whole drawing. Clears first, then strokes in order. */
export function renderAll(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
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
