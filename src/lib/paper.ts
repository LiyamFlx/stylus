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

/** Horizontal ruled lines, shared by ruled / grid / cornell / isometric. */
function horizontalLines(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  for (let y = PAPER_SPACING; y < height; y += PAPER_SPACING) {
    // +0.5 keeps a 1px line crisp on integer pixel boundaries.
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
}

function drawRuled(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  horizontalLines(ctx, width, height);
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  horizontalLines(ctx, width, height);
  for (let x = PAPER_SPACING; x < width; x += PAPER_SPACING) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  ctx.stroke();
}

function drawDots(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = DOT_COLOR;
  for (let x = PAPER_SPACING; x < width; x += PAPER_SPACING) {
    for (let y = PAPER_SPACING; y < height; y += PAPER_SPACING) {
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCornell(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  horizontalLines(ctx, width, height);
  // Vertical cue-column margin ~2.5 spacings from the left.
  const marginX = Math.round(PAPER_SPACING * 2.5) + 0.5;
  ctx.moveTo(marginX, 0);
  ctx.lineTo(marginX, height);
  // Horizontal summary line ~3 spacings from the bottom.
  const summaryY = Math.round(height - PAPER_SPACING * 3) + 0.5;
  if (summaryY > 0) {
    ctx.moveTo(0, summaryY);
    ctx.lineTo(width, summaryY);
  }
  ctx.stroke();
}

function drawIsometric(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  horizontalLines(ctx, width, height);
  // Two diagonal families at ±30° spaced by the horizontal step.
  const run = height / Math.tan(Math.PI / 6);
  for (let x0 = -run; x0 < width; x0 += PAPER_SPACING) {
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + run, height);
    ctx.moveTo(x0, height);
    ctx.lineTo(x0 + run, 0);
  }
  ctx.stroke();
}

/**
 * Paint the chosen paper guide. `blank` draws nothing. The switch is
 * exhaustive: adding a `PaperStyle` without a case here is a compile error.
 */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  style: PaperStyle,
  width: number,
  height: number,
): void {
  if (style === 'blank') return;
  ctx.save();
  switch (style) {
    case 'ruled':
      drawRuled(ctx, width, height);
      break;
    case 'grid':
      drawGrid(ctx, width, height);
      break;
    case 'dots':
      drawDots(ctx, width, height);
      break;
    case 'cornell':
      drawCornell(ctx, width, height);
      break;
    case 'isometric':
      drawIsometric(ctx, width, height);
      break;
    default: {
      // Exhaustiveness guard — `style` is `never` here if all cases are handled.
      const _exhaustive: never = style;
      void _exhaustive;
    }
  }
  ctx.restore();
}
