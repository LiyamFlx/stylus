import { describe, it, expect } from 'vitest';
import { COLOZOO_BOOKS, bookById, outlineFromZones } from './books';

describe('colozoo books', () => {
  it('bundles books with pages and unique zone ids per page', () => {
    expect(COLOZOO_BOOKS.length).toBeGreaterThanOrEqual(2);
    for (const book of COLOZOO_BOOKS) {
      expect(book.pages.length).toBeGreaterThan(0);
      for (const page of book.pages) {
        expect(page.zones.length).toBeGreaterThan(0);
        const ids = page.zones.map((z) => z.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(page.viewBox).toBe('0 0 100 100');
      }
    }
  });

  it('derives each page outline from its zones (geometry can never drift)', () => {
    for (const book of COLOZOO_BOOKS) {
      for (const page of book.pages) {
        expect(page.outline).toBe(outlineFromZones(page.zones));
        // Every zone path must appear in the outline.
        for (const z of page.zones) {
          expect(page.outline).toContain(z.d);
        }
      }
    }
  });

  it('bookById falls back to the first book for a missing id', () => {
    expect(bookById('trucks').id).toBe('trucks');
    expect(bookById('does-not-exist')).toBe(COLOZOO_BOOKS[0]);
    expect(bookById(undefined)).toBe(COLOZOO_BOOKS[0]);
  });
});
