import { describe, it, expect } from 'vitest';
import { BRUSH_FAMILIES, familyForBrush } from './brushFamilies';

describe('BRUSH_FAMILIES', () => {
  it('has the four Colozoo product families with primaries', () => {
    const ids = BRUSH_FAMILIES.map((f) => f.id);
    expect(ids).toEqual(['magic-pens', 'paint-brushes', 'ceramic-markers', 'fabric-paint']);
    const fabric = BRUSH_FAMILIES.find((f) => f.id === 'fabric-paint')!;
    expect(fabric.badge).toBe('3D Puffy Effect');
    expect(fabric.primary).toBe('czCrayon');
  });
  it('maps a brush back to its family', () => {
    expect(familyForBrush('czPaintbrush')).toBe('paint-brushes');
    expect(familyForBrush('czGlow')).toBe('magic-pens');
  });
});
