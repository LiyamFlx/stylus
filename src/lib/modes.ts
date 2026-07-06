import type { PaperStyle, Tool } from '../types';

/**
 * Multi-mode foundation (Phase 0).
 *
 * A document *is* a mode — `mode` is chosen at creation and stored on
 * `DocMeta`, never toggled globally. Every mode consumes the same drawing
 * engine, storage layer, and render pipeline; `ModeConfig` only reconfigures
 * layout, defaults, and toolbar composition around them.
 *
 * Legacy documents (created before modes existed) have no `mode` field and
 * MUST resolve to `'canvas'` — today's infinite single-array behavior — at
 * every read site via {@link resolveMode}. Never read `doc.mode` raw.
 */

export type AppMode = 'mobile' | 'notebook' | 'canvas';

/** Toolbar composition presets. `'minimal'` is designed around "non-classroom,
 *  non-desktop peripheral features" so Mobile Mode (Phase 2) can reuse it;
 *  `'restricted'` is Notebook's exam lock (pen + undo only). */
export type ToolbarVariant = 'full' | 'minimal' | 'restricted';

export interface ModeConfig {
  id: AppMode;
  defaultPaper: PaperStyle;
  /** null = full PRESET_COLORS. */
  paletteOverride: readonly string[] | null;
  toolbarVariant: ToolbarVariant;
  layout: 'infinite' | 'paginated';
  /**
   * Baseline touch-action when NOT actively drawing. The effective value is
   * derived `(mode, tool, gestureActive) → touchAction` in one place —
   * never a static per-mode constant (Canvas Mode's multi-touch gestures
   * drive the same mechanism in Phase 3).
   */
  touchActionDefault: 'none' | 'manipulation';
  toolbarPosition: 'top' | 'bottom';
  /** Tool selected when a document of this mode opens. */
  defaultTool: Tool;
}

/** Classroom palette: blue + black pens, red correction, yellow highlighter. */
export const NOTEBOOK_COLORS = [
  '#2563eb', // pen blue
  '#000000', // pen black
  '#ef4444', // correction red
  '#facc15', // highlighter yellow
] as const;

export const MODE_CONFIGS: Record<AppMode, ModeConfig> = {
  canvas: {
    id: 'canvas',
    defaultPaper: 'blank',
    paletteOverride: null,
    toolbarVariant: 'full',
    layout: 'infinite',
    touchActionDefault: 'none',
    toolbarPosition: 'top',
    defaultTool: 'pen',
  },
  notebook: {
    id: 'notebook',
    // Becomes the 'notebook' PaperStyle (cream, A4 ruling) in Phase 1.
    defaultPaper: 'ruled',
    paletteOverride: NOTEBOOK_COLORS,
    toolbarVariant: 'full',
    layout: 'paginated',
    touchActionDefault: 'none',
    toolbarPosition: 'top',
    defaultTool: 'pen',
  },
  mobile: {
    id: 'mobile',
    defaultPaper: 'blank',
    paletteOverride: null,
    toolbarVariant: 'minimal',
    layout: 'infinite',
    touchActionDefault: 'manipulation',
    toolbarPosition: 'bottom',
    defaultTool: 'text', // typing-first
  },
};

/**
 * The single legacy-fallback gate. `DocMeta.mode` is `undefined` on documents
 * created before modes shipped; they behave as `'canvas'`. Call this at EVERY
 * read site (`readAux`, `listDocuments`, workspace mounting) — a missed
 * fallback is a null-mode crash.
 */
export function resolveMode(mode: unknown): AppMode {
  return mode === 'mobile' || mode === 'notebook' || mode === 'canvas'
    ? mode
    : 'canvas';
}

/** Config lookup that applies the legacy fallback. Prefer this over indexing
 *  MODE_CONFIGS with a raw (possibly undefined) mode value. */
export function modeConfig(mode: unknown): ModeConfig {
  return MODE_CONFIGS[resolveMode(mode)];
}
