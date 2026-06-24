import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { InkPoint, InkStroke, Stroke, Tool } from '../types';
import { isTextStroke } from '../types';
import type { TextStroke } from '../types/extensions';
import { useHistory } from './useHistory';
import { useLocalStorage } from './useLocalStorage';
import { drawStroke, renderAll } from '../lib/render';

interface UseDrawingOptions {
  tool: Tool;
  color: string;
  size: number;
}

export interface UseDrawingResult {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  strokes: Stroke[];
  /** Commit a finished stroke (e.g. placed text) as one undo step. */
  addStroke: (stroke: Stroke) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
  isEmpty: boolean;
}

/**
 * Palm rejection: once a pen is active, ignore touch input for a short window
 * after the pen lifts so a resting palm can't draw stray strokes. Module scope
 * is fine — there's only ever one canvas / drawing surface.
 */
const PALM_REJECTION_MS = 200;
let lastPenLiftTime = 0;
let activePenPointerType: string | null = null;

function isPalmRejected(pointerType: string): boolean {
  if (pointerType !== 'touch') return false;
  return Date.now() - lastPenLiftTime < PALM_REJECTION_MS;
}

/** Pressure → line width with an ease-in curve. Pens only; others use base. */
function pressureToWidth(pressure: number, baseWidth: number): number {
  const p = Math.max(0.05, Math.min(1, pressure));
  const minWidth = Math.max(1, baseWidth * 0.3);
  const maxWidth = baseWidth * 3;
  return minWidth + (maxWidth - minWidth) * (p * p);
}

/** Tilt → opacity for a pencil-on-its-side feel. 0° opaque, 60°+ → 40%. */
function tiltToOpacity(tiltX: number, tiltY: number): number {
  const magnitude = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
  return 1 - Math.min(magnitude / 60, 1) * 0.6;
}

