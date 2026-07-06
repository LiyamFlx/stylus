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
  | 'neon';

/** Pen types in toolbar display order. */
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
};

export function penProfile(type: PenType): PenProfile {
  return PROFILES[type];
}
