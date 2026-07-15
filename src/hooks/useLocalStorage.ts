import { useCallback, useEffect, useRef } from 'react';
import type { InkPoint, Shape, ShapeType, Stroke } from '../types';
import { SHAPE_TYPES } from '../types';
import { warnStorageWriteFailed } from '../lib/storageWriteWarning';

const DEFAULT_STORAGE_KEY = 'stylus.ink.v1';

/** Coalesce bursts of saves (one per stroke) into a single write. */
const SAVE_DEBOUNCE_MS = 400;

/** What a mounted page/document actually persists: ink strokes plus drawn
 *  shapes (item #6) — kept as one payload, one debounce, one write, since
 *  they share a page's storage key and undo history (see useDrawing.ts and
 *  the Shape type doc comment for why they're separate ARRAYS rather than a
 *  tagged union sharing one array). */
export interface DrawingContent {
  strokes: Stroke[];
  shapes: Shape[];
}

/** Versioned payload so we can migrate the schema later without crashing.
 *  v1 → v2: added `shapes`. A v1 payload on disk (written before shapes
 *  existed) has no `shapes` field at all — loadContent treats that as
 *  `shapes: []`, not a validation failure, so nobody's existing notes stop
 *  loading the day this shipped. */
interface PersistedDrawingV1 {
  version: 1;
  strokes: Stroke[];
  savedAt: number;
}

interface PersistedDrawingV2 {
  version: 2;
  strokes: Stroke[];
  shapes: Shape[];
  savedAt: number;
}

type PersistedDrawing = PersistedDrawingV1 | PersistedDrawingV2;

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

function isShape(value: unknown): value is Shape {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.type === 'string' &&
    (SHAPE_TYPES as readonly string[]).includes(s.type) &&
    typeof s.color === 'string' &&
    typeof s.size === 'number' &&
    typeof s.x1 === 'number' &&
    typeof s.y1 === 'number' &&
    typeof s.x2 === 'number' &&
    typeof s.y2 === 'number'
  );
}

/**
 * Repair gaps in a validated stroke. `isPoint` requires only the original
 * point fields — `width`/`opacity` were added later WITHIN version 1, so
 * older payloads (and any future writer that drops them) validate fine and
 * then hand the renderer undefined widths → NaN geometry, invisible ink, no
 * error. Contract: validation rejects garbage; normalization repairs gaps.
 * Next time the stroke shape changes, bump to version 3 with a real
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

/** Shapes have no gap-filling to do (every field has always been required
 *  since shapes shipped, unlike strokes' width/opacity which arrived after
 *  the type did) — normalization is only the type-narrowing `isShape` does. */
function normalizeShape(shape: Shape): Shape {
  return { ...shape, type: shape.type as ShapeType };
}

/**
 * `onSaved` (ADR 002 sync boundary) fires ONLY after the local
 * `localStorage.setItem` call above it has already succeeded — never
 * instead of it, never before it. This is what makes sync a strictly
 * additive second step: local persistence is unconditional and unchanged,
 * and a sync push is scheduled only once there is confirmed-durable local
 * data to push. If the local write throws, `onSaved` is never called and
 * no push is attempted — there would be nothing correct to push anyway.
 */
function writeNow(
  key: string,
  content: DrawingContent,
  onSaved?: (content: DrawingContent, savedAt: number) => void,
): void {
  try {
    const savedAt = Date.now();
    const payload: PersistedDrawingV2 = {
      version: 2,
      strokes: content.strokes,
      shapes: content.shapes,
      savedAt,
    };
    localStorage.setItem(key, JSON.stringify(payload));
    onSaved?.(content, savedAt);
  } catch (err) {
    // Quota exceeded or storage disabled (private mode). Non-fatal to the
    // running session, but silently non-fatal is exactly the problem this
    // warns about — the user's new strokes since the last successful save
    // are NOT persisted, and without this they'd have no way to know.
    console.warn('[stylus] auto-save failed', err);
    warnStorageWriteFailed();
  }
}

/**
 * Auto-save / restore of a page's ink + shapes to localStorage.
 *
 * Persistence is plain JSON — strokes and shapes are already serializable.
 * We validate shape on load so a corrupt or stale payload degrades to an
 * empty page rather than throwing during render.
 *
 * `save` is debounced so a fast scribble (many strokes) doesn't trigger a full
 * `JSON.stringify` of the whole drawing on every commit. The latest pending
 * write is flushed on `pagehide`, on `visibilitychange → hidden` (mobile: the
 * OS can kill a backgrounded tab without ever firing pagehide — `hidden` is
 * the last reliable moment to save), and on unmount so nothing is lost inside
 * the debounce window.
 */
/**
 * Pure one-shot load for an arbitrary key — used by page thumbnails and the
 * multi-page export loader, which read pages that are NOT the mounted
 * document. Same validation as the hook's `load`. Reads BOTH v1 (strokes
 * only) and v2 (strokes + shapes) payloads — a v1 payload's absent `shapes`
 * key resolves to `[]`, not a load failure.
 */
export function loadContent(key: string): DrawingContent {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { strokes: [], shapes: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return { strokes: [], shapes: [] };
    }
    const version = (parsed as PersistedDrawing).version;
    if (version !== 1 && version !== 2) return { strokes: [], shapes: [] };

    const rawStrokes = (parsed as PersistedDrawing).strokes;
    const strokes = Array.isArray(rawStrokes)
      ? rawStrokes.filter(isStroke).map(normalizeStroke)
      : [];

    const rawShapes = version === 2 ? (parsed as PersistedDrawingV2).shapes : undefined;
    const shapes = Array.isArray(rawShapes) ? rawShapes.filter(isShape).map(normalizeShape) : [];

    return { strokes, shapes };
  } catch (err) {
    console.warn('[stylus] restore failed', err);
    return { strokes: [], shapes: [] };
  }
}

/** @deprecated strokes-only accessor kept for the handful of read sites
 *  (page thumbnails, export) that only need ink, not shapes — use
 *  `loadContent` for anything that also needs to render shapes. */
export function loadStrokes(key: string): Stroke[] {
  return loadContent(key).strokes;
}

export function useLocalStorage(
  storageKey: string = DEFAULT_STORAGE_KEY,
  /** Optional sync hook-up (ADR 002). See writeNow's doc comment for the
   *  ordering guarantee — this is never a substitute for the local write,
   *  only ever a step after it succeeds. */
  onSaved?: (content: DrawingContent, savedAt: number) => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DrawingContent | null>(null);
  // Mirror of the key for the stable callbacks. INVARIANT: the key never
  // changes within a mounted instance — Workspace remounts per page/doc, so
  // each hook instance is born and dies with one key. If that ever stops
  // holding, a key change mid-debounce would flush one page's pending strokes
  // onto another page's key; the fix then is flush-on-key-change, not this ref.
  const keyRef = useRef(storageKey);
  keyRef.current = storageKey;
  // Mirrored the same way as keyRef — onSaved is read inside a stable
  // useCallback (flush), so a fresh closure each render must be captured via
  // a ref rather than added to flush's own dependency array (which would
  // otherwise force callers to memoize onSaved themselves or thrash the
  // debounce timer on every render).
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current === null) return;
    const content = pending.current;
    pending.current = null;
    writeNow(keyRef.current, content, onSavedRef.current);
  }, []);

  const save = useCallback(
    (content: DrawingContent) => {
      pending.current = content;
      if (timer.current !== null) return; // a flush is already scheduled
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const load = useCallback((): DrawingContent => loadContent(keyRef.current), []);

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
