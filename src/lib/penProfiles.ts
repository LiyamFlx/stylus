/**
 * Pen "feel" profiles. Each pen type maps pressure → stroke width and carries a
 * base opacity. Capture (`useDrawing.buildPoint`) uses `widthFor`/`opacity` to
 * bake the pen's feel into each point.
 *
 * Pure and side-effect-free so the mapping is unit-tested in isolation.
 */

export type PenType =
  | 'fountain'
  | 'ballpoint'
  | 'brush'
  | 'highlighter'
  | 'pencil'
  | 'neon'
  | ColozooBrush;

/**
 * ColoZoo mode brushes (kids' coloring — see lib/colozoo). Full PenType
 * members so strokes persist/render through the existing pipeline unchanged,
 * but deliberately EXCLUDED from PEN_TYPES: the shared toolbar never offers
 * them, and ColozooWorkspace never offers the classic pens. Two disjoint
 * pickers over one stroke format.
 */
export type ColozooBrush =
  | 'czDaub' // Bingo dauber: stamps a dot on tap (interaction handled in ColoZoo UI)
  | 'czMarker'
  | 'czPaintbrush'
  | 'czPencil'
  | 'czChalk'
  | 'czColorPencil'
  | 'czCrayon'
  | 'czMagicMarker'
  | 'czPorcelain'
  | 'czGlow' // acrylic glow: screen blend, pairs with dark canvas (useGlowMode)
  | 'czCeramic'; // gold/silver locked palette

/** ColoZoo brushes in picker display order. */
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

/** Pen types in toolbar display order (classic modes only — ColoZoo brushes
 *  live in COLOZOO_BRUSHES and never appear here). */
export const PEN_TYPES: PenType[] = [
  'fountain',
  'ballpoint',
  'brush',
  'pencil',
  'neon',
  'highlighter',
];

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

/**
 * ColoZoo global minimum stroke width — no accidental hairlines from a
 * toddler's glancing touch. Every ColoZoo brush width passes through this
 * (except czPorcelain, the one deliberate thin-line tool for older kids).
 */
export const COLOZOO_MIN_WIDTH = 8;

function czWidth(w: number): number {
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

  // ── ColoZoo brushes ────────────────────────────────────────────────────────
  // Widths are absolute (pressure-scaled px), ignoring baseSize: kids don't
  // pick sizes, the brush IS the size. Texture passes (stipple, jitter,
  // shimmer, hue-rotate) are Phase 2 render work — profiles here carry the
  // width/opacity/blend contract that the stroke format persists today.
  czDaub: {
    // Fixed fat dot; the stamp interaction (no drag stroke) lives in ColoZoo UI.
    widthFor: () => 36,
    opacity: 1,
    label: 'Daub marker',
  },
  czMarker: {
    widthFor: (p) => czWidth(p * 6 + 3),
    opacity: 1,
    label: 'Marker',
  },
  czPaintbrush: {
    widthFor: (p) => czWidth(p * 16),
    opacity: 0.8,
    label: 'Paintbrush',
  },
  czPencil: {
    widthFor: (p) => czWidth(p * 10),
    opacity: 0.65,
    label: 'Pencil',
  },
  czChalk: {
    widthFor: (p) => czWidth(p * 18),
    opacity: 0.55,
    label: 'Chalk',
  },
  czColorPencil: {
    widthFor: (p) => czWidth(p * 14),
    opacity: 0.78,
    label: 'Color pencil',
  },
  czCrayon: {
    widthFor: (p) => czWidth(p * 20),
    opacity: 0.88,
    label: 'Crayon',
  },
  czMagicMarker: {
    widthFor: (p) => czWidth(p * 12),
    opacity: 0.9,
    label: 'Magic marker',
  },
  czPorcelain: {
    // The ONE thin tool — hairline for detail work, exempt from czWidth.
    widthFor: (p) => clampWidth(p * 4 + 1),
    opacity: 1,
    label: 'Porcelain pen',
  },
  czGlow: {
    widthFor: (p) => czWidth(p * 14),
    opacity: 0.85,
    label: 'Acrylic glow',
    blend: 'screen',
  },
  czCeramic: {
    widthFor: (p) => czWidth(p * 16),
    opacity: 0.9,
    label: 'Ceramic paint',
  },
};

export function penProfile(type: PenType): PenProfile {
  return PROFILES[type];
}
