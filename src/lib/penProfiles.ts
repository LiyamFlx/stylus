/**
 * Pen "feel" profiles. Each pen type maps pressure → stroke width and carries a
 * base opacity. Capture (`useDrawing.buildPoint`) uses `widthFor`/`opacity` to
 * bake the pen's feel into each point.
 *
 * Pure and side-effect-free so the mapping is unit-tested in isolation.
 */

/** The six classic pens shown in the standard toolbar. */
export type ClassicPenType =
  | 'fountain'
  | 'ballpoint'
  | 'brush'
  | 'highlighter'
  | 'pencil'
  | 'neon';

/**
 * Colozoo (kids' coloring mode) brushes. These are FULL {@link PenType}
 * members so a Colozoo stroke renders through the exact same pipeline as any
 * other stroke (`Stroke.penType` → `penProfile()` → width/opacity/blend) —
 * ColoZoo never forks the stroke data format. They are deliberately EXCLUDED
 * from {@link PEN_TYPES}, so the classic toolbar never lists them; ColoZoo
 * owns its own brush picker over {@link COLOZOO_BRUSHES}.
 */
export type ColozooBrush =
  | 'czDaub'
  | 'czMarker'
  | 'czPaintbrush'
  | 'czPencil'
  | 'czChalk'
  | 'czColorPencil'
  | 'czCrayon'
  | 'czMagicMarker'
  | 'czPorcelain'
  | 'czGlow'
  | 'czCeramic';

export type PenType = ClassicPenType | ColozooBrush;

/** Classic pen types in toolbar display order. Colozoo brushes are excluded
 *  on purpose — the classic toolbar must never show them. */
export const PEN_TYPES: ClassicPenType[] = [
  'fountain',
  'ballpoint',
  'brush',
  'pencil',
  'neon',
  'highlighter',
];

/**
 * Colozoo brushes in picker order. `czPorcelain` is intentionally the one
 * hairline brush (exempt from {@link COLOZOO_MIN_WIDTH}); every other Colozoo
 * brush is fat and forgiving so a small hand always leaves a bold, satisfying
 * mark. Kept as a plain list (not `PEN_TYPES`) so classic-mode toolbars can't
 * accidentally render them.
 */
export const COLOZOO_BRUSHES: ColozooBrush[] = [
  'czDaub',
  'czMarker',
  'czPaintbrush',
  'czPencil',
  'czChalk',
  'czColorPencil',
  'czCrayon',
  'czMagicMarker',
  'czPorcelain',
  'czGlow',
  'czCeramic',
];

/**
 * Colozoo strokes are fat and forgiving — a child pressing lightly must still
 * leave a bold, visible mark. Every Colozoo brush clamps its effective width
 * to at least this many CSS px, with ONE deliberate exception: `czPorcelain`,
 * the fine-liner, is exempt so there's a single brush capable of thin detail.
 */
export const COLOZOO_MIN_WIDTH = 8;

export interface PenProfile {
  /** Effective stroke width in CSS px for a pressure (0..1) and base size. */
  widthFor: (pressure: number, baseSize: number) => number;
  /** Base stroke opacity (0..1). Translucency is baked per-point at capture. */
  opacity: number;
  /** Human label for the toolbar. */
  label: string;
  /**
   * Render-time composite operation. PER-STROKE for now: drawStroke sets it
   * before and resets to source-over after each stroke.
   *
   * PHASE 4 (Layers) RECONCILIATION NOTE: when Layer[] lands, blend moves up
   * a level to per-layer compositing — whoever builds Layers must reconcile
   * BOTH mechanisms (this field and layer blend), not discover the conflict.
   */
  blend?: GlobalCompositeOperation;
}

const MIN_WIDTH = 1;

function clampWidth(w: number): number {
  return Math.max(MIN_WIDTH, w);
}

/** Colozoo width floor (see {@link COLOZOO_MIN_WIDTH}) — used by every Colozoo
 *  brush except the exempt `czPorcelain` hairline. */
function clampColozoo(w: number): number {
  return Math.max(COLOZOO_MIN_WIDTH, w);
}