function createId(): string {
  // crypto.randomUUID is available in all modern browsers (HTTPS / localhost).
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Shortest distance from point P to segment AB, for eraser hit-testing. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Core drawing engine.
 *
 * Responsibilities:
 *  - Own the canvas element sizing (DPR-aware) and full repaints.
 *  - Translate Pointer Events into the stroke model (one code path for
 *    mouse / touch / pen — pressure read from the event when present).
 *  - Live-render the in-progress stroke each rAF tick for low latency.
 *  - Commit finished strokes into undo/redo history and trigger auto-save.
 *  - Erase strokes on contact when the eraser tool is active.
 */
export function useDrawing({
  tool,
  color,
  size,
}: UseDrawingOptions): UseDrawingResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useHistory<Stroke[]>([]);
  const { save, load } = useLocalStorage();

  // Latest committed strokes, mirrored in a ref for use inside event handlers
  // and rAF callbacks without re-binding them.
  const strokesRef = useRef<Stroke[]>(history.present);
  strokesRef.current = history.present;

  // In-progress stroke and bookkeeping for the active pointer gesture.
  const liveStrokeRef = useRef<InkStroke | null>(null);
  const activePointerId = useRef<number | null>(null);
  const strokeStartTime = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const needsFullRepaint = useRef<boolean>(false);

  // Toolbar settings, mirrored so handlers read fresh values.
  const settingsRef = useRef<UseDrawingOptions>({ tool, color, size });
  settingsRef.current = { tool, color, size };

  const [isEmpty, setIsEmpty] = useState(true);

  // Erasing works on a private working copy during the drag so it never
  // touches the undo history mid-gesture. On pointer-up we commit the result
  // as a single history step (so one erase drag = one undo). `null` means no
  // erase drag is active.
  const eraseWorkingRef = useRef<Stroke[] | null>(null);
  const erasedDuringDrag = useRef<boolean>(false);

  /* ----------------------------- canvas sizing ---------------------------- */

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.round(clientWidth * dpr);
    canvas.height = Math.round(clientHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Reset transform then scale so 1 unit === 1 CSS px regardless of DPR.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderAll(ctx, strokesRef.current, clientWidth, clientHeight);
  }, []);

  useLayoutEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  /* ------------------------- restore from storage ------------------------- */

  useEffect(() => {
    const restored = load();
    if (restored.length > 0) {
      history.reset(restored);
      strokesRef.current = restored;
      setIsEmpty(false);
      // Repaint once the ref + canvas are ready.
      needsFullRepaint.current = true;
      scheduleRender();
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ rendering ------------------------------- */

  const scheduleRender = useCallback(() => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      needsFullRepaint.current = false;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // During an erase drag we render from the private working copy so the
      // removed strokes disappear immediately without mutating history. Once
      // the drag commits, eraseWorkingRef is cleared and we fall back to the
      // committed strokes. The full-clear-and-repaint keeps anti-aliasing
      // clean and avoids double-darkening overlapping strokes.
      const base = eraseWorkingRef.current ?? strokesRef.current;
      renderAll(ctx, base, canvas.clientWidth, canvas.clientHeight);
      // Draw the in-progress pen stroke on top of the committed layer.
      if (liveStrokeRef.current) drawStroke(ctx, liveStrokeRef.current);
    });
  }, []);

  /* --------------------------- pointer helpers ---------------------------- */

  const getPoint = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): InkPoint => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const x = e.clientX - (rect?.left ?? 0);
      const y = e.clientY - (rect?.top ?? 0);
      return buildPoint(
        x,
        y,
        e.pointerType,
        e.pressure,
        e.tiltX ?? 0,
        e.tiltY ?? 0,
      );
    },
    [],
  );

  // Build an InkPoint, normalizing pressure and deriving width (pressure) and
  // opacity (tilt). Pens get dynamic width/opacity; mouse/touch get steady
  // width at full opacity so they stay predictable.
  const buildPoint = useCallback(
    (
      x: number,
      y: number,
      pointerType: string,
      rawPressure: number,
      tiltX: number,
      tiltY: number,
    ): InkPoint => {
      const pressure =
        pointerType === 'mouse' || rawPressure === 0 ? 0.5 : rawPressure;
      const baseSize = settingsRef.current.size;
      const width =
        pointerType === 'pen'
          ? pressureToWidth(pressure, baseSize)
          : baseSize * (0.4 + pressure * 1.2);
      const opacity = pointerType === 'pen' ? tiltToOpacity(tiltX, tiltY) : 1;
      return {
        x,
        y,
        pressure,
        width,
        opacity,
        t: performance.now() - strokeStartTime.current,
      };
    },
    [],
  );

  /* ------------------------------- erasing -------------------------------- */

  const eraseAt = useCallback((x: number, y: number, radius: number) => {
    // Operate on the working copy (seeded on pointer-down). History is left
    // untouched until the drag commits.
    const strokes = eraseWorkingRef.current ?? strokesRef.current;
    const survivors: Stroke[] = [];
    let removed = false;
    for (const stroke of strokes) {
      if (hitsStroke(stroke, x, y, radius)) {
        removed = true;
        continue;
      }
      survivors.push(stroke);
    }
    if (removed) {
      eraseWorkingRef.current = survivors;
      erasedDuringDrag.current = true;
      scheduleRender();
    }
  }, [scheduleRender]);

  /* --------------------------- event handlers ----------------------------- */

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      // Only the primary button / first contact starts a stroke.
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (activePointerId.current !== null) return;
      // Reject a resting palm while/just-after a pen is in use.
      if (isPalmRejected(e.pointerType)) return;

      if (e.pointerType === 'pen') activePenPointerType = 'pen';

      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerId.current = e.pointerId;
      strokeStartTime.current = performance.now();

      const { tool: activeTool, color: activeColor, size: activeSize } =
        settingsRef.current;

      // Non-drawing tools (e.g. text) don't capture the pointer here — App
      // handles placement. Release capture and bail.
      if (activeTool !== 'pen' && activeTool !== 'eraser') {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        activePointerId.current = null;
        return;
      }

      const point = getPoint(e);

      if (activeTool === 'eraser') {
        erasedDuringDrag.current = false;
        // Seed the working copy from the current committed strokes.
        eraseWorkingRef.current = strokesRef.current;
        eraseAt(point.x, point.y, eraserRadius(activeSize));
        return;
      }

      liveStrokeRef.current = {
        type: 'ink',
        id: createId(),
        color: activeColor,
        size: activeSize,
        points: [point],
      };
      scheduleRender();
    },
    [eraseAt, getPoint, scheduleRender],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerId.current) return;
      if (isPalmRejected(e.pointerType)) return;

      const { tool: activeTool, size: activeSize } = settingsRef.current;

      // Coalesced events give us every sample the OS captured between frames,
      // which keeps fast strokes smooth instead of jagged.
      const events =
        typeof e.nativeEvent.getCoalescedEvents === 'function'
          ? e.nativeEvent.getCoalescedEvents()
          : [];
      const samples = events.length > 0 ? events : [e.nativeEvent];

      if (activeTool === 'eraser') {
        for (const ev of samples) {
          const rect = canvasRef.current?.getBoundingClientRect();
          const x = ev.clientX - (rect?.left ?? 0);
          const y = ev.clientY - (rect?.top ?? 0);
          eraseAt(x, y, eraserRadius(activeSize));
        }
        return;
      }

      const live = liveStrokeRef.current;
      if (!live) return;
      for (const ev of samples) {
        const rect = canvasRef.current?.getBoundingClientRect();
        const x = ev.clientX - (rect?.left ?? 0);
        const y = ev.clientY - (rect?.top ?? 0);
        live.points.push(
          buildPoint(
            x,
            y,
            ev.pointerType,
            ev.pressure,
            ev.tiltX ?? 0,
            ev.tiltY ?? 0,
          ),
        );
      }
      scheduleRender();
    },
    [buildPoint, eraseAt, scheduleRender],
  );

  const endGesture = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerId.current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be gone (e.g. pointercancel) — ignore.
      }
      activePointerId.current = null;

      // Note when a pen lifts so the palm-rejection window can start.
      if (e.pointerType === 'pen' && activePenPointerType === 'pen') {
        lastPenLiftTime = Date.now();
        activePenPointerType = null;
      }

      const { tool: activeTool } = settingsRef.current;

      if (activeTool === 'eraser') {
        const working = eraseWorkingRef.current;
        eraseWorkingRef.current = null;
        if (erasedDuringDrag.current && working) {
          // Commit a single undo step covering the whole erase drag. The
          // history.present effect handles repaint + persistence.
          erasedDuringDrag.current = false;
          history.set(working);
          strokesRef.current = working;
        } else {
          // Nothing erased (tapped empty space) — repaint to drop any hover
          // artifacts and discard the working copy.
          needsFullRepaint.current = true;
          scheduleRender();
        }
        return;
      }

      const live = liveStrokeRef.current;
      liveStrokeRef.current = null;
      if (!live || live.points.length === 0) return;

      const next = [...strokesRef.current, live];
      // Persistence + repaint are handled centrally by the history.present
      // effect below; we just commit the new snapshot here.
      history.set(next);
      strokesRef.current = next;
    },
    [history],
  );

  /* -------------------------- toolbar operations -------------------------- */

  const undo = useCallback(() => {
    history.undo();
  }, [history]);

  const redo = useCallback(() => {
    history.redo();
  }, [history]);

  const addStroke = useCallback(
    (stroke: Stroke) => {
      const next = [...strokesRef.current, stroke];
      history.set(next);
      strokesRef.current = next;
    },
    [history],
  );

  const clear = useCallback(() => {
    // Repaint + persistence handled by the history.present effect.
    history.set([]);
    strokesRef.current = [];
  }, [history]);

  // Whenever committed strokes change (undo/redo/clear/draw), repaint, resync
  // the empty flag, and persist. Routing all persistence through this single
  // effect means undo/redo are durable across reloads too — not just draws.
  // We skip the very first run so the initial empty state can't clobber a
  // restore that's still settling in.
  const hydratedRef = useRef(false);
  useEffect(() => {
    strokesRef.current = history.present;
    setIsEmpty(history.present.length === 0);
    needsFullRepaint.current = true;
    scheduleRender();
    if (hydratedRef.current) {
      save(history.present);
    } else {
      hydratedRef.current = true;
    }
  }, [history.present, save, scheduleRender]);

  // Cancel any pending rAF on unmount so we never paint into a dead canvas.
  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, []);

  return {
    canvasRef,
    strokes: history.present,
    addStroke,
    onPointerDown,
    onPointerMove,
    onPointerUp: endGesture,
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    clear,
    isEmpty,
  };
}

