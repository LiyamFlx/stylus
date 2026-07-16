/**
 * Colozoo's OWN stroke renderer — deliberately separate from lib/render.ts.
 *
 * Feature isolation: the core render pipeline must not gain kids'-mode brush
 * texture. So Colozoo draws its freehand ink here instead, sharing only the
 * DATA format (Stroke/InkPoint) and the width/opacity/blend feel from
 * penProfiles. The math mirrors render.ts's quadratic-midpoint smoothing so a
 * Colozoo stroke reads the same as any other stroke; the texture passes
 * (added on top) are the only divergence.
 *
 * The context is expected to already be transformed into viewBox space (the
 * caller applies the stage scale + DPR), so all coordinates and widths here
 * are in viewBox units.
 */

import type { InkPoint, Stroke } from '../../types';
import { penProfile } from '../penProfiles';

function pointWidth(p: InkPoint, base: number): number {
  return p.width ?? base;
}

function midpoint(a: InkPoint, b: InkPoint): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Draw a single Colozoo stroke onto a (pre-transformed) 2D context. */
export function drawColozooStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { points, color, size } = stroke;
  if (points.length === 0) return;

  const blend = stroke.penType ? penProfile(stroke.penType).blend : undefined;
  ctx.globalCompositeOperation = blend ?? 'source-over';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A single tap → a dot, so tapping always leaves a mark.
  if (points.length === 1) {
    const p = points[0];
    ctx.globalAlpha = p.opacity ?? 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pointWidth(p, size) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return;
  }

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
  ctx.globalCompositeOperation = 'source-over';
}
