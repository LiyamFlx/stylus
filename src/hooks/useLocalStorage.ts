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

/**
 * Repair gaps in a validated stroke. `isPoint` requires only the original
 * point fields — `width`/`opacity` were added later WITHIN version 1, so
 * older payloads (and any future writer that drops them) validate fine and
 * then hand the renderer undefined widths → NaN geometry, invisible ink, no
 * error. Contract: validation rejects garbage; normalization repairs gaps.
 * Next time the stroke shape changes, bump to version 2 with a real
 * migration instead of extending this.
 */
function normalizeStroke(stroke: Stroke): Stroke {
  if (stroke.points.every((p) => typeof p.width === 'number' && typeof p.opacity === 'number')) {
    return stroke;
  }
  return {
    ...stroke,
    points: stroke.points.map((p) => ({
      ...p,
      width: typeof p.width === 'number' ? p.width : stroke.size,
      opacity: typeof p.opacity === 'number' ? p.opacity : 1,
    })),
  };
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
 * write is flushed on `pagehide`, on `visibilitychange → hidden` (mobile: the
 * OS can kill a backgrounded tab without ever firing pagehide — `hidden` is
 * the last reliable moment to save), and on unmount so nothing is lost inside
 * the debounce window.
 */
/**
 * Pure one-shot stroke load for an arbitrary key — used by page thumbnails
 * and the multi-page export loader, which read pages that are NOT the mounted
 * document. Same validation as the hook's `load`.
 */
export function loadStrokes(key: string): Stroke[] {
  try {
    const raw = localStorage.getItem(key);
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
    return strokes.filter(isStroke).map(normalizeStroke);
  } catch (err) {
    console.warn('[stylus] restore failed', err);
    return [];
  }
}

export function useLocalStorage(storageKey: string = DEFAULT_STORAGE_KEY) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Stroke[] | null>(null);
  // Mirror of the key for the stable callbacks. INVARIANT: the key never
  // changes within a mounted instance — Workspace remounts per page/doc, so
  // each hook instance is born and dies with one key. If that ever stops
  // holding, a key change mid-debounce would flush one page's pending strokes
  // onto another page's key; the fix then is flush-on-key-change, not this ref.
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

  const load = useCallback((): Stroke[] => loadStrokes(keyRef.current), []);

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
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flush]);

  return { save, flush, load, clear };
}