import { useCallback } from 'react';
import type { Stroke } from '../types';

const STORAGE_KEY = 'stylus.ink.v1';

/** Versioned payload so we can migrate the schema later without crashing. */
interface PersistedDrawing {
  version: 1;
  strokes: Stroke[];
  savedAt: number;
}

function isStroke(value: unknown): value is Stroke {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.id !== 'string') return false;
  // Placed-text stroke.
  if (s.type === 'text') {
    return (
      typeof s.x === 'number' &&
      typeof s.y === 'number' &&
      typeof s.content === 'string' &&
      typeof s.styles === 'object' &&
      s.styles !== null
    );
  }
  // Freehand ink stroke (type 'ink' or absent for back-compat).
  return (
    typeof s.color === 'string' &&
    typeof s.size === 'number' &&
    Array.isArray(s.points)
  );
}

/**
 * Auto-save / restore of the stroke list to localStorage.
 *
 * Persistence is plain JSON — strokes are already serializable. We validate
 * shape on load so a corrupt or stale payload degrades to "empty canvas"
 * rather than throwing during render.
 */
export function useLocalStorage() {
  const save = useCallback((strokes: Stroke[]) => {
    try {
      const payload: PersistedDrawing = {
        version: 1,
        strokes,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      // Quota exceeded or storage disabled (private mode). Non-fatal.
      console.warn('[stylus] auto-save failed', err);
    }
  }, []);

  const load = useCallback((): Stroke[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { save, load, clear };
}
