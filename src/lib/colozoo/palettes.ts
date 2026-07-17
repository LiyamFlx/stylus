/**
 * ColoZoo named color palettes. Every swatch has a NAME — kids learn color
 * names this way ("Primary Red", not "#E73F3E"). The visible palette column is
 * COLOZOO_PALETTE_GROUPS (Core / Colozoo Accent), hexes sampled from the
 * approved v3 mockup. Brush-locked SKU sets (Glow 8, Metallic 2) still apply
 * for their brushes.
 */

import type { ColozooBrush } from '../penProfiles';

export interface NamedColor {
  name: string;
  hex: string;
}

/** ColoZoo brand accent (v3 teal) — replaces Scanmarker orange in this mode. */
export const COLOZOO_ACCENT = '#3DB7C4';
/** Stage base behind the page (v3 pale aqua). */
export const COLOZOO_BG = '#C7E9EA';
/** Glow-mode canvas background (near-black, faint violet). */
export const COLOZOO_GLOW_BG = '#0A0010';

/** The visible palette column: full-width named bars grouped per v3. */
export const COLOZOO_PALETTE_GROUPS: { label: string; colors: NamedColor[] }[] = [
  {
    label: 'Core Colors',
    colors: [
      { name: 'Black', hex: '#1A1A1A' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Brown', hex: '#784A28' },
      { name: 'Primary Red', hex: '#E73F3E' },
      { name: 'Blue', hex: '#4483E0' },
      { name: 'Yellow', hex: '#FCDB34' },
      { name: 'Orange', hex: '#F2912A' },
    ],
  },
  {
    label: 'Colozoo Accent Colors',
    colors: [
      { name: 'Pink', hex: '#F394C0' },
      { name: 'Lavender', hex: '#BEA7DD' },
      { name: 'Teal', hex: '#228E8E' },
      { name: 'Lime Green', hex: '#8CC746' },
    ],
  },
];

export const ALL_COLOZOO_COLORS: NamedColor[] = COLOZOO_PALETTE_GROUPS.flatMap(
  (g) => g.colors,
);

/** "Glow 8" — neon set, active in glow mode / acrylic glow brush. */
export const GLOW_8: NamedColor[] = [
  { name: 'Electric Pink', hex: '#FF2E92' },
  { name: 'Laser Lime', hex: '#B4FF39' },
  { name: 'Comet Cyan', hex: '#2EF5FF' },
  { name: 'Hot Orange', hex: '#FF7A2E' },
  { name: 'UV Blue', hex: '#3D5AFE' },
  { name: 'Neon Yellow', hex: '#F4FF2E' },
  { name: 'Magic Magenta', hex: '#E040FB' },
  { name: 'Moonbeam White', hex: '#FFFFFF' },
];

/** "Metallic 2" — ceramic paint's locked gold/silver set. */
export const METALLIC_2: NamedColor[] = [
  { name: 'Treasure Gold', hex: '#D4AF37' },
  { name: 'Starlight Silver', hex: '#C0C4CC' },
];

/** The palette a brush offers. One rule, no per-component branching. */
export function paletteForBrush(brush: ColozooBrush): NamedColor[] {
  if (brush === 'czGlow') return GLOW_8;
  if (brush === 'czCeramic') return METALLIC_2;
  return ALL_COLOZOO_COLORS;
}

/** Reads the color name aloud — zero-dependency SpeechSynthesis. Safe no-op
 *  where unsupported. */
export function speakColorName(name: string): void {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(name));
  } catch {
    // never let audio failure break painting
  }
}
