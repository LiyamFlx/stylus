import { describe, it, expect } from 'vitest';
import { COLOZOO_BOOKS } from './books';
import { buildPagePNGBlob, savePagePNG } from './exportPage';

// jsdom has no real 2D canvas context (and no Path2D), so the compositor can't
// run here — these assert it degrades to null/false instead of throwing, which
// is the contract browsers-only code must honour under test.
const page = COLOZOO_BOOKS[0].pages[0];

describe('colozoo page export (graceful where unsupported)', () => {
  it('buildPagePNGBlob resolves null when canvas/Path2D are unavailable', async () => {
    const blob = await buildPagePNGBlob(page, { fills: {}, ink: [] });
    expect(blob).toBeNull();
  });

  it('savePagePNG resolves false (nothing to share) rather than throwing', async () => {
    await expect(savePagePNG(page, { fills: { chassis: '#EF4444' }, ink: [] })).resolves.toBe(false);
  });
});
