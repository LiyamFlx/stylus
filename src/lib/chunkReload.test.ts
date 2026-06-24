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
    expect(sessionStorage.getItem('stylus.chunk-reloaded')).toBe('1');
    void failing;
  });

  it('rethrows (no reload loop) if a chunk fails again after a reload', async () => {
    sessionStorage.setItem('stylus.chunk-reloaded', '1');
    await expect(
      importChunk(() =>
        Promise.reject(new Error('Failed to fetch dynamically imported module')),
      ),
    ).rejects.toThrow(/dynamically imported module/);
    expect(reload).not.toHaveBeenCalled();
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
