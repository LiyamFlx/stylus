import { describe, it, expect } from 'vitest';
import { COLOZOO_THEME, LEAF_SVG, SPARKLE_PATH } from './theme';

describe('COLOZOO_THEME', () => {
  it('exposes the exact brand hexes', () => {
    expect(COLOZOO_THEME.teal).toBe('#3BBAC6');
    expect(COLOZOO_THEME.red).toBe('#EF5B5B');
    expect(COLOZOO_THEME.stage).toBe('#DFF3F1');
  });
  it('provides leaf + sparkle vector data', () => {
    expect(LEAF_SVG.leafA).toMatch(/^M/);
    expect(LEAF_SVG.leafB).toMatch(/^M/);
    expect(SPARKLE_PATH).toMatch(/^M/);
  });
});
