/**
 * Shared domain types for the ink canvas.
 *
 * A drawing is an ordered list of {@link Stroke}s. Each stroke is a list of
 * {@link InkPoint}s captured from Pointer Events. We keep raw points (with
 * pressure + timestamp) so we can both render smoothly and feed them to the
 * browser's handwriting recognizer without re-deriving timing.
 */

import type { PenType } from './lib/penProfiles';

export type Tool = 'pen' | 'eraser' | 'text' | 'select' | 'shape';

/** A single sampled point along a stroke. */
export interface InkPoint {
  /** CSS pixel x, relative to the canvas top-left. */
  x: number;
  /** CSS pixel y, relative to the canvas top-left. */
  y: number;
  /** Normalized pressure 0..1. Defaults to 0.5 when the device reports none. */
  pressure: number;
  /** Effective line width in CSS px (pressure-derived). Optional for back-compat. */
  width?: number;
  /** Per-point opacity 0..1 (tilt-derived for pens). Optional for back-compat. */
  opacity?: number;
  /** ms timestamp relative to stroke start (t[0] === 0). */
  t: number;
}

/** Font choices offered for a text box. System stacks (no web-font loading —
 *  keeps text boxes offline-safe and export-stable). */
export const TEXT_FONTS = ['sans', 'serif', 'mono', 'hand'] as const;
export type TextFont = (typeof TEXT_FONTS)[number];

export const TEXT_FONT_STACKS: Record<TextFont, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", monospace',
  hand: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
};

export type TextAlign = 'left' | 'center' | 'right';

/** A typed text box placed on the canvas (via the on-screen keyboard). */
export interface TextItem {
  /** Stable id. */
  id: string;
  /** Top-left CSS px, relative to the canvas. */
  x: number;
  y: number;
  /** The typed content (may be multi-line). */
  text: string;
  /** Hex color, matches the pen palette. */
  color: string;
  /** Font size in CSS px. */
  size: number;
  /** Font family. Defaults to 'sans' for boxes created before this field
   *  existed — see {@link TEXT_FONT_STACKS}. */
  font?: TextFont;
  bold?: boolean;
  italic?: boolean;
  /** Paragraph alignment. Defaults to 'left'. */
  align?: TextAlign;
  /**
   * Manually-set wrap width in CSS px (the resize handle). `undefined` means
   * auto-width (grows with content, capped at the page edge) — the original
   * behavior. Once a user drags the handle, width becomes fixed at that value
   * and text rewraps within it instead of continuing to auto-size.
   */
  width?: number;
}

/**
 * A reference image beneath the ink (Phase 3 item 5). METADATA ONLY — the
 * bitmap lives in IndexedDB under `imageId` (see lib/imageStore). Underlays
 * are non-exporting and non-selectable by design: reference material, not
 * artwork. Kept as a distinctly-typed item in an ordered array so Phase 4
 * can fold it into Layer[] as a data-shape merge, not a rewrite.
 */
export interface ImageItem {
  id: string;
  /** IndexedDB key of the bitmap. */
  imageId: string;
  /** Top-left, world coords. */
  x: number;
  y: number;
  /** Display size, world units. */
  w: number;
  h: number;
}

/** One continuous pointer-down → pointer-up gesture. */
export interface Stroke {
  /** Stable id, used for hit-testing / erasing. */
  id: string;
  /**
   * Absolute wall-clock ms (`Date.now()`) when the stroke began. Optional for
   * back-compat — strokes saved before Phase 0 don't have it. Together with
   * the per-point relative `t`, this makes stroke replay (Phase 3) possible:
   * `t` alone can't order strokes or reconstruct inter-stroke gaps. Replay
   * treats missing `startedAt` as "sequence by array order".
   */
  startedAt?: number;
  /** Hex color, e.g. "#ffffff". */
  color: string;
  /** Base line width in CSS px before pressure scaling. */
  size: number;
  /** Pen used to draw it. Optional for back-compat; renders as fountain. */
  penType?: PenType;
  points: InkPoint[];
}

export const SHAPE_TYPES = ['rect', 'ellipse', 'line', 'arrow'] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

/**
 * A drawn geometric primitive — distinct from {@link Stroke} (freehand ink
 * points) rather than a tagged union sharing the strokes array. Every
 * existing `Stroke[]`-typed call site (culling, hit-testing, rendering,
 * undo diffing — 39+ in useDrawing.ts alone) stays untouched; shapes are
 * additive everywhere rather than requiring a discriminant check threaded
 * through all of them.
 *
 * Represented as two corners (x1,y1)–(x2,y2) for every shape type, not a
 * per-type geometry union: rect/ellipse read them as opposite bounding-box
 * corners, line/arrow read them as the two endpoints. One drag gesture
 * (down → move → up) naturally produces exactly this shape regardless of
 * which tool sub-type is active, so the capture code doesn't need to branch
 * on type to know what it's recording.
 */
export interface Shape {
  /** Stable id, used for hit-testing / selection — must not collide with
   *  Stroke ids (both use createId(), so the id spaces are already disjoint
   *  in practice, but a mixed selection set relies on this holding). */
  id: string;
  type: ShapeType;
  /** Hex color, matches the pen palette. */
  color: string;
  /** Stroke line width in CSS px — shapes are outlined, not filled. */
  size: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * Rotation in radians about the shape's own bounding-box center, applied
   * at render/hit-test time — NOT baked into x1/y1/x2/y2. Rect/ellipse need
   * this because rotating their two CORNER points directly would stop them
   * describing an axis-aligned box (the shape would silently render wrong
   * — an unrotated box drawn from rotated corners is not the same
   * rectangle). Line/arrow don't strictly need it (rotating their two
   * endpoints IS correct, since a line has no "axis-aligned" constraint to
   * violate), but they use the same field for consistency — one rotation
   * mechanism for every shape type, not two. Undefined = 0 (back-compat /
   * default for a freshly-drawn, never-rotated shape).
   */
  rotation?: number;
}

/** Pen sizes exposed in the toolbar (CSS px). */
export const PEN_SIZES = [2, 4, 8] as const;
export type PenSize = (typeof PEN_SIZES)[number];

/** Paper guide drawn beneath the ink (and baked into exports). */
export type PaperStyle =
  | 'blank'
  | 'grid'
  | 'ruled'
  | 'dots'
  | 'cornell'
  | 'isometric'
  | 'notebook';

/** Line spacing for the 'notebook' paper (Phase 1). One PaperStyle, densities
 *  as an option — NOT a PaperStyle per density. */
export type RulingDensity = 'narrow' | 'college' | 'wide';
/** Cycle order for the toolbar paper button. */
export const PAPER_STYLES = [
  'blank',
  'grid',
  'ruled',
  'dots',
  'cornell',
  'isometric',
  'notebook',
] as const;

/** Eight preset ink colors. White first since it's the dark-mode default. */
export const PRESET_COLORS = [
  '#fafafa', // white
  '#ef4444', // red
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ec4899', // pink
  '#000000', // black
] as const;
