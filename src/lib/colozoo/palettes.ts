/**
 * ColoZoo named color palettes. Every swatch has a NAME — kids learn color
 * names this way ("Firetruck Red", not "#EF5350"). Names follow the physical
 * Colozoo product naming conventions; palettes map to product SKU sets
 * ("Tempera 12", "Glow 8") and switch with the active brush type.
 */

import type { ColozooBrush } from '../penProfiles';

export interface NamedColor {
  name: string;
  hex: string;
}

/** ColoZoo brand accent — replaces Scanmarker orange in this mode only. */
export const COLOZOO_ACCENT = '#FF6B2B';
/** Cream canvas base — matches the brand's clean product packaging. */
export const COLOZOO_BG = '#FFFDF7';
/** Glow-mode canvas background (near-black, faint violet). */
export const COLOZOO_GLOW_BG = '#0A0010';

/** "Tempera 12" — the default palette for most brushes. */
export const TEMPERA_12: NamedColor[] = [
  { name: 'Firetruck Red', hex: '#E53935' },
  { name: 'Sunny Yellow', hex: '#FDD835' },
  { name: 'Gecko Green', hex: '#43A047' },
  { name: 'Ocean Blue', hex: '#1E88E5' },
  { name: 'Grape Purple', hex: '#8E24AA' },
  { name: 'Tangerine Orange', hex: '#FB8C00' },
  { name: 'Bubblegum Pink', hex: '#EC407A' },
  { name: 'Chocolate Brown', hex: '#6D4C41' },
  { name: 'Sky Blue', hex: '#4FC3F7' },
  { name: 'Grass Green', hex: '#9CCC65' },
  { name: 'Cloud White', hex: '#FFFFFF' },
  { name: 'Midnight Black', hex: '#212121' },
];

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
  return TEMPERA_12;
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
