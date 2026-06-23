import { useCallback, useRef, useState } from 'react';

/**
 * Stroke-based undo/redo.
 *
 * State is an immutable array of `T` (here: strokes). Every mutation pushes a
 * new snapshot onto a past stack and clears the redo (future) stack — the
 * standard linear-history model. Snapshots are cheap because strokes are never
 * mutated in place; we only ever replace the array reference.
 *
 * `reset` is used on localStorage restore so a restored drawing starts a fresh
 * history (you can't undo past the restore point).
 */
export interface History<T> {
  /** Current snapshot. */
  present: T;
  /** Replace the present and push the previous value onto the undo stack. */
  set: (next: T | ((prev: T) => T)) => void;
  /** Replace the present without recording history (e.g. live preview). */
  replaceSilently: (next: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Clear history and seed a new present. */
  reset: (value: T) => void;
}

export function useHistory<T>(initial: T): History<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  // Mirror `present` in a ref so callbacks can read the latest value without
  // being re-created on every change (keeps event handlers stable).
  const presentRef = useRef<T>(present);
  presentRef.current = present;

  const set = useCallback((next: T | ((prev: T) => T)) => {
    const prev = presentRef.current;
    const resolved =
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (resolved === prev) return;
    setPast((p) => [...p, prev]);
    setPresent(resolved);
    presentRef.current = resolved;
    setFuture([]);
  }, []);

  const replaceSilently = useCallback((next: T | ((prev: T) => T)) => {
    const prev = presentRef.current;
    const resolved =
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    setPresent(resolved);
    presentRef.current = resolved;
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      const current = presentRef.current;
      setFuture((f) => [current, ...f]);
      setPresent(previous);
      presentRef.current = previous;
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      const current = presentRef.current;
      setPast((p) => [...p, current]);
      setPresent(next);
      presentRef.current = next;
      return f.slice(1);
    });
  }, []);

  const reset = useCallback((value: T) => {
    setPast([]);
    setFuture([]);
    setPresent(value);
    presentRef.current = value;
  }, []);

  return {
    present,
    set,
    replaceSilently,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    reset,
  };
}
