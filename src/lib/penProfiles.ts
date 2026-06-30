/**
 * Pen "feel" profiles. Each pen type maps pressure → stroke width and carries a
 * base opacity. Capture (`useDrawing.buildPoint`) uses `widthFor`/`opacity` to
 * bake the pen's feel into each point.
 *
 * Pure and side-effect-free so the mapping is unit-tested in isolation.
 */

export type PenType = 'fountain' | 'ballpoint' | 'brush' | 'highlighter';

/** Pen types in toolbar display order. */
export const PEN_TYPES: PenType[] = ['fountain', 'ballpoint', 'brush', 'highlighter'];

export interface PenProfile {
  /** Effective stroke width in CSS px for a pressure (0..1) and base size. */
  widthFor: (pressure: number, baseSize: number) => number;
  /** Base stroke opacity (0..1). Translucency is baked per-point at capture. */
  opacity: number;
  /** Human label for the toolbar. */
  label: string;
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
