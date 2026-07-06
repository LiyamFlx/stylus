import { describe, it, expect } from 'vitest';
import { hexToHsb, hsbToHex } from './color';

describe('hsb <-> hex', () => {
  it('primary anchors', () => {
    expect(hsbToHex({ h: 0, s: 1, b: 1 })).toBe('#ff0000');
    expect(hsbToHex({ h: 120, s: 1, b: 1 })).toBe('#00ff00');
    expect(hsbToHex({ h: 240, s: 1, b: 1 })).toBe('#0000ff');
    expect(hsbToHex({ h: 0, s: 0, b: 1 })).toBe('#ffffff');
    expect(hsbToHex({ h: 0, s: 0, b: 0 })).toBe('#000000');
  });

  it('round-trips within 1/255 per channel', () => {
    for (const hex of ['#3b82f6', '#fde047', '#a855f7', '#123456', '#fafafa']) {
      const hsb = hexToHsb(hex)!;
      const back = hsbToHex(hsb);
      const c = (x: string, i: number) => parseInt(x.slice(1 + i * 2, 3 + i * 2), 16);
      for (let i = 0; i < 3; i++) expect(Math.abs(c(back, i) - c(hex, i))).toBeLessThanOrEqual(1);
    }
  });

  it('rejects malformed hex', () => {
    expect(hexToHsb('red')).toBeNull();
    expect(hexToHsb('#12345')).toBeNull();
  });

  it('hue wraps', () => {
    expect(hsbToHex({ h: 360, s: 1, b: 1 })).toBe('#ff0000');
    expect(hsbToHex({ h: -120, s: 1, b: 1 })).toBe('#0000ff');
  });
});
