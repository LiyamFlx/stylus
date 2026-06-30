/**
 * Pen "feel" profiles. Each pen type maps pressure → stroke width and carries a
 * base opacity and canvas blend mode. Capture (`useDrawing.buildPoint`) uses
 * `widthFor`/`opacity`; rendering (`render.ts`) uses `blend`.
 *
 * Pure and side-effect-free so the mapping is unit-tested in isolation.
 */

export type PenType = 'fountain' | 'ballpoint' | 'brush' | 'highlighter';

/** Pen types in toolbar display order. */
export const PEN_TYPES: PenType[] = ['fountain', 'ballpoint', 'brush', 'highlighter'];

export interface PenProfile {
  /** Effective stroke width in CSS px for a pressure (0..1) and base size. */
  widthFor: (pressure: number, baseSize: number) => number;
  /** Base stroke opacity (0..1). */
  opacity: number;
  /** Canvas globalCompositeOperation used while drawing this pen. */
  blend: 'source-over' | 'multiply';
  /** Human label for the toolbar. */
  label: string;
}

const MIN_WIDTH = 0.75;

function clampWidth(w: number): number {
  return Math.max(MIN_WIDTH, w);
}

const PROFILES: Record<PenType, PenProfile> = {
  fountain: {
    // Expressive pressure response — thin to thick.
    widthFor: (p, base) => clampWidth(base * (0.35 + p * 1.5)),
    opacity: 1,
    blend: 'source-over',
    label: 'Fountain',
  },
  ballpoint: {
    // Uniform line, pressure-independent.
    widthFor: (_p, base) => clampWidth(base),
    opacity: 1,
    blend: 'source-over',
    label: 'Ballpoint',
  },
  brush: {
    // Heavier, strong pressure response.
    widthFor: (p, base) => clampWidth(base * (0.5 + p * 2.2)),
    opacity: 1,
    blend: 'source-over',
    label: 'Brush',
  },
  highlighter: {
    // Wide, translucent, multiply so overlapping ink stays readable.
    widthFor: (_p, base) => clampWidth(base * 3.5),
    opacity: 0.4,
    blend: 'multiply',
    label: 'Highlighter',
  },
};

export function penProfile(type: PenType): PenProfile {
  return PROFILES[type];
}
