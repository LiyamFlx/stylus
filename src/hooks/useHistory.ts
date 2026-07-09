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
 *
 * Implementation invariant: the three refs (past/present/future) are the
 * SYNCHRONOUS source of truth, eagerly updated by every mutation BEFORE the
 * matching setStates fire; the useState copies exist to drive re-renders and
 * canUndo/canRedo. This buys two things:
 *  1. All setState calls receive plain values at the top level — no setState
 *     inside another updater. Updaters must be pure; the previous nesting
 *     duplicated stack entries whenever React re-invoked an updater
 *     (StrictMode dev, and legal under concurrent replay in prod).
 *  2. Same-tick sequences are correct: set() → snapshot() sees the new past,
 *     two undo() calls in one tick undo two distinct steps.
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

/**
 * Undo depth cap. Each history entry is one array of shared stroke references
 * (structural sharing keeps entries cheap), but an unbounded stack accumulates
 * O(n²) references over a long session — and the page-flip cache pins up to 32
 * full histories at once. Oldest entries fall off first.
 */
const MAX_PAST = 200;

export function useHistory<T>(initial: T, seed?: HistorySnapshot<T>): History<T> {
  const [past, setPast] = useState<T[]>(() => seed?.past ?? []);
  const [present, setPresent] = useState<T>(() => (seed ? seed.present : initial));
  const [future, setFuture] = useState<T[]>(() => seed?.future ?? []);

  // Synchronous source of truth (see header). Render-time assignment is the
  // consistency backstop; every mutation below also syncs them eagerly.
  const presentRef = useRef<T>(present);
  presentRef.current = present;
  const pastRef = useRef<T[]>(past);
  pastRef.current = past;
  const futureRef = useRef<T[]>(future);
  futureRef.current = future;

  /** Eagerly commit new stacks to the refs, then mirror into state. */
  const commit = useCallback((nextPast: T[], nextPresent: T, nextFuture: T[]) => {
    pastRef.current = nextPast;
    presentRef.current = nextPresent;
    futureRef.current = nextFuture;
    setPast(nextPast);
    setPresent(nextPresent);
    setFuture(nextFuture);
  }, []);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = presentRef.current;
      const resolved =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      if (resolved === prev) return;
      const grown = [...pastRef.current, prev];
      const nextPast = grown.length > MAX_PAST ? grown.slice(grown.length - MAX_PAST) : grown;
      commit(nextPast, resolved, []);
    },
    [commit],
  );

  const replaceSilently = useCallback((next: T | ((prev: T) => T)) => {
    const prev = presentRef.current;
    const resolved =
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    presentRef.current = resolved;
    setPresent(resolved);
  }, []);

  const undo = useCallback(() => {
    const p = pastRef.current;
    if (p.length === 0) return;
    const previous = p[p.length - 1];
    commit(p.slice(0, -1), previous, [presentRef.current, ...futureRef.current]);
  }, [commit]);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (f.length === 0) return;
    const next = f[0];
    commit([...pastRef.current, presentRef.current], next, f.slice(1));
  }, [commit]);

  const reset = useCallback(
    (value: T) => {
      commit([], value, []);
    },
    [commit],
  );

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