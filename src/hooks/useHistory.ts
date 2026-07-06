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
/** Serializable capture of a full history — used by the notebook page-flip
 *  cache so returning to a page restores its undo/redo stacks. */
export interface HistorySnapshot<T> {
  past: T[];
  present: T;
  future: T[];
}

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
  /** Capture the full history (for the notebook page-flip cache). */
  snapshot: () => HistorySnapshot<T>;
}

export function useHistory<T>(initial: T, seed?: HistorySnapshot<T>): History<T> {
  const [past, setPast] = useState<T[]>(() => seed?.past ?? []);
  const [present, setPresent] = useState<T>(() => (seed ? seed.present : initial));
  const [future, setFuture] = useState<T[]>(() => seed?.future ?? []);

  // Mirror `present` in a ref so callbacks can read the latest value without
  // being re-created on every change (keeps event handlers stable).
  const presentRef = useRef<T>(present);
  presentRef.current = present;
  // Stack mirrors for snapshot() — same render-mirror pattern as presentRef.
  const pastRef = useRef<T[]>(past);
  pastRef.current = past;
  const futureRef = useRef<T[]>(future);
  futureRef.current = future;

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

  const snapshot = useCallback(
    (): HistorySnapshot<T> => ({
      past: pastRef.current,
      present: presentRef.current,
      future: futureRef.current,
    }),
    [],
  );

  return {
    present,
    set,
    replaceSilently,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    reset,
    snapshot,
  };
}
