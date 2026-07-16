import { describe, it, expect } from 'vitest';
import { COLOZOO_PALETTE_GROUPS, ALL_COLOZOO_COLORS } from './palettes';

describe('COLOZOO_PALETTE_GROUPS', () => {
  it('has Core and Accent groups with the branded names', () => {
    const labels = COLOZOO_PALETTE_GROUPS.map((g) => g.label);
    expect(labels).toEqual(['Core Colors', 'Colozoo Accent Colors']);
    const names = ALL_COLOZOO_COLORS.map((c) => c.name);
    expect(names).toContain('Primary Red');
    expect(names).toContain('Lime Green');
    expect(names).toContain('Teal');
  });
  it('every color has a name and a #hex', () => {
    for (const c of ALL_COLOZOO_COLORS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
