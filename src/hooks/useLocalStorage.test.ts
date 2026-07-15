import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalStorage, loadContent, loadStrokes } from './useLocalStorage';
import type { DrawingContent } from './useLocalStorage';
import { shape, stroke } from '../test/fixtures';

const STORAGE_KEY = 'stylus.ink.v1';

function read() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
}

function content(over: Partial<DrawingContent> = {}): DrawingContent {
  return { strokes: [], shapes: [], ...over };
}

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('save (debounced) + flush', () => {
    it('writes the latest content after the debounce window, as a version-2 payload', () => {
      const { result } = renderHook(() => useLocalStorage());
      const s = stroke([[1, 2], [3, 4]]);
      act(() => result.current.save(content({ strokes: [s] })));
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // not yet
      act(() => vi.advanceTimersByTime(400));
      expect(read().strokes).toHaveLength(1);
      expect(read().shapes).toEqual([]);
      expect(read().version).toBe(2);
    });

    it('persists shapes alongside strokes', () => {
      const { result } = renderHook(() => useLocalStorage());
      const sh = shape({ id: 'r1' });
      act(() => result.current.save(content({ shapes: [sh] })));
      act(() => vi.advanceTimersByTime(400));
      expect(read().shapes).toHaveLength(1);
      expect(read().shapes[0].id).toBe('r1');
    });

    it('coalesces a burst of saves into a single trailing write', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.save(content({ strokes: [stroke([[0, 0]])] }));
        result.current.save(content({ strokes: [stroke([[0, 0]]), stroke([[1, 1]])] }));
        result.current.save(
          content({ strokes: [stroke([[0, 0]]), stroke([[1, 1]]), stroke([[2, 2]])] }),
        );
      });
      act(() => vi.advanceTimersByTime(400));
      expect(setItem).toHaveBeenCalledTimes(1); // only the last value persisted
      expect(read().strokes).toHaveLength(3);
    });

    it('flush() writes the pending value immediately', () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => result.current.save(content({ strokes: [stroke([[5, 5]])] })));
      act(() => result.current.flush());
      expect(read().strokes).toHaveLength(1);
    });

    it('flushes pending writes on unmount', () => {
      const { result, unmount } = renderHook(() => useLocalStorage());
      act(() => result.current.save(content({ strokes: [stroke([[9, 9]])] })));
      unmount();
      expect(read().strokes).toHaveLength(1);
    });

    it('flushes pending writes when the page is hidden (pagehide)', () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => result.current.save(content({ strokes: [stroke([[7, 7]])] })));
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(read().strokes).toHaveLength(1);
    });

    it('swallows quota / disabled-storage errors', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      const { result } = renderHook(() => useLocalStorage());
      act(() => result.current.save(content({ strokes: [stroke([[0, 0]])] })));
      expect(() => act(() => vi.advanceTimersByTime(400))).not.toThrow();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('onSaved (ADR 002 sync boundary)', () => {
    it('fires only after the local write has actually landed in localStorage', () => {
      const onSaved = vi.fn(() => {
        // At the moment onSaved runs, the write must already be durable —
        // this is the exact invariant the sync push depends on.
        expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      });
      const { result } = renderHook(() => useLocalStorage(STORAGE_KEY, onSaved));
      act(() => result.current.save(content({ strokes: [stroke([[1, 1]])] })));
      act(() => vi.advanceTimersByTime(400));
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('passes the saved content and timestamp through', () => {
      const onSaved = vi.fn();
      const { result } = renderHook(() => useLocalStorage(STORAGE_KEY, onSaved));
      const s = stroke([[2, 2]], { id: 'sx' });
      act(() => result.current.save(content({ strokes: [s] })));
      act(() => vi.advanceTimersByTime(400));
      expect(onSaved).toHaveBeenCalledTimes(1);
      const [saved, savedAt] = onSaved.mock.calls[0];
      expect(saved.strokes).toHaveLength(1);
      expect(saved.strokes[0].id).toBe('sx');
      expect(typeof savedAt).toBe('number');
    });

    it('is never called when the local write fails — nothing to push', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      const onSaved = vi.fn();
      const { result } = renderHook(() => useLocalStorage(STORAGE_KEY, onSaved));
      act(() => result.current.save(content({ strokes: [stroke([[0, 0]])] })));
      act(() => vi.advanceTimersByTime(400));
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('omitting onSaved changes nothing about local persistence', () => {
      // No third argument at all — the default/undefined path must behave
      // identically to every existing call site (useDrawing.ts passes none
      // today unless a sync callback is wired).
      const { result } = renderHook(() => useLocalStorage(STORAGE_KEY));
      act(() => result.current.save(content({ strokes: [stroke([[3, 3]])] })));
      expect(() => act(() => vi.advanceTimersByTime(400))).not.toThrow();
      expect(read().strokes).toHaveLength(1);
    });

    it('reads a fresh onSaved on every save without restarting the debounce timer', () => {
      // onSaved is captured via a ref (not a flush dependency) specifically
      // so a new closure each render doesn't thrash the debounce — verify a
      // changed callback between save() and the flush still fires the LATEST
      // one, proving the ref-read happens at flush time, not save time.
      const first = vi.fn();
      const second = vi.fn();
      const { result, rerender } = renderHook(
        ({ cb }) => useLocalStorage(STORAGE_KEY, cb),
        { initialProps: { cb: first } },
      );
      act(() => result.current.save(content({ strokes: [stroke([[4, 4]])] })));
      rerender({ cb: second });
      act(() => vi.advanceTimersByTime(400));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe('load', () => {
    it('returns empty strokes and shapes when nothing is stored', () => {
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load()).toEqual({ strokes: [], shapes: [] });
    });

    it('round-trips a saved drawing (strokes and shapes together)', () => {
      const { result } = renderHook(() => useLocalStorage());
      const s = stroke([[1, 1], [2, 2]], { id: 'abc', color: '#ef4444', size: 8 });
      const sh = shape({ id: 'r1' });
      act(() => result.current.save(content({ strokes: [s], shapes: [sh] })));
      act(() => result.current.flush());
      const loaded = result.current.load();
      expect(loaded.strokes).toHaveLength(1);
      expect(loaded.strokes[0].id).toBe('abc');
      expect(loaded.strokes[0].points).toHaveLength(2);
      expect(loaded.shapes).toHaveLength(1);
      expect(loaded.shapes[0].id).toBe('r1');
    });

    it('rejects a payload with an unknown version', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, strokes: [] }));
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load()).toEqual({ strokes: [], shapes: [] });
    });

    it('reads a version-1 payload (pre-shapes) as strokes with empty shapes — the migration path', () => {
      const s = stroke([[0, 0]], { id: 'legacy' });
      // A real v1 payload written before shapes existed: no `shapes` key at all.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, strokes: [s], savedAt: 0 }),
      );
      const { result } = renderHook(() => useLocalStorage());
      const loaded = result.current.load();
      expect(loaded.strokes).toHaveLength(1);
      expect(loaded.strokes[0].id).toBe('legacy');
      expect(loaded.shapes).toEqual([]);
    });

    it('returns [] on corrupt JSON', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, '{not valid json');
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load()).toEqual({ strokes: [], shapes: [] });
    });

    it('filters out malformed strokes', () => {
      const good = stroke([[0, 0]], { id: 'good' });
      const payload = {
        version: 2,
        strokes: [
          good,
          { id: 'no-points' }, // missing points
          { id: 1, color: '#fff', size: 2, points: [] }, // bad id type
        ],
        shapes: [],
        savedAt: 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const { result } = renderHook(() => useLocalStorage());
      const loaded = result.current.load();
      expect(loaded.strokes).toHaveLength(1);
      expect(loaded.strokes[0].id).toBe('good');
    });

    it('rejects strokes whose points have the wrong shape', () => {
      const payload = {
        version: 2,
        strokes: [
          { id: 'a', color: '#fff', size: 2, points: [{ x: 1 }] }, // missing y/pressure/t
        ],
        shapes: [],
        savedAt: 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load().strokes).toEqual([]);
    });

    it('filters out malformed shapes (missing required fields)', () => {
      const good = shape({ id: 'good' });
      const payload = {
        version: 2,
        strokes: [],
        shapes: [good, { id: 'bad', type: 'not-a-real-type' }],
        savedAt: 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const { result } = renderHook(() => useLocalStorage());
      const loaded = result.current.load();
      expect(loaded.shapes).toHaveLength(1);
      expect(loaded.shapes[0].id).toBe('good');
    });
  });

  describe('clear', () => {
    it('removes the stored drawing and cancels pending writes', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const { result } = renderHook(() => useLocalStorage());
      act(() => result.current.save(content({ strokes: [stroke([[0, 0]])] })));
      act(() => result.current.clear());
      setItem.mockClear();
      act(() => vi.advanceTimersByTime(400));
      expect(setItem).not.toHaveBeenCalled(); // pending write was cancelled
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});

describe('loadContent (one-shot, arbitrary key)', () => {
  beforeEach(() => localStorage.clear());

  it('matches useLocalStorage.load()\'s validation for an arbitrary key', () => {
    const key = 'stylus.doc.v1.other-doc.ink';
    const s = stroke([[1, 1]], { id: 'x' });
    localStorage.setItem(key, JSON.stringify({ version: 2, strokes: [s], shapes: [], savedAt: 0 }));
    const loaded = loadContent(key);
    expect(loaded.strokes).toHaveLength(1);
    expect(loaded.strokes[0].id).toBe('x');
    // normalizeStroke back-fills width/opacity on load (a legit repair for
    // gaps in the original point shape) — not asserting exact equality here
    // since that repair is expected, not a regression.
    expect(loaded.shapes).toEqual([]);
  });
});

describe('loadStrokes (deprecated strokes-only accessor)', () => {
  beforeEach(() => localStorage.clear());

  it('returns only the strokes half of loadContent, for read sites that never needed shapes', () => {
    const key = 'stylus.doc.v1.other-doc.ink';
    const s = stroke([[1, 1]], { id: 'x' });
    const sh = shape({ id: 'r1' });
    localStorage.setItem(
      key,
      JSON.stringify({ version: 2, strokes: [s], shapes: [sh], savedAt: 0 }),
    );
    const strokes = loadStrokes(key);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].id).toBe('x');
  });
});
