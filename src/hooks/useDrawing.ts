import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { InkPoint, PaperStyle, Stroke, Tool } from '../types';
import { useHistory } from './useHistory';
import { useLocalStorage } from './useLocalStorage';
import { drawStroke, drawLasso, drawSelectionRect, renderAll } from '../lib/render';
import type { Bounds } from '../lib/geometry';
import {
  applyMoveOffset,
  eraserRadius,
  hitsSelectionBounds,
  hitsStroke,
  inkBounds,
  shiftBounds,
  strokeInLasso,
} from '../lib/geometry';

interface UseDrawingOptions {
  tool: Tool;
  color: string;
  size: number;
  paper: PaperStyle;
  /** localStorage key for this document's strokes. */
  storageKey?: string;
}

/** Selection phase for the lasso tool. */
export type SelectPhase = 'idle' | 'lasso' | 'moving';

export interface SelectionState {
  phase: SelectPhase;
  selectedIds: ReadonlySet<string>;
  /** Bounds of selected strokes with any in-flight move offset applied. */
  bounds: Bounds | null;
  clearSelection: () => void;
  deleteSelected: () => void;
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
  selection: SelectionState;
}

/**
 * Palm rejection: once a pen is active, ignore touch input for a short window
 * after the pen lifts so a resting palm can't draw stray strokes.
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
 *    mouse / touch / pen).
 *  - Live-render the in-progress stroke each rAF tick for low latency.
 *  - Commit finished strokes into undo/redo history and trigger auto-save.
 *  - Erase strokes on contact when the eraser tool is active.
 *  - Lasso-select and move strokes when the select tool is active.
 */
