import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { importChunk, isChunkLoadError } from './chunkReload';

describe('isChunkLoadError', () => {
  it('recognizes Vite stale-chunk failures', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/a.js')),
    ).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(
      isChunkLoadError(new Error('Expected a JavaScript-or-Wasm module script but got text/html')),
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('canvas is empty'))).toBe(false);
    expect(isChunkLoadError('boom')).toBe(false);
  });
});

describe('importChunk', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the loaded module on success', async () => {
    const mod = { hello: 'world' };
    await expect(importChunk(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once on a stale-chunk failure and never resolves', async () => {
    const failing = importChunk(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/x.js')),
    );
    // The promise intentionally never settles (the page is reloading); assert
    // the side effect instead of awaiting.
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    // The flag records *when* the reload happened (a recent timestamp), not a
    // bare boolean, so the cooldown guard can expire.
    const ts = Number(sessionStorage.getItem('stylus.chunk-reloaded'));
    expect(Date.now() - ts).toBeLessThan(1000);
    void failing;
  });

  it('rethrows (no reload loop) if a chunk fails again within the cooldown', async () => {
    // A reload that just happened (fresh timestamp) → still in cooldown.
    sessionStorage.setItem('stylus.chunk-reloaded', String(Date.now()));
    await expect(
      importChunk(() =>
        Promise.reject(new Error('Failed to fetch dynamically imported module')),
      ),
    ).rejects.toThrow(/dynamically imported module/);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again once the cooldown has expired (stale flag from an old load)', async () => {
    // A reload flag far in the past → cooldown expired → a fresh stale-chunk
    // failure gets a new reload attempt rather than being stuck throwing.
    sessionStorage.setItem('stylus.chunk-reloaded', String(Date.now() - 60_000));
    const failing = importChunk(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    void failing;
  });

  it('rethrows non-chunk errors without reloading', async () => {
    await expect(
      importChunk(() => Promise.reject(new Error('something else'))),
    ).rejects.toThrow('something else');
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the reload flag after a successful load', async () => {
    sessionStorage.setItem('stylus.chunk-reloaded', '1');
    await importChunk(() => Promise.resolve({}));
    expect(sessionStorage.getItem('stylus.chunk-reloaded')).toBeNull();
  });
});
