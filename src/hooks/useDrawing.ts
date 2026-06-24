import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { InkPoint, PaperStyle, Stroke, Tool } from '../types';
import { useHistory } from './useHistory';
import { useLocalStorage } from './useLocalStorage';
import { drawStroke, renderAll } from '../lib/render';
import { eraserRadius, hitsStroke } from '../lib/geometry';

interface UseDrawingOptions {
  tool: Tool;
  color: string;
  size: number;
  paper: PaperStyle;
}

export interface UseDrawingResult {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  strokes: Stroke[];
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

function createId(): string {
  // crypto.randomUUID is available in all modern browsers (HTTPS / localhost).
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
  paper,
}: UseDrawingOptions): UseDrawingResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useHistory<Stroke[]>([]);
  const { save, load } = useLocalStorage();

  // Latest committed strokes, mirrored in a ref for use inside event handlers
  // and rAF callbacks without re-binding them.
  const strokesRef = useRef<Stroke[]>(history.present);
  strokesRef.current = history.present;

  // In-progress stroke and bookkeeping for the active pointer gesture.
  const liveStrokeRef = useRef<Stroke | null>(null);
  const activePointerId = useRef<number | null>(null);
  const strokeStartTime = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const needsFullRepaint = useRef<boolean>(false);

  // Toolbar settings, mirrored so handlers read fresh values.
  const settingsRef = useRef<UseDrawingOptions>({ tool, color, size, paper });
  settingsRef.current = { tool, color, size, paper };

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
    renderAll(ctx, strokesRef.current, clientWidth, clientHeight, {
      paper: settingsRef.current.paper,
    });
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
      renderAll(ctx, base, canvas.clientWidth, canvas.clientHeight, {
        paper: settingsRef.current.paper,
      });
      // Draw the in-progress pen stroke on top of the committed layer.
      if (liveStrokeRef.current) drawStroke(ctx, liveStrokeRef.current);
    });
  }, []);

  // Repaint when the paper style changes so the new guide shows immediately.
  useEffect(() => {
    needsFullRepaint.current = true;
    scheduleRender();
  }, [paper, scheduleRender]);

  /* --------------------------- pointer helpers ---------------------------- */

  const getPoint = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): InkPoint => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const x = e.clientX - (rect?.left ?? 0);
      const y = e.clientY - (rect?.top ?? 0);
      // Mouse reports pressure 0 while down; normalize that to a mid value so
      // mouse strokes have a consistent width. Pen/touch report real 0..1.
      const rawPressure = e.pressure;
      const pressure =
        e.pointerType === 'mouse' || rawPressure === 0 ? 0.5 : rawPressure;
      return {
        x,
        y,
        pressure,
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

      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerId.current = e.pointerId;
      strokeStartTime.current = performance.now();

      const { tool: activeTool, color: activeColor, size: activeSize } =
        settingsRef.current;
      const point = getPoint(e);

      if (activeTool === 'eraser') {
        erasedDuringDrag.current = false;
        // Seed the working copy from the current committed strokes.
        eraseWorkingRef.current = strokesRef.current;
        eraseAt(point.x, point.y, eraserRadius(activeSize));
        return;
      }

      liveStrokeRef.current = {
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
        const rawPressure = ev.pressure;
        const pressure =
          ev.pointerType === 'mouse' || rawPressure === 0 ? 0.5 : rawPressure;
        live.points.push({
          x,
          y,
          pressure,
          t: performance.now() - strokeStartTime.current,
        });
      }
      scheduleRender();
    },
    [eraseAt, scheduleRender],
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
    [history, scheduleRender],
  );

  /* -------------------------- toolbar operations -------------------------- */

  const undo = useCallback(() => {
    history.undo();
  }, [history]);

  const redo = useCallback(() => {
    history.redo();
  }, [history]);

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
