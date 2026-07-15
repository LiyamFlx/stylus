import type { InkPoint, PaperStyle, RulingDensity, Shape, Stroke } from '../types';
import type { Bounds } from './geometry';
import { boundsIntersect, shapeBounds, strokeBounds, ROTATE_HANDLE_OFFSET } from './geometry';
import { drawPaper } from './paper';
import { penProfile } from './penProfiles';
import { ensureTemplateBitmap, getTemplateBitmap } from './templates';

/**
 * Per-stroke bounds cache for viewport culling (Phase 0). Keyed on stroke
 * identity: committed strokes are immutable references, so an entry stays
 * valid for the stroke's lifetime; geometry-changing ops (move) produce NEW
 * stroke objects, which miss the cache and recompute. WeakMap so dropped
 * strokes (undo, erase, clear) free their entries automatically.
 *
 * The cache is what keeps the cull O(strokes) instead of O(points) — without
 * it, per-frame bounds recomputation would re-create the exact cost culling
 * exists to remove.
 */
const strokeBoundsCache = new WeakMap<Stroke, Bounds>();

function cachedStrokeBounds(stroke: Stroke): Bounds | null {
  const hit = strokeBoundsCache.get(stroke);
  if (hit) return hit;
  const b = strokeBounds(stroke);
  if (b) strokeBoundsCache.set(stroke, b);
  return b;
}

/** Same caching strategy as strokeBoundsCache, for shapes — see its doc
 *  comment. Shapes are also immutable-per-commit (a move/resize/rotate
 *  produces a new Shape object), so the same WeakMap-by-identity approach
 *  holds without any extra invalidation logic. */
const shapeBoundsCache = new WeakMap<Shape, Bounds>();

function cachedShapeBounds(shape: Shape): Bounds {
  const hit = shapeBoundsCache.get(shape);
  if (hit) return hit;
  const b = shapeBounds(shape);
  shapeBoundsCache.set(shape, b);
  return b;
}

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

  // Translucent pens (highlighter) carry their opacity per-point via p.opacity,
  // so they read correctly over any background — including the opaque export
  // fill. We deliberately do NOT use a 'multiply' blend: against the dark export
  // background multiply collapses highlights to near-black.
  // Per-stroke blend from the pen profile (Phase 3 brushes). Reset below —
  // and see the Phase 4 note in penProfiles: layer compositing supersedes this.
  const blend = stroke.penType ? penProfile(stroke.penType).blend : undefined;
  ctx.globalCompositeOperation = blend ?? 'source-over';
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
    ctx.globalCompositeOperation = 'source-over';
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
  ctx.globalCompositeOperation = 'source-over';
}

/** Arrowhead half-length/width, in CSS px — fixed size regardless of shape
 *  scale, matching how e.g. Figma/PowerPoint arrowheads don't grow with a
 *  very long line (a huge arrowhead on a short arrow would look broken). */
const ARROWHEAD_LENGTH = 14;
const ARROWHEAD_WIDTH = 9;

/**
 * Draw a single shape (rect/ellipse/line/arrow) onto a 2D context. Shapes
 * are outlined only (no fill) — a filled shape would obscure ink drawn
 * before it, which breaks the "shapes are just another kind of mark on the
 * page" mental model the rest of the app already has for strokes.
 *
 * rect/ellipse rotate about their own bounding-box center via ctx.rotate()
 * (see the Shape.rotation doc comment in types.ts for why rotation is a
 * separate field rather than baked into x1/y1/x2/y2); line/arrow don't use
 * the rotation field at all — their endpoints already encode any angle.
 */
