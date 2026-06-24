import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';
import { stroke } from '../test/fixtures';

const STORAGE_KEY = 'stylus.ink.v1';

function read() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
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
    it('writes the latest strokes after the debounce window', () => {
      const { result } = renderHook(() => useLocalStorage());
      const s = stroke([[1, 2], [3, 4]]);
      act(() => result.current.save([s]));
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // not yet
      act(() => vi.advanceTimersByTime(400));
      expect(read().strokes).toHaveLength(1);
      expect(read().version).toBe(1);
    });

    it('coalesces a burst of saves into a single trailing write', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.save([stroke([[0, 0]])]);
        result.current.save([stroke([[0, 0]]), stroke([[1, 1]])]);
        result.current.save([stroke([[0, 0]]), stroke([[1, 1]]), stroke([[2, 2]])]);
      });
      act(() => vi.advanceTimersByTime(400));
      expect(setItem).toHaveBeenCalledTimes(1); // only the last value persisted
      expect(read().strokes).toHaveLength(3);
    });

    it('flush() writes the pending value immediately', () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => result.current.save([stroke([[5, 5]])]));
      act(() => result.current.flush());
      expect(read().strokes).toHaveLength(1);
    });

    it('flushes pending writes on unmount', () => {
      const { result, unmount } = renderHook(() => useLocalStorage());
      act(() => result.current.save([stroke([[9, 9]])]));
      unmount();
      expect(read().strokes).toHaveLength(1);
    });

    it('flushes pending writes when the page is hidden (pagehide)', () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => result.current.save([stroke([[7, 7]])]));
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
      act(() => result.current.save([stroke([[0, 0]])]));
      expect(() => act(() => vi.advanceTimersByTime(400))).not.toThrow();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('load', () => {
    it('returns [] when nothing is stored', () => {
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load()).toEqual([]);
    });

    it('round-trips a saved drawing', () => {
      const { result } = renderHook(() => useLocalStorage());
      const s = stroke([[1, 1], [2, 2]], { id: 'abc', color: '#ef4444', size: 8 });
      act(() => result.current.save([s]));
      act(() => result.current.flush());
      const loaded = result.current.load();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('abc');
      expect(loaded[0].points).toHaveLength(2);
    });

    it('rejects a payload with the wrong version', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, strokes: [] }));
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load()).toEqual([]);
    });

    it('returns [] on corrupt JSON', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, '{not valid json');
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load()).toEqual([]);
    });

    it('filters out malformed strokes', () => {
      const good = stroke([[0, 0]], { id: 'good' });
      const payload = {
        version: 1,
        strokes: [
          good,
          { id: 'no-points' }, // missing points
          { id: 1, color: '#fff', size: 2, points: [] }, // bad id type
        ],
        savedAt: 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const { result } = renderHook(() => useLocalStorage());
      const loaded = result.current.load();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('good');
    });

    it('rejects strokes whose points have the wrong shape', () => {
      const payload = {
        version: 1,
        strokes: [
          { id: 'a', color: '#fff', size: 2, points: [{ x: 1 }] }, // missing y/pressure/t
        ],
        savedAt: 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.load()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes the stored drawing and cancels pending writes', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const { result } = renderHook(() => useLocalStorage());
      act(() => result.current.save([stroke([[0, 0]])]));
      act(() => result.current.clear());
      setItem.mockClear();
      act(() => vi.advanceTimersByTime(400));
      expect(setItem).not.toHaveBeenCalled(); // pending write was cancelled
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
