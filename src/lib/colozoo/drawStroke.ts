/**
 * Colozoo's OWN stroke renderer — deliberately separate from lib/render.ts.
 *
 * Feature isolation: the core render pipeline must not gain kids'-mode brush
 * texture. So Colozoo draws its freehand ink here instead, sharing only the
 * DATA format (Stroke/InkPoint) and the width/opacity/blend feel from
 * penProfiles. The math mirrors render.ts's quadratic-midpoint smoothing so a
 * Colozoo stroke reads the same as any other stroke; the per-brush texture
 * passes (below) are the only divergence.
 *
 * Textures are DETERMINISTIC — every wiggle/speckle is a pure function of the
 * point's coordinates and index (see {@link hash01}), never Math.random. That
 * matters because the workspace repaints the whole ink layer on every frame of
 * a gesture: random texture would shimmer and crawl; hashed texture stays put.
 *
 * The context is expected to already be transformed into viewBox space (the
 * caller applies the stage scale + DPR), so all coordinates and widths here
 * are in viewBox units.
 */

import type { InkPoint, Stroke } from '../../types';
import type { ColozooBrush } from '../penProfiles';
import { penProfile } from '../penProfiles';
import { hexToHsb, hsbToHex } from '../color';

/** Deterministic pseudo-random in [0,1) from an arbitrary number. */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function pointWidth(p: InkPoint, base: number): number {
  return p.width ?? base;
}

function midpoint(a: InkPoint, b: InkPoint): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Unit perpendicular to the local stroke direction at point i. */
function perpAt(points: InkPoint[], i: number): { x: number; y: number } {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/**
 * Paintbrush bristle wobble: nudge each point along its perpendicular by an
 * amount that grows with drawing SPEED (fast strokes fray more), bounded so it
 * never wanders far. Returns a new array — inputs are never mutated.
 */
function jitterByVelocity(points: InkPoint[]): InkPoint[] {
  const MAX = 1.6; // viewBox units (~±3px on a typical stage)
  return points.map((p, i) => {
    if (i === 0) return p;
    const prev = points[i - 1];
    const velocity = Math.hypot(p.x - prev.x, p.y - prev.y);
    const amount = Math.min(velocity * 0.5, MAX) * (hash01(i * 3.1 + p.x) - 0.5) * 2;
    const perp = perpAt(points, i);
    return { ...p, x: p.x + perp.x * amount, y: p.y + perp.y * amount };
  });
}

/** Magic-marker hue drift: a colour that rotates along the stroke's length. */
function makeHueRotator(baseColor: string): (lengthSoFar: number) => string {
  const hsb = hexToHsb(baseColor);
  if (!hsb) return () => baseColor;
  const DEG_PER_UNIT = 3; // viewBox units → hue degrees
  return (lengthSoFar) => hsbToHex({ ...hsb, h: hsb.h + lengthSoFar * DEG_PER_UNIT });
}

/** Pencil/chalk grain: scatter faint speckles along the stroke. */
function stipple(
  ctx: CanvasRenderingContext2D,
  points: InkPoint[],
  base: number,
  color: string,
  dense: boolean,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  const perStep = dense ? 5 : 3; // chalk is grainier than pencil
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const w = pointWidth(p, base);
    const perp = perpAt(points, i);
    for (let k = 0; k < perStep; k++) {
      const seed = i * 7.7 + k * 13.3;
      const off = (hash01(seed) - 0.5) * w; // across the stroke width
      const r = (0.12 + hash01(seed + 1) * 0.18) * w; // speckle radius
      ctx.globalAlpha = 0.12 + hash01(seed + 2) * 0.18;
      ctx.beginPath();
      ctx.arc(p.x + perp.x * off, p.y + perp.y * off, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Ceramic gloss: a thin bright streak riding just off the stroke's centre. */
function shimmer(
  ctx: CanvasRenderingContext2D,
  points: InkPoint[],
  base: number,
  color: string,
): void {
  const hsb = hexToHsb(color);
  const highlight = hsb ? hsbToHex({ ...hsb, s: hsb.s * 0.4, b: Math.min(1, hsb.b * 1.6 + 0.3) }) : '#ffffff';
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = highlight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const w = pointWidth(p, base);
    const perp = perpAt(points, i);
    const x = p.x + perp.x * w * 0.22;
    const y = p.y + perp.y * w * 0.22;
    ctx.lineWidth = w * 0.28;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Draw a single Colozoo stroke onto a (pre-transformed) 2D context. */
export function drawColozooStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { color, size } = stroke;
  const brush = stroke.penType as ColozooBrush | undefined;
  const profile = stroke.penType ? penProfile(stroke.penType) : undefined;

  // Paintbrush frays with speed; other brushes trace the captured path exactly.
  const points = brush === 'czPaintbrush' ? jitterByVelocity(stroke.points) : stroke.points;
  if (points.length === 0) return;

  const blend = profile?.blend;
  ctx.globalCompositeOperation = blend ?? 'source-over';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A single tap → a dot, so tapping always leaves a mark (no texture needed).
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

  const hueAt = brush === 'czMagicMarker' ? makeHueRotator(color) : null;
  let lengthSoFar = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const mid = midpoint(prev, curr);
    const prevMid = i > 1 ? midpoint(points[i - 2], prev) : prev;

    if (hueAt) {
      lengthSoFar += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      ctx.strokeStyle = hueAt(lengthSoFar);
    }

    ctx.beginPath();
    ctx.lineWidth = pointWidth(curr, size);
    ctx.globalAlpha = curr.opacity ?? 1;
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Texture overlays, drawn on top of the smoothed base.
  if (brush === 'czPencil') stipple(ctx, points, size, color, false);
  else if (brush === 'czChalk') stipple(ctx, points, size, color, true);
  else if (brush === 'czCeramic') shimmer(ctx, points, size, color);
}