const PROFILES: Record<PenType, PenProfile> = {
  fountain: {
    // Expressive pressure response — thin to thick.
    widthFor: (p, base) => clampWidth(base * (0.35 + p * 1.5)),
    opacity: 1,
    label: 'Fountain',
  },
  ballpoint: {
    // Uniform line, pressure-independent.
    widthFor: (_p, base) => clampWidth(base),
    opacity: 1,
    label: 'Ballpoint',
  },
  brush: {
    // Heavier, strong pressure response.
    widthFor: (p, base) => clampWidth(base * (0.5 + p * 2.2)),
    opacity: 1,
    label: 'Brush',
  },
  pencil: {
    // Graphite feel: light, slightly pressure-sensitive, never fully opaque —
    // overlapping hatch strokes visibly build up.
    widthFor: (p, base) => clampWidth(base * (0.5 + p * 0.7)),
    opacity: 0.72,
    label: 'Pencil',
  },
  neon: {
    // Additive glow: 'screen' brightens what's beneath — designed for the
    // dark canvas. (Like highlighter's multiply caveat in reverse: on a WHITE
    // export background screen collapses toward white; acceptable for a
    // canvas-mode creative brush, documented here on purpose.)
    widthFor: (p, base) => clampWidth(base * (0.8 + p * 1.2)),
    opacity: 0.9,
    label: 'Neon',
    blend: 'screen',
  },
  highlighter: {
    // Wide and translucent. Uses plain source-over (not multiply): its
    // per-point opacity already makes overlaps read as highlighting, and
    // multiply against the opaque export background collapses to near-black.
    widthFor: (_p, base) => clampWidth(base * 3.5),
    opacity: 0.4,
    label: 'Highlighter',
  },

  // ── Colozoo brushes ────────────────────────────────────────────────────
  // Every one clamps to COLOZOO_MIN_WIDTH (except czPorcelain) so a light
  // press still lays down a bold mark. Labels are the friendly names shown in
  // the kids' brush picker.
  czDaub: {
    // Fat round dabber — the default. Strong pressure response, always bold.
    widthFor: (p, base) => clampColozoo(base * (1.4 + p * 2.2)),
    opacity: 1,
    label: 'Daub',
  },
  czMarker: {
    // Uniform bold marker — pressure-independent, confident line.
    widthFor: (_p, base) => clampColozoo(base * 2.4),
    opacity: 0.96,
    label: 'Marker',
  },
  czPaintbrush: {
    // Expressive, thick-to-thicker with pressure.
    widthFor: (p, base) => clampColozoo(base * (1 + p * 2.6)),
    opacity: 1,
    label: 'Paintbrush',
  },
  czPencil: {
    // The "pencil" feel, but still fat and semi-opaque so hatching builds up.
    widthFor: (p, base) => clampColozoo(base * (0.9 + p * 0.9)),
    opacity: 0.82,
    label: 'Pencil',
  },
  czChalk: {
    // Soft, powdery, translucent — overlaps deepen the color.
    widthFor: (p, base) => clampColozoo(base * (1.1 + p * 1.3)),
    opacity: 0.72,
    label: 'Chalk',
  },
  czColorPencil: {
    // Coloured pencil: crisper than chalk, still layers.
    widthFor: (p, base) => clampColozoo(base * (0.9 + p * 1.1)),
    opacity: 0.86,
    label: 'Color pencil',
  },
  czCrayon: {
    // Waxy crayon — bold and near-opaque, gentle pressure response.
    widthFor: (p, base) => clampColozoo(base * (1.2 + p * 1.4)),
    opacity: 0.92,
    label: 'Crayon',
  },
  czMagicMarker: {
    // Bold translucent highlighter-style marker; hue rotates as it draws
    // (texture pass lives in ColozooWorkspace, not here — this is just feel).
    widthFor: (_p, base) => clampColozoo(base * 2.8),
    opacity: 0.6,
    label: 'Magic marker',
  },
  czPorcelain: {
    // The ONE deliberate hairline — exempt from COLOZOO_MIN_WIDTH so there's a
    // brush for fine detail (whiskers, eyes). Uses the normal 1px floor.
    widthFor: (p, base) => clampWidth(base * (0.3 + p * 0.6)),
    opacity: 1,
    label: 'Porcelain',
  },
  czGlow: {
    // Additive glow for the dark "glow mode" — screen brightens what's beneath.
    widthFor: (p, base) => clampColozoo(base * (1.2 + p * 1.6)),
    opacity: 0.9,
    label: 'Glow',
    blend: 'screen',
  },
  czCeramic: {
    // Glossy, thick, fully opaque — a shiny enamel look (shimmer texture pass
    // lives in ColozooWorkspace).
    widthFor: (p, base) => clampColozoo(base * (1.1 + p * 1.7)),
    opacity: 1,
    label: 'Ceramic',
  },
};

export function penProfile(type: PenType): PenProfile {
  return PROFILES[type];
}