export function useDrawing({
  tool,
  color,
  size,
  paper,
  storageKey,
}: UseDrawingOptions): UseDrawingResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useHistory<Stroke[]>([]);
  const { save, load } = useLocalStorage(storageKey);

  // Latest committed strokes — mirrored in a ref for event handlers and rAF
  // callbacks so they always read the current value without re-binding.
  const strokesRef = useRef<Stroke[]>(history.present);
  strokesRef.current = history.present;

  // In-progress stroke + active-gesture bookkeeping.
  const liveStrokeRef = useRef<Stroke | null>(null);
  const activePointerId = useRef<number | null>(null);
  const strokeStartTime = useRef<number>(0);
  const rafId = useRef<number | null>(null);

  // Toolbar settings mirrored so handlers always read fresh values.
  const settingsRef = useRef<UseDrawingOptions>({ tool, color, size, paper });
  settingsRef.current = { tool, color, size, paper };

  const [isEmpty, setIsEmpty] = useState(true);

  // Erasing works on a private working copy during the drag so it never
  // touches undo history mid-gesture.
  const eraseWorkingRef = useRef<Stroke[] | null>(null);
  const erasedDuringDrag = useRef<boolean>(false);

  // ─── Selection state ────────────────────────────────────────────────────────
  // `phase` uses both a ref (for the rAF render loop) and useState (so the
  // public SelectionState reflects current phase without stale reads).
  const selectionPhaseRef = useRef<SelectPhase>('idle');
  const [selectionPhase, setSelectionPhase] = useState<SelectPhase>('idle');

  const lassoRef = useRef<{ x: number; y: number }[]>([]);

  // selectedIds: ref is authoritative (read in rAF + event handlers); state
  // is the React-visible copy kept in sync on every mutation.
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const moveOriginRef = useRef<{ x: number; y: number } | null>(null);
  const moveOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  /** Bounds of selected strokes with the current move offset applied. */
  const selectionBounds = useMemo((): Bounds | null => {
    if (selectedIds.size === 0) return null;
    const selected = strokesRef.current.filter((s) => selectedIds.has(s.id));
    const b = inkBounds(selected);
    if (!b) return null;
    const { dx, dy } = moveOffsetRef.current;
    return dx === 0 && dy === 0 ? b : shiftBounds(b, dx, dy);
    // strokesRef.current changes identity when history.present changes, but
    // useMemo won't see that — we re-derive inside scheduleRender (the single
    // authoritative paint path) and also on selectedIds change which covers
    // all commit points. The memo here is for the public `selection.bounds`
    // return value consumed by external components.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, history.present]);

  // ─── Canvas sizing ──────────────────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.round(clientWidth * dpr);
    canvas.height = Math.round(clientHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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

  // ─── Restore from storage ───────────────────────────────────────────────────

  useEffect(() => {
    const restored = load();
    if (restored.length > 0) {
      history.reset(restored);
      strokesRef.current = restored;
      setIsEmpty(false);
      scheduleRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render loop ────────────────────────────────────────────────────────────

  const scheduleRender = useCallback(() => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // During an erase drag render the working copy; otherwise committed.
      const base = eraseWorkingRef.current ?? strokesRef.current;

      // During a move, shift selected strokes visually without mutating history.
      const { dx, dy } = moveOffsetRef.current;
      const displayStrokes =
        selectionPhaseRef.current === 'moving' && (dx !== 0 || dy !== 0)
          ? applyMoveOffset(base, selectedIdsRef.current, dx, dy)
          : base;

      renderAll(ctx, displayStrokes, canvas.clientWidth, canvas.clientHeight, {
        paper: settingsRef.current.paper,
      });

      // Live pen stroke on top.
      if (liveStrokeRef.current) drawStroke(ctx, liveStrokeRef.current);

      // Selection overlays.
      if (selectionPhaseRef.current === 'lasso') {
        drawLasso(ctx, lassoRef.current);
      }
      if (selectedIdsRef.current.size > 0) {
        // Recompute bounds here using the same offset as displayStrokes.
        const selected = displayStrokes.filter((s) =>
          selectedIdsRef.current.has(s.id),
        );
        const b = inkBounds(selected);
        if (b) drawSelectionRect(ctx, b);
      }
    });
  }, []);

  // Repaint when the paper style changes.
  useEffect(() => {
    scheduleRender();
  }, [paper, scheduleRender]);

  // Clear selection when switching away from the select tool.
  useEffect(() => {
    if (tool !== 'select' && selectedIdsRef.current.size > 0) {
      selectedIdsRef.current = new Set();
      setSelectedIds(new Set());
      lassoRef.current = [];
      selectionPhaseRef.current = 'idle';
      setSelectionPhase('idle');
      scheduleRender();
    }
  }, [tool, scheduleRender]);

  // ─── Pointer helpers ────────────────────────────────────────────────────────

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

  const getCanvasPoint = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return {
        x: e.clientX - (rect?.left ?? 0),
        y: e.clientY - (rect?.top ?? 0),
      };
    },
    [],
  );

  const getPoint = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): InkPoint => {
      const { x, y } = getCanvasPoint(e);
      return buildPoint(x, y, e.pointerType, e.pressure, e.tiltX ?? 0, e.tiltY ?? 0);
    },
    [buildPoint, getCanvasPoint],
  );

  // ─── Erasing ────────────────────────────────────────────────────────────────

  const eraseAt = useCallback((x: number, y: number, radius: number) => {
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

  // ─── Selection actions ──────────────────────────────────────────────────────

  const clearSelection = useCallback(() => {
    selectedIdsRef.current = new Set();
    setSelectedIds(new Set());
    lassoRef.current = [];
    selectionPhaseRef.current = 'idle';
    setSelectionPhase('idle');
    moveOffsetRef.current = { dx: 0, dy: 0 };
    moveOriginRef.current = null;
    scheduleRender();
  }, [scheduleRender]);

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const next = strokesRef.current.filter((s) => !ids.has(s.id));
    selectedIdsRef.current = new Set();
    setSelectedIds(new Set());
    selectionPhaseRef.current = 'idle';
    setSelectionPhase('idle');
    history.set(next);
    strokesRef.current = next;
    scheduleRender();
  }, [history, scheduleRender]);

  // ─── Pointer event handlers ─────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (activePointerId.current !== null) return;
      if (isPalmRejected(e.pointerType)) return;

      if (e.pointerType === 'pen') activePenPointerType = 'pen';

      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerId.current = e.pointerId;
      strokeStartTime.current = performance.now();

      const { tool: activeTool, color: activeColor, size: activeSize } =
        settingsRef.current;

      // Non-drawing tools release the pointer immediately.
      if (activeTool !== 'pen' && activeTool !== 'eraser' && activeTool !== 'select') {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        activePointerId.current = null;
        return;
      }

      const { x, y } = getCanvasPoint(e);

      // ── select ──
      if (activeTool === 'select') {
        // Compute current bounds from committed strokes (no in-flight offset yet).
        const ids = selectedIdsRef.current;
        const currentBounds = ids.size > 0
          ? inkBounds(strokesRef.current.filter((s) => ids.has(s.id)))
          : null;

        if (currentBounds && hitsSelectionBounds(currentBounds, x, y)) {
          // Clicked inside selection → start moving.
          selectionPhaseRef.current = 'moving';
          setSelectionPhase('moving');
          moveOriginRef.current = { x, y };
          moveOffsetRef.current = { dx: 0, dy: 0 };
        } else {
          // Start fresh lasso, clear prior selection.
          selectionPhaseRef.current = 'lasso';
          setSelectionPhase('lasso');
          lassoRef.current = [{ x, y }];
          selectedIdsRef.current = new Set();
          setSelectedIds(new Set());
          scheduleRender();
        }
        return;
      }

      // ── eraser ──
      if (activeTool === 'eraser') {
        erasedDuringDrag.current = false;
        eraseWorkingRef.current = strokesRef.current;
        eraseAt(x, y, eraserRadius(activeSize));
        return;
      }

      // ── pen ──
      const point = getPoint(e);
      liveStrokeRef.current = {
        id: createId(),
        color: activeColor,
        size: activeSize,
        points: [point],
      };
      scheduleRender();
    },
    [eraseAt, getCanvasPoint, getPoint, scheduleRender],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerId.current) return;

      const { tool: activeTool, size: activeSize } = settingsRef.current;

      // Coalesced events give us every OS sample between frames.
      const events =
        typeof e.nativeEvent.getCoalescedEvents === 'function'
          ? e.nativeEvent.getCoalescedEvents()
          : [];
      const samples = events.length > 0 ? events : [e.nativeEvent];

      // Fetch rect once outside the loop for all tools.
      const rect = canvasRef.current?.getBoundingClientRect();

      // ── select ──
      if (activeTool === 'select') {
        const phase = selectionPhaseRef.current;
        if (phase === 'lasso') {
          for (const ev of samples) {
            lassoRef.current.push({
              x: ev.clientX - (rect?.left ?? 0),
              y: ev.clientY - (rect?.top ?? 0),
            });
          }
          scheduleRender();
        } else if (phase === 'moving' && moveOriginRef.current) {
          const last = samples[samples.length - 1];
          moveOffsetRef.current = {
            dx: last.clientX - (rect?.left ?? 0) - moveOriginRef.current.x,
            dy: last.clientY - (rect?.top ?? 0) - moveOriginRef.current.y,
          };
          scheduleRender();
        }
        return;
      }

      // ── eraser ──
      if (activeTool === 'eraser') {
        for (const ev of samples) {
          eraseAt(
            ev.clientX - (rect?.left ?? 0),
            ev.clientY - (rect?.top ?? 0),
            eraserRadius(activeSize),
          );
        }
        return;
      }

      // ── pen ──
      const live = liveStrokeRef.current;
      if (!live) return;
      for (const ev of samples) {
        live.points.push(
          buildPoint(
            ev.clientX - (rect?.left ?? 0),
            ev.clientY - (rect?.top ?? 0),
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
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      activePointerId.current = null;

      if (e.pointerType === 'pen' && activePenPointerType === 'pen') {
        lastPenLiftTime = Date.now();
        activePenPointerType = null;
      }

      const { tool: activeTool } = settingsRef.current;

      // ── select ──
      if (activeTool === 'select') {
        const phase = selectionPhaseRef.current;

        if (phase === 'lasso') {
          const lasso = lassoRef.current;
          // Always clear prior selection when a lasso gesture ends, regardless
          // of how many points were drawn or how many strokes matched.
          const matched = new Set<string>();
          if (lasso.length >= 3) {
            for (const stroke of strokesRef.current) {
              if (strokeInLasso(stroke, lasso)) matched.add(stroke.id);
            }
          }
          selectedIdsRef.current = matched;
          setSelectedIds(matched);
          lassoRef.current = [];
          selectionPhaseRef.current = 'idle';
          setSelectionPhase('idle');
          scheduleRender();

        } else if (phase === 'moving') {
          const { dx, dy } = moveOffsetRef.current;
          if (dx !== 0 || dy !== 0) {
            // Commit the offset to history as one undoable step.
            const next = applyMoveOffset(
              strokesRef.current,
              selectedIdsRef.current,
              dx,
              dy,
            );
            history.set(next);
            strokesRef.current = next;
          }
          moveOffsetRef.current = { dx: 0, dy: 0 };
          moveOriginRef.current = null;
          selectionPhaseRef.current = 'idle';
          setSelectionPhase('idle');
          scheduleRender();
        }
        return;
      }

      // ── eraser ──
      if (activeTool === 'eraser') {
        const working = eraseWorkingRef.current;
        eraseWorkingRef.current = null;
        if (erasedDuringDrag.current && working) {
          erasedDuringDrag.current = false;
          history.set(working);
          strokesRef.current = working;
        } else {
          scheduleRender();
        }
        return;
      }

      // ── pen ──
      const live = liveStrokeRef.current;
      liveStrokeRef.current = null;
      if (!live || live.points.length === 0) return;

      const next = [...strokesRef.current, live];
      history.set(next);
      strokesRef.current = next;
    },
    [history, scheduleRender],
  );

  // ─── Toolbar operations ─────────────────────────────────────────────────────

  const undo = useCallback(() => { history.undo(); }, [history]);
  const redo = useCallback(() => { history.redo(); }, [history]);

  const clear = useCallback(() => {
    selectedIdsRef.current = new Set();
    setSelectedIds(new Set());
    selectionPhaseRef.current = 'idle';
    setSelectionPhase('idle');
    lassoRef.current = [];
    moveOffsetRef.current = { dx: 0, dy: 0 };
    moveOriginRef.current = null;
    history.set([]);
    strokesRef.current = [];
  }, [history]);

  // Whenever committed strokes change (draw/undo/redo/erase/move/delete/clear),
  // repaint, resync empty flag, and persist to localStorage.
  const hydratedRef = useRef(false);
  useEffect(() => {
    strokesRef.current = history.present;
    setIsEmpty(history.present.length === 0);
    scheduleRender();
    if (hydratedRef.current) {
      save(history.present);
    } else {
      hydratedRef.current = true;
    }
  }, [history.present, save, scheduleRender]);

  // Cancel any pending rAF on unmount.
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
    selection: {
      phase: selectionPhase,
      selectedIds,
      bounds: selectionBounds,
      clearSelection,
      deleteSelected,
    },
  };
}