export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  const { type, color, size, x1, y1, x2, y2, rotation } = shape;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(size, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'rect' || type === 'ellipse') {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    if (rotation) {
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.translate(-cx, -cy);
    }
    if (type === 'rect') {
      ctx.strokeRect(minX, minY, w, h);
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // line / arrow: draw the shaft, arrow adds a filled triangular head at
    // the END point (x2,y2) — the point the user dragged TO, matching how
    // every draw-a-line gesture naturally means "arrow points where I let go."
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (type === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const backX = x2 - ARROWHEAD_LENGTH * Math.cos(angle);
      const backY = y2 - ARROWHEAD_LENGTH * Math.sin(angle);
      const perpX = Math.cos(angle + Math.PI / 2) * (ARROWHEAD_WIDTH / 2);
      const perpY = Math.sin(angle + Math.PI / 2) * (ARROWHEAD_WIDTH / 2);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(backX + perpX, backY + perpY);
      ctx.lineTo(backX - perpX, backY - perpY);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

export interface RenderOptions {
  /** Paper guide to draw beneath the ink. Defaults to `blank` (none). */
  paper?: PaperStyle;
  /** Opaque background fill. Omit for a transparent base (the on-screen canvas
   *  sits over a CSS background); set it for exports so the bitmap isn't
   *  transparent. */
  background?: string;
  /**
   * Viewport culling (Phase 0). Visible region in WORLD coordinates — strokes
   * whose cached bounds don't intersect it are skipped entirely. On-screen
   * callers pass the viewport inverse-transformed through the view (see
   * paintStatic in useDrawing); if rotation ever lands, pass the AABB of the
   * rotated viewport quad.
   *
   * ── EXPORT BYPASS — DO NOT "OPTIMIZE" ──────────────────────────────────
   * Omit (or pass null) to render EVERYTHING. Export/thumbnail paths MUST
   * NOT cull: culling is a render-time visible-region optimization; an
   * export needs the complete document regardless of what was on-screen.
   * Routing an export through a culled render silently truncates output.
   * ────────────────────────────────────────────────────────────────────────
   */
  cull?: Bounds | null;
  /** Line spacing for the 'notebook' paper. Ignored by other styles. */
  ruling?: RulingDensity;
  /**
   * Bounded page rect (world coords) — the notebook A4 sheet. When set, the
   * paper is drawn ONLY inside this rect (as a real page with edges) and the
   * area around it gets a neutral backdrop, instead of the paper bleeding to
   * every window edge. `viewRect` (the visible world region) sizes the
   * backdrop. Omit for the infinite canvas (paper fills the whole surface).
   */
  pageBounds?: Bounds | null;
  /** Visible world rect, needed to size the backdrop around a bounded page. */
  viewRect?: Bounds | null;
  /**
   * Page background template (lib/templates), resolved by the caller via
   * resolvePageTemplateId — pass the RESOLVED value, never a raw
   * PageMeta.templateId. When set and decoded, it REPLACES the paper guide
   * (templates carry their own ruling); until decoded, the paper draws as a
   * one-frame fallback and `onTemplateReady` schedules the repaint.
   */
  templateId?: string | null;
  /** Repaint scheduler invoked when an async template decode lands. */
  onTemplateReady?: () => void;
  /**
   * Shapes (rect/ellipse/line/arrow), drawn after every stroke — a simple,
   * predictable z-order (shapes always on top) rather than interleaving by
   * creation time, since strokes and shapes are separate arrays with no
   * shared ordering field to interleave by. Same culling treatment as
   * strokes: skipped when their cached bounds miss the visible `cull` rect.
   */
  shapes?: Shape[];
}

/** Backdrop behind a bounded page, and the page's own edge. */
const PAGE_BACKDROP = '#111114';
const PAGE_EDGE = 'rgba(0, 0, 0, 0.55)';

/**
 * Cache the rendered paper guide as an offscreen bitmap so we don't re-stroke
 * its (possibly hundreds of) line segments on every static repaint — the
 * isometric guide alone is ~670 segments. Keyed by style+size; a size or style
 * change rebuilds it. `blank` is never cached (it draws nothing).
 */
let paperCache: {
  key: string;
  canvas: HTMLCanvasElement;
} | null = null;

function getPaperBitmap(
  style: PaperStyle,
  width: number,
  height: number,
  ruling: RulingDensity,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null; // no DOM (non-browser)
  // Ruling is part of the key: a density change must rebuild the bitmap.
  const key = `${style}|${width}|${height}|${ruling}`;
  if (paperCache && paperCache.key === key) return paperCache.canvas;
  try {
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(width));
    off.height = Math.max(1, Math.round(height));
    const offCtx = off.getContext('2d');
    // Guard for stub canvas implementations (e.g. jsdom) where the 2D context
    // lacks path methods — fall back to drawing the guide directly.
    if (!offCtx || typeof offCtx.lineTo !== 'function') return null;
    drawPaper(offCtx, style, width, height, ruling);
    paperCache = { key, canvas: off };
    return off;
  } catch {
    return null;
  }
}

/**
 * Draw the template bitmap covering (0,0,w,h) of the CURRENT transform space.
 * Returns false when the bitmap isn't decoded yet (caller draws the paper
 * fallback for this frame; the decode's onReady schedules the repaint).
 * Raster source drawn once through the transform — deliberately NOT routed
 * through paperCache, whose per-size re-rasterization exists for vector
 * ruling only (see lib/templates module doc, property 2).
 */
function drawTemplate(
  ctx: CanvasRenderingContext2D,
  templateId: string,
  w: number,
  h: number,
  onReady?: () => void,
): boolean {
  const bmp = getTemplateBitmap(templateId);
  if (!bmp) {
    void ensureTemplateBitmap(templateId, onReady);
    return false;
  }
  // Guard for stub contexts (jsdom) the same way getPaperBitmap does.
  if (typeof ctx.drawImage !== 'function') return false;
  try {
    const prev = ctx.imageSmoothingQuality;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    ctx.imageSmoothingQuality = prev;
    return true;
  } catch {
    return false;
  }
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
  {
    paper = 'blank',
    background,
    cull = null,
    ruling = 'college',
    pageBounds = null,
    viewRect = null,
    templateId = null,
    onTemplateReady,
    shapes = [],
  }: RenderOptions = {},
): void {
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  if (pageBounds) {
    // Bounded page (notebook A4): neutral backdrop around the sheet, then the
    // paper drawn only inside the page rect, with an edge line so it reads as a
    // real vertical A4 sheet floating on the canvas.
    const pw = pageBounds.maxX - pageBounds.minX;
    const ph = pageBounds.maxY - pageBounds.minY;
    if (viewRect) {
      ctx.fillStyle = PAGE_BACKDROP;
      ctx.fillRect(
        viewRect.minX,
        viewRect.minY,
        viewRect.maxX - viewRect.minX,
        viewRect.maxY - viewRect.minY,
      );
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(pageBounds.minX, pageBounds.minY, pw, ph);
    ctx.clip();
    ctx.translate(pageBounds.minX, pageBounds.minY);
    // Template replaces the paper guide when decoded (it carries its own
    // ruling); until then the paper draws as the one-frame fallback.
    const templated = templateId
      ? drawTemplate(ctx, templateId, pw, ph, onTemplateReady)
      : false;
    if (!templated) {
      if (paper !== 'blank') {
        const bitmap = getPaperBitmap(paper, pw, ph, ruling);
        if (bitmap) ctx.drawImage(bitmap, 0, 0, pw, ph);
        else drawPaper(ctx, paper, pw, ph, ruling);
      } else {
        // A blank notebook page is still a white-ish sheet, not the dark canvas.
        ctx.fillStyle = '#FDF6E3';
        ctx.fillRect(0, 0, pw, ph);
      }
    }
    ctx.restore();
    ctx.strokeStyle = PAGE_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(pageBounds.minX + 0.5, pageBounds.minY + 0.5, pw - 1, ph - 1);
  } else if (templateId && drawTemplate(ctx, templateId, width, height, onTemplateReady)) {
    // Flat path with a template (thumbnails / A4 page export render the page
    // at 0,0 with a transform pre-applied): template covers the full extent.
  } else if (paper !== 'blank') {
    const bitmap = getPaperBitmap(paper, width, height, ruling);
    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, width, height);
    } else {
      drawPaper(ctx, paper, width, height, ruling);
    }
  }

  for (const stroke of strokes) {
    if (cull) {
      const b = cachedStrokeBounds(stroke);
      // Zero-point strokes have no bounds and nothing to draw either way.
      if (!b || !boundsIntersect(b, cull)) continue;
    }
    drawStroke(ctx, stroke);
  }

  for (const shape of shapes) {
    if (cull) {
      const b = cachedShapeBounds(shape);
      if (!boundsIntersect(b, cull)) continue;
    }
    drawShape(ctx, shape);
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
 * Draw the dashed selection bounding box, its 4 corner resize handles, and
 * a rotate handle on a stem above top-center. `pad` controls how much the
 * rect extends beyond the ink bounds — must match the pad used in
 * `hitsSelectionBounds`/`hitsSelectionHandle` so the visual and hit zones
 * agree. Handle offset/positions mirror ROTATE_HANDLE_OFFSET in geometry.ts
 * exactly — if that constant changes, this paints in the wrong place.
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
  const centerX = x + w / 2;
  const rotateY = y - ROTATE_HANDLE_OFFSET;

  ctx.save();

  // Dashed selection rect.
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.globalAlpha = 0.9;
  ctx.strokeRect(x, y, w, h);

  // Stem connecting the box to the rotate handle.
  ctx.beginPath();
  ctx.moveTo(centerX, y);
  ctx.lineTo(centerX, rotateY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 1;

  // Corner resize handles — small filled squares, distinct from the round
  // rotate handle below so the two affordances never look interchangeable.
  const r = 4;
  ctx.fillStyle = '#ffffff';
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) {
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Rotate handle — a circle, on the stem.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, rotateY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

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