/* ------------------------------ free helpers ------------------------------ */

/**
 * Hit-test a text stroke against an eraser blob. We approximate the text box:
 * width from the longest line, height from line count × line height. Generous
 * enough that touching the text removes it.
 */
function hitsTextStroke(
  stroke: TextStroke,
  x: number,
  y: number,
  radius: number,
): boolean {
  const lines = stroke.content.split('\n');
  const lineHeight = stroke.styles.fontSize * 1.4;
  // Rough average glyph width ≈ 0.6em for a sans-serif.
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const w = longest * stroke.styles.fontSize * 0.6;
  const h = lines.length * lineHeight;
  return (
    x >= stroke.x - radius &&
    x <= stroke.x + w + radius &&
    y >= stroke.y - radius &&
    y <= stroke.y + h + radius
  );
}

/** Eraser contact radius scales with the selected size, with a usable floor. */
function eraserRadius(size: number): number {
  return Math.max(12, size * 3);
}

/** True if any segment of the stroke comes within `radius` of (x, y). */
function hitsStroke(stroke: Stroke, x: number, y: number, radius: number): boolean {
  // Text strokes hit-test against their bounding box (handled in eraseAt's
  // caller path); here we only deal with ink geometry.
  if (isTextStroke(stroke)) return hitsTextStroke(stroke, x, y, radius);
  const pts = stroke.points;
  const threshold = radius + stroke.size / 2;
  if (pts.length === 1) {
    return Math.hypot(pts[0].x - x, pts[0].y - y) <= threshold;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= threshold) {
      return true;
    }
  }
  return false;
}
