/**
 * Colozoo brand tokens — single source of truth for the v3 look.
 * Every hex here is sampled from the approved v3 mockup (v3.png), not invented.
 */
export const COLOZOO_THEME = {
  /** Outer app frame / header teal. */
  teal: '#3DB7C4',
  /** Deeper teal for pressed states and the SAVE pill border. */
  tealDeep: '#2AA3AF',
  /** The stage — pale aqua play area behind the page. */
  stage: '#C7E9EA',
  /** Active row highlight in the brush card. */
  mint: '#D4EEEB',
  /** SAVE MY ART pill fill. */
  pill: '#42B6C3',
  /** Dark slate-teal badges ("Washes Out", "3D Puffy Effect"). */
  badge: '#3F6B74',
  /** Card + template-bar surface. */
  card: '#FFFFFF',
  /** Primary text on light surfaces. */
  ink: '#2A3438',
  /** Glow-mode backdrop. */
  glowBg: '#0A0010',
} as const;

/** Two organic leaf silhouettes for the corner motif (viewBox 0 0 100 100). */
export const LEAF_SVG = {
  leafA: 'M50 5 C20 20 10 60 45 95 C55 60 90 40 50 5Z',
  leafB: 'M50 5 C80 20 90 60 55 95 C45 60 10 40 50 5Z',
} as const;

/** Four-point sparkle star (viewBox 0 0 24 24). */
export const SPARKLE_PATH = 'M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10Z';

/** Readable text color for an arbitrary fill (WCAG-ish luminance split). */
export function textOn(hex: string): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? '#2A3438' : '#FFFFFF';
}
