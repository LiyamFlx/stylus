/**
 * Colozoo palettes and colour-naming.
 *
 * Colours are NAMED (not just hex) so the mode can speak them aloud — a child
 * who can't read still hears "orange" when they pick it. Palettes are chosen
 * per brush: the glow brush swaps to bright neons that read on the dark glow
 * background; every other brush uses the full tempera set plus two metallics.
 */

import type { ColozooBrush } from '../penProfiles';

export interface NamedColor {
  /** Spoken/label name, e.g. "Sunshine". */
  name: string;
  hex: string;
}

/** The Colozoo brand accent (buttons, highlights, the primary CTA). */
export const COLOZOO_ACCENT = '#FF6B2B';
/** The warm paper background of a normal (non-glow) coloring page. */
export const COLOZOO_BG = '#FFFDF7';

/** Twelve tempera-paint colours — the everyday palette. */
export const TEMPERA_12: readonly NamedColor[] = [
  { name: 'Cherry', hex: '#EF4444' },
  { name: 'Tangerine', hex: '#F97316' },
  { name: 'Sunshine', hex: '#FACC15' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Grass', hex: '#22C55E' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Sky', hex: '#38BDF8' },
  { name: 'Royal', hex: '#3B82F6' },
  { name: 'Grape', hex: '#8B5CF6' },
  { name: 'Bubblegum', hex: '#EC4899' },
  { name: 'Cocoa', hex: '#8B5E34' },
  { name: 'Midnight', hex: '#1F2937' },
] as const;

/** Eight bright neons for glow mode — chosen to pop on the dark background. */
export const GLOW_8: readonly NamedColor[] = [
  { name: 'Neon pink', hex: '#FF4FD8' },
  { name: 'Neon orange', hex: '#FF8A3D' },
  { name: 'Neon yellow', hex: '#FFF23D' },
  { name: 'Neon lime', hex: '#9DFF3D' },
  { name: 'Neon green', hex: '#3DFF88' },
  { name: 'Neon cyan', hex: '#3DF0FF' },
  { name: 'Neon blue', hex: '#4D8BFF' },
  { name: 'Neon purple', hex: '#B45DFF' },
] as const;

/** Two metallic colours for the shiny brushes (ceramic/porcelain flavour). */
export const METALLIC_2: readonly NamedColor[] = [
  { name: 'Gold', hex: '#D4AF37' },
  { name: 'Silver', hex: '#C0C4CC' },
] as const;

/** The everyday palette: all tempera colours plus the two metallics. */
const STANDARD_PALETTE: readonly NamedColor[] = [...TEMPERA_12, ...METALLIC_2];

/**
 * The palette to show for a given brush. The glow brush gets the neon set
 * (its `screen` blend only reads on the dark glow background); every other
 * brush gets the standard tempera + metallic palette.
 */
export function paletteForBrush(brush: ColozooBrush): readonly NamedColor[] {
  return brush === 'czGlow' ? GLOW_8 : STANDARD_PALETTE;
}

/** Look up a colour's friendly name by hex (case-insensitive). Falls back to
 *  the hex itself so a spoken/aria string is always available. */
export function colorName(hex: string): string {
  const target = hex.toLowerCase();
  for (const c of [...TEMPERA_12, ...GLOW_8, ...METALLIC_2]) {
    if (c.hex.toLowerCase() === target) return c.name;
  }
  return hex;
}

/**
 * Speak a colour's name aloud via the Web Speech API. Best-effort and silent:
 * a no-op when speech synthesis is unavailable (SSR, unsupported browser) or
 * throws. Cancels any in-flight utterance first so rapid taps don't queue up.
 */
export function speakColorName(hex: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(colorName(hex));
    u.rate = 0.95;
    u.pitch = 1.15; // a touch brighter — friendlier for kids
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // best-effort — speaking a colour is a delight, never a requirement
  }
}
