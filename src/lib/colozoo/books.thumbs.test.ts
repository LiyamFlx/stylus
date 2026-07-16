import { describe, it, expect } from 'vitest';
import { COLOZOO_BOOKS } from './books';

describe('book thumbnails', () => {
  it('every book has a non-empty inline-SVG thumb', () => {
    for (const b of COLOZOO_BOOKS) {
      expect(typeof b.thumbSvg).toBe('string');
      expect(b.thumbSvg!.length).toBeGreaterThan(10);
      expect(b.thumbSvg).not.toContain('<svg');
    }
  });
});
