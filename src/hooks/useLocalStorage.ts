import { useCallback, useEffect, useRef } from 'react';
import type { InkPoint, Stroke } from '../types';

const DEFAULT_STORAGE_KEY = 'stylus.ink.v1';

/** Coalesce bursts of saves (one per stroke) into a single write. */
const SAVE_DEBOUNCE_MS = 400;

/** Versioned payload so we can migrate the schema later without crashing. */
interface PersistedDrawing {
  version: 1;
  strokes: Stroke[];
  savedAt: number;
}

function isPoint(value: unknown): value is InkPoint {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    typeof p.pressure === 'number' &&
    typeof p.t === 'number'
  );
}

function isStroke(value: unknown): value is Stroke {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.color === 'string' &&
    typeof s.size === 'number' &&
    Array.isArray(s.points) &&
    s.points.every(isPoint)
  );
}

function writeNow(key: string, strokes: Stroke[]): void {
  try {
    const payload: PersistedDrawing = {
      version: 1,
      strokes,
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    // Quota exceeded or storage disabled (private mode). Non-fatal.
    console.warn('[stylus] auto-save failed', err);
  }
}

/**
 * Auto-save / restore of the stroke list to localStorage.
 *
 * Persistence is plain JSON — strokes are already serializable. We validate
 * shape on load so a corrupt or stale payload degrades to "empty canvas"
 * rather than throwing during render.
 *
 * `save` is debounced so a fast scribble (many strokes) doesn't trigger a full
 * `JSON.stringify` of the whole drawing on every commit. The latest pending
 * write is flushed on `pagehide` and on unmount so nothing is lost when the tab
 * closes inside the debounce window.
 */
export function useLocalStorage(storageKey: string = DEFAULT_STORAGE_KEY) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Stroke[] | null>(null);
  // Mirror the key so the stable callbacks always write to the latest one.
  const keyRef = useRef(storageKey);
  keyRef.current = storageKey;

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current === null) return;
    const strokes = pending.current;
    pending.current = null;
    writeNow(keyRef.current, strokes);
  }, []);

  const save = useCallback(
    (strokes: Stroke[]) => {
      pending.current = strokes;
      if (timer.current !== null) return; // a flush is already scheduled
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const load = useCallback((): Stroke[] => {
    try {
      const raw = localStorage.getItem(keyRef.current);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        (parsed as PersistedDrawing).version !== 1
      ) {
        return [];
      }
      const strokes = (parsed as PersistedDrawing).strokes;
      if (!Array.isArray(strokes)) return [];
      return strokes.filter(isStroke);
    } catch (err) {
      console.warn('[stylus] restore failed', err);
      return [];
    }
  }, []);

  const clear = useCallback(() => {
    pending.current = null;
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      localStorage.removeItem(keyRef.current);
    } catch {
      // ignore
    }
  }, []);

  // Flush any pending write when the tab is hidden/closed or we unmount.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  return { save, flush, load, clear };
}
