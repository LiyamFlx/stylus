/**
 * Pure HSB(HSV) ↔ hex conversions for the color wheel (Phase 3 item 3).
 * No DOM, fully unit-testable.
 */

export interface HSB {
  /** Hue 0..360 */
  h: number;
  /** Saturation 0..1 */
  s: number;
  /** Brightness 0..1 */
  b: number;
}

export function hsbToHex({ h, s, b }: HSB): string {
  const c = b * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = b - c;
  const to255 = (v: number) => Math.round((v + m) * 255);
  const hex = (v: number) => to255(v).toString(16).padStart(2, '0');
  return `#${hex(r1)}${hex(g1)}${hex(b1)}`;
}

export function hexToHsb(hex: string): HSB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, b: max };
}
