/**
 * Shared domain types for the ink canvas.
 *
 * A drawing is an ordered list of {@link Stroke}s. Each stroke is a list of
 * {@link InkPoint}s captured from Pointer Events. We keep raw points (with
 * pressure + timestamp) so we can both render smoothly and feed them to the
 * browser's handwriting recognizer without re-deriving timing.
 */

export type Tool = 'pen' | 'eraser' | 'text';

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
}

/** One continuous pointer-down → pointer-up gesture. */
export interface Stroke {
  /** Stable id, used for hit-testing / erasing. */
  id: string;
  /** Hex color, e.g. "#ffffff". */
  color: string;
  /** Base line width in CSS px before pressure scaling. */
  size: number;
  points: InkPoint[];
}

/** Pen sizes exposed in the toolbar (CSS px). */
export const PEN_SIZES = [2, 4, 8] as const;
export type PenSize = (typeof PEN_SIZES)[number];

/** Paper guide drawn beneath the ink (and baked into exports). */
export type PaperStyle = 'blank' | 'grid' | 'ruled' | 'dots';
/** Cycle order for the toolbar paper button. */
export const PAPER_STYLES = ['blank', 'grid', 'ruled', 'dots'] as const;

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
