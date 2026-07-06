import { describe, it, expect, vi } from 'vitest';
import { deleteImages } from './imageStore';

describe('imageStore.deleteImages', () => {
  it('is a silent no-op for empty input', async () => {
    await expect(deleteImages([])).resolves.toBeUndefined();
  });

  it('never throws when IndexedDB is unavailable (best-effort by contract)', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => { throw new Error('no idb'); },
    });
    await expect(deleteImages(['a', 'b'])).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
