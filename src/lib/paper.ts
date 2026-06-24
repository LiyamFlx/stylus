import type { PaperStyle } from '../types';

/**
 * Paper guides drawn beneath the ink. Lines are subtle, low-contrast strokes so
 * they read as a writing aid without competing with the ink — and they look
 * right on the dark canvas as well as on the dark export background.
 *
 * Coordinates are in CSS pixels (the context is already DPR-scaled by the
 * caller), so spacing is consistent across devices.
 */

/** Spacing between grid lines / ruled lines / dots, in CSS px. */
export const PAPER_SPACING = 32;

const LINE_COLOR = 'rgba(255, 255, 255, 0.06)';
const DOT_COLOR = 'rgba(255, 255, 255, 0.12)';
const DOT_RADIUS = 1.1;

/** Paint the chosen paper guide. `blank` draws nothing. */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  style: PaperStyle,
  width: number,
  height: number,
): void {
  if (style === 'blank') return;

  ctx.save();
  if (style === 'dots') {
    ctx.fillStyle = DOT_COLOR;
    for (let x = PAPER_SPACING; x < width; x += PAPER_SPACING) {
      for (let y = PAPER_SPACING; y < height; y += PAPER_SPACING) {
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Ruled = horizontal lines only; grid = horizontal + vertical.
    for (let y = PAPER_SPACING; y < height; y += PAPER_SPACING) {
      // +0.5 keeps a 1px line crisp on integer pixel boundaries.
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    if (style === 'grid') {
      for (let x = PAPER_SPACING; x < width; x += PAPER_SPACING) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
