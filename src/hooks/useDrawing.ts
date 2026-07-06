import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RulingDensity, InkPoint, PaperStyle, Stroke, Tool } from '../types';
import { useHistory } from './useHistory';
import type { HistorySnapshot } from './useHistory';
import { useLocalStorage } from './useLocalStorage';
import { drawStroke, drawLasso, drawSelectionRect, renderAll } from '../lib/render';
import { duplicateStrokes, recolorStrokes, reconcileSelection } from '../lib/selectionOps';
import { penProfile, type PenType } from '../lib/penProfiles';
import { smoothPoint } from '../lib/stabilizer';
import { createId } from '../lib/id';
import type { Bounds } from '../lib/geometry';
import {
  applyMoveOffset,
  clampScale,
  eraserRadius,
  hitsSelectionBounds,
  hitsStroke,
  IDENTITY_VIEW,
  inkBounds,
  screenToWorld,
  shiftBounds,
  strokeInLasso,
} from '../lib/geometry';
import type { ViewTransform } from '../lib/geometry';

interface UseDrawingOptions {
  tool: Tool;
  color: string;
  size: number;
  paper: PaperStyle;
  /** Line spacing for the 'notebook' paper. Ignored by other styles. */
  ruling?: RulingDensity;
  /** Active pen type. Defaults to fountain when omitted. */
  penType?: PenType;
  /** When true, damp jitter on the live stroke (low-lag smoothing). */
  stabilizer?: boolean;
  /** localStorage key for this document's strokes. */
  storageKey?: string;
  /**
   * Seed the undo/redo history instead of starting empty (notebook page-flip
   * cache). When provided, the storage load is skipped — the seed IS the
   * page's state, including its undo stacks. Constructor input only; no
   * internal engine logic changes (the sanctioned exception to "don't touch
   * useDrawing for pagination").
   */
  initialHistory?: HistorySnapshot<Stroke[]>;
  /** Fired the moment a pen stroke commits — used for live music feedback. */
  onStrokeEnd?: (stroke: Stroke) => void;
  /** Optional live side-channel for per-sample pen feedback (Learning Mode
   *  audio). Additive: the core stroke pipeline ignores these entirely. */
  onPenStart?: () => void;
  onPenSample?: (point: InkPoint) => void;
  onPenEnd?: () => void;
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
  duplicateSelected: () => void;
  recolorSelected: (color: string) => void;
}

/** Canvas view (zoom + pan) plus the controls to mutate it. */
export interface ViewState {
  scale: number;
  panX: number;
  panY: number;
  /** Zoom by a multiplicative factor, anchored at a screen point (defaults to center). */
  zoomBy: (factor: number, screenX?: number, screenY?: number) => void;
  /** Pan by a screen-pixel delta. */
  panBy: (dxScreen: number, dyScreen: number) => void;
  /** Reset to 100% / origin. */
  reset: () => void;
}

export interface UseDrawingResult {
  /** Bottom canvas (committed strokes + paper). Used by callers for sizing. */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Top canvas (live stroke + lasso + selection); also the interactive surface. */
  overlayRef: React.RefObject<HTMLCanvasElement>;
  strokes: Stroke[];
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  /** Abort the in-flight gesture without committing (pointercancel). */
  onPointerCancel: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  /** Capture the current undo/redo history (notebook page-flip cache). */
  getHistorySnapshot: () => HistorySnapshot<Stroke[]>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
  isEmpty: boolean;
  selection: SelectionState;
  view: ViewState;
}

/**
 * Palm rejection: once a pen is active, ignore touch input for a short window
 * after the pen lifts so a resting palm can't draw stray strokes.
 */
const PALM_REJECTION_MS = 200;

/** Tilt → opacity for a pencil-on-its-side feel. 0° opaque, 60°+ → 40%. */
function tiltToOpacity(tiltX: number, tiltY: number): number {
  const magnitude = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
  return 1 - Math.min(magnitude / 60, 1) * 0.6;
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
  ruling = 'college',
  penType = 'fountain',
  stabilizer = false,
  storageKey,
  onStrokeEnd,
  onPenStart,
  onPenSample,
  onPenEnd,
  initialHistory,
}: UseDrawingOptions): UseDrawingResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Captured once — a history seed only makes sense at mount (the page this
  // instance was created for). Later prop changes are ignored by design.
  const initialHistoryRef = useRef<HistorySnapshot<Stroke[]> | null>(initialHistory ?? null);
  const history = useHistory<Stroke[]>([], initialHistoryRef.current ?? undefined);

  // ─── View (zoom + pan) ────────────────────────────────────────────────────────
  // Ref is authoritative for the render/input hot paths; state drives the UI.
  const viewRef = useRef<ViewTransform>(IDENTITY_VIEW);
  const [view, setView] = useState<ViewTransform>(IDENTITY_VIEW);
  const { save, load } = useLocalStorage(storageKey);

  // Latest committed strokes — mirrored in a ref for event handlers and rAF
  // callbacks so they always read the current value without re-binding.
  const strokesRef = useRef<Stroke[]>(history.present);
  strokesRef.current = history.present;

  // In-progress stroke + active-gesture bookkeeping.
  const liveStrokeRef = useRef<Stroke | null>(null);
  const activePointerId = useRef<number | null>(null);

  // Palm rejection is per-instance: sharing this across canvases (split view,
  // multi-window) would let a pen lift in one instance reject touch in another.
  const lastPenLiftTimeRef = useRef(0);
  const activePenPointerTypeRef = useRef<string | null>(null);
  const isPalmRejected = useCallback((pointerType: string): boolean => {
    if (pointerType !== 'touch') return false;
    return Date.now() - lastPenLiftTimeRef.current < PALM_REJECTION_MS;
  }, []);
  const strokeStartTime = useRef<number>(0);
  const staticRafId = useRef<number | null>(null);
  const overlayRafId = useRef<number | null>(null);

  // Toolbar settings mirrored so handlers always read fresh values.
  const settingsRef = useRef<UseDrawingOptions>({ tool, color, size, paper, ruling, penType, stabilizer });
  settingsRef.current = { tool, color, size, paper, ruling, penType, stabilizer };
  // Previous smoothed world point for the stabilizer; reset at each stroke start.
  const smoothPrevRef = useRef<{ x: number; y: number } | null>(null);

  const onStrokeEndRef = useRef<UseDrawingOptions['onStrokeEnd']>(onStrokeEnd);
  onStrokeEndRef.current = onStrokeEnd;

  // Live pen side-channel (Learning Mode audio) mirrored to refs so the hot
  // path reads current callbacks without re-binding handlers.
  const onPenStartRef = useRef(onPenStart);
  onPenStartRef.current = onPenStart;
  const onPenSampleRef = useRef(onPenSample);
  onPenSampleRef.current = onPenSample;
  const onPenEndRef = useRef(onPenEnd);
  onPenEndRef.current = onPenEnd;

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

  // ─── Canvas sizing + transforms ──────────────────────────────────────────────

  /**
   * Compose DPR scaling with the world view (zoom + pan) onto a context:
   * `screen = (world - pan) * scale`, then DPR for device pixels. Callers must
   * `clearRect` in *device* space (before this is applied) to wipe the whole
   * surface regardless of pan/zoom.
   */
  const applyTransform = useCallback((ctx: CanvasRenderingContext2D, dpr: number) => {
    const { scale, panX, panY } = viewRef.current;
    const s = dpr * scale;
    ctx.setTransform(s, 0, 0, s, -panX * s, -panY * s);
  }, []);

  /** Clear a canvas in device space (ignores the current transform). */
  const clearDevice = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  const sizeCanvas = useCallback((canvas: HTMLCanvasElement, dpr: number) => {
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }, []);

  // Paint committed strokes + paper onto the static (bottom) canvas.
  const paintStatic = useCallback(
    (source?: Stroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      clearDevice(ctx, canvas);
      applyTransform(ctx, dpr);
      // Viewport culling: the visible rect, inverse-transformed into world
      // space. On-screen paint only — export paths must NOT cull (see
      // RenderOptions.cull).
      const tl = screenToWorld(0, 0, viewRef.current);
      const br = screenToWorld(canvas.clientWidth, canvas.clientHeight, viewRef.current);
      renderAll(ctx, source ?? strokesRef.current, canvas.clientWidth, canvas.clientHeight, {
        paper: settingsRef.current.paper,
        ruling: settingsRef.current.ruling,
        cull: { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y },
      });
    },
    [applyTransform, clearDevice],
  );

  const resizeCanvas = useCallback(() => {
    const base = canvasRef.current;
    const overlay = overlayRef.current;
    if (!base) return;
    const dpr = window.devicePixelRatio || 1;
    sizeCanvas(base, dpr);
    if (overlay) sizeCanvas(overlay, dpr);
    paintStatic();
    // Clear the overlay; it repaints on the next pointer/selection change.
    if (overlay) {
      const octx = overlay.getContext('2d');
      if (octx) clearDevice(octx, overlay);
    }
  }, [sizeCanvas, paintStatic, clearDevice]);

  useLayoutEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // ─── Render loop ────────────────────────────────────────────────────────────

  /**
   * Repaint the static (committed) layer on the next frame. Coalesced so many
   * triggers per frame collapse into one paint. During an erase drag the
   * working copy is shown; during a move, the offset is applied to the static
   * layer (move/erase are bounded, lower-frequency gestures).
   */
  const scheduleStaticRender = useCallback(() => {
    if (staticRafId.current !== null) return;
    staticRafId.current = requestAnimationFrame(() => {
      staticRafId.current = null;
      const base = eraseWorkingRef.current ?? strokesRef.current;
      const { dx, dy } = moveOffsetRef.current;
      const source =
        selectionPhaseRef.current === 'moving' && (dx !== 0 || dy !== 0)
          ? applyMoveOffset(base, selectedIdsRef.current, dx, dy)
          : base;
      paintStatic(source);
    });
  }, [paintStatic]);

  /**
   * Repaint the overlay (live stroke + lasso + selection rect) on the next
   * frame. This is the hot path during drawing — it never touches committed ink.
   */
  const scheduleOverlayRender = useCallback(() => {
    if (overlayRafId.current !== null) return;
    overlayRafId.current = requestAnimationFrame(() => {
      overlayRafId.current = null;
      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      clearDevice(ctx, canvas);
      applyTransform(ctx, dpr);

      if (liveStrokeRef.current) drawStroke(ctx, liveStrokeRef.current);

      if (selectionPhaseRef.current === 'lasso') {
        drawLasso(ctx, lassoRef.current);
      }
      if (selectedIdsRef.current.size > 0) {
        // Selection bounds follow the in-flight move offset (matches static layer).
        const { dx, dy } = moveOffsetRef.current;
        const base = eraseWorkingRef.current ?? strokesRef.current;
        const display =
          selectionPhaseRef.current === 'moving' && (dx !== 0 || dy !== 0)
            ? applyMoveOffset(base, selectedIdsRef.current, dx, dy)
            : base;
        const selected = display.filter((s) => selectedIdsRef.current.has(s.id));
        const b = inkBounds(selected);
        if (b) drawSelectionRect(ctx, b);
      }
    });
  }, [applyTransform, clearDevice]);

  // ─── Restore from storage ───────────────────────────────────────────────────

  useEffect(() => {
    // Seeded from the page-flip history cache → the seed is authoritative;
    // do not overwrite it with the (possibly staler) storage payload.
    if (initialHistoryRef.current) return;
    const restored = load();
    if (restored.length > 0) {
      history.reset(restored);
      strokesRef.current = restored;
      setIsEmpty(false);
      scheduleStaticRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint the static layer when the paper style changes.
  useEffect(() => {
    scheduleStaticRender();
  }, [paper, scheduleStaticRender]);

  // Clear selection when switching away from the select tool.
  useEffect(() => {
    if (tool !== 'select' && selectedIdsRef.current.size > 0) {
      selectedIdsRef.current = new Set();
      setSelectedIds(new Set());
      lassoRef.current = [];
      selectionPhaseRef.current = 'idle';
      setSelectionPhase('idle');
      scheduleOverlayRender();
    }
  }, [tool, scheduleOverlayRender]);

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
      const profile = penProfile(settingsRef.current.penType ?? 'fountain');
      const width = profile.widthFor(pressure, baseSize);
      // Tilt shading applies to pen input for opaque pens; the pen's base
      // opacity (e.g. highlighter's translucency) multiplies in.
      const tilt = pointerType === 'pen' ? tiltToOpacity(tiltX, tiltY) : 1;
      const opacity = profile.opacity * tilt;
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

  /** Map raw client coordinates to world space, accounting for pan + zoom. */
  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return screenToWorld(sx, sy, viewRef.current);
  }, []);

  const getCanvasPoint = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } =>
      clientToWorld(e.clientX, e.clientY),
    [clientToWorld],
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
      scheduleStaticRender();
    }
  }, [scheduleStaticRender]);

  // ─── Selection actions ──────────────────────────────────────────────────────

  const clearSelection = useCallback(() => {
    selectedIdsRef.current = new Set();
    setSelectedIds(new Set());
    lassoRef.current = [];
    selectionPhaseRef.current = 'idle';
    setSelectionPhase('idle');
    moveOffsetRef.current = { dx: 0, dy: 0 };
    moveOriginRef.current = null;
    scheduleOverlayRender();
  }, [scheduleOverlayRender]);

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
    // Committed ink changed → static repaints via the history effect; clear the
    // now-stale selection rect off the overlay immediately.
    scheduleOverlayRender();
  }, [history, scheduleOverlayRender]);

  const duplicateSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const { next, newIds } = duplicateStrokes(strokesRef.current, ids, 16, 16);
    // No clones produced (e.g. the selection referenced strokes removed by a
    // prior undo) → don't burn an undo slot on a no-op.
    if (newIds.size === 0) return;
    history.set(next);
    strokesRef.current = next;
    selectedIdsRef.current = newIds;
    setSelectedIds(newIds);
    scheduleOverlayRender();
  }, [history, scheduleOverlayRender]);

  const recolorSelected = useCallback(
    (color: string) => {
      const ids = selectedIdsRef.current;
      if (ids.size === 0) return;
      const next = recolorStrokes(strokesRef.current, ids, color);
      // recolorStrokes returns the same reference when nothing changed.
      if (next === strokesRef.current) return;
      history.set(next);
      strokesRef.current = next;
      scheduleOverlayRender();
    },
    [history, scheduleOverlayRender],
  );

  // ─── Pointer event handlers ─────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (activePointerId.current !== null) return;
      if (isPalmRejected(e.pointerType)) return;

      if (e.pointerType === 'pen') activePenPointerTypeRef.current = 'pen';

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
          scheduleOverlayRender();
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
      smoothPrevRef.current = { x: point.x, y: point.y };
      liveStrokeRef.current = {
        id: createId(),
        color: activeColor,
        size: activeSize,
        penType: settingsRef.current.penType ?? 'fountain',
        // Capture-time replay anchor (Phase 3) — cannot be backfilled later.
        startedAt: Date.now(),
        points: [point],
      };
      onPenStartRef.current?.();
      onPenSampleRef.current?.(point);
      scheduleOverlayRender();
    },
    [eraseAt, getCanvasPoint, getPoint, isPalmRejected, scheduleOverlayRender],
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

      // ── select ──
      if (activeTool === 'select') {
        const phase = selectionPhaseRef.current;
        if (phase === 'lasso') {
          for (const ev of samples) {
            lassoRef.current.push(clientToWorld(ev.clientX, ev.clientY));
          }
          scheduleOverlayRender();
        } else if (phase === 'moving' && moveOriginRef.current) {
          const last = samples[samples.length - 1];
          const w = clientToWorld(last.clientX, last.clientY);
          moveOffsetRef.current = {
            dx: w.x - moveOriginRef.current.x,
            dy: w.y - moveOriginRef.current.y,
          };
          // Moving shifts committed strokes visually (static) + the rect (overlay).
          scheduleStaticRender();
          scheduleOverlayRender();
        }
        return;
      }

      // ── eraser ──
      if (activeTool === 'eraser') {
        for (const ev of samples) {
          const w = clientToWorld(ev.clientX, ev.clientY);
          eraseAt(w.x, w.y, eraserRadius(activeSize));
        }
        return;
      }

      // ── pen ──
      const live = liveStrokeRef.current;
      if (!live) return;
      const stabilize = settingsRef.current.stabilizer === true;
      for (const ev of samples) {
        const raw = clientToWorld(ev.clientX, ev.clientY);
        const w = stabilize ? smoothPoint(raw, smoothPrevRef.current, 0.35) : raw;
        if (stabilize) smoothPrevRef.current = w;
        const pt = buildPoint(w.x, w.y, ev.pointerType, ev.pressure, ev.tiltX ?? 0, ev.tiltY ?? 0);
        live.points.push(pt);
        onPenSampleRef.current?.(pt);
      }
      scheduleOverlayRender();
    },
    [buildPoint, clientToWorld, eraseAt, scheduleOverlayRender, scheduleStaticRender],
  );

  const endGesture = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerId.current) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      activePointerId.current = null;

      if (e.pointerType === 'pen' && activePenPointerTypeRef.current === 'pen') {
        lastPenLiftTimeRef.current = Date.now();
        activePenPointerTypeRef.current = null;
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
          scheduleOverlayRender();

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
          // Committed ink repaints via the history effect; redraw the rect at its
          // final resting place on the overlay.
          scheduleStaticRender();
          scheduleOverlayRender();
        }
        return;
      }

      // ── eraser ──
      if (activeTool === 'eraser') {
        const working = eraseWorkingRef.current;
        eraseWorkingRef.current = null;
        if (erasedDuringDrag.current && working) {
          erasedDuringDrag.current = false;
          history.set(working); // static repaints via the history effect
          strokesRef.current = working;
        } else {
          scheduleStaticRender();
        }
        return;
      }

      // ── pen ──
      const live = liveStrokeRef.current;
      liveStrokeRef.current = null;
      onPenEndRef.current?.();
      if (!live || live.points.length === 0) {
        scheduleOverlayRender(); // clear any partial live stroke
        return;
      }

      const next = [...strokesRef.current, live];
      history.set(next);
      strokesRef.current = next;
      onStrokeEndRef.current?.(live);
      // Clear the live copy off the overlay now; the committed copy lands on the
      // static layer via the history effect (avoids a one-frame double draw).
      scheduleOverlayRender();
    },
    [history, scheduleOverlayRender, scheduleStaticRender],
  );

  /**
   * Abort the in-flight gesture WITHOUT committing it. Fired on `pointercancel`
   * (palm rejection, a system/browser gesture stealing the pointer) — precisely
   * the case where the partial stroke/erase/move is not what the user meant to
   * keep. Discards all in-flight state and repaints back to the committed ink.
   */
  const cancelGesture = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerId.current) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      activePointerId.current = null;

      if (e.pointerType === 'pen' && activePenPointerTypeRef.current === 'pen') {
        lastPenLiftTimeRef.current = Date.now();
        activePenPointerTypeRef.current = null;
      }

      // Discard any in-flight per-tool work (none of it touches history).
      liveStrokeRef.current = null;
      onPenEndRef.current?.();
      eraseWorkingRef.current = null;
      erasedDuringDrag.current = false;
      moveOffsetRef.current = { dx: 0, dy: 0 };
      moveOriginRef.current = null;
      // A cancelled lasso drops back to no selection; a cancelled move keeps the
      // existing selection but drops the offset. Either way, reset the phase.
      if (selectionPhaseRef.current === 'lasso') {
        lassoRef.current = [];
      }
      selectionPhaseRef.current = 'idle';
      setSelectionPhase('idle');

      // Repaint both layers back to committed ink (undoing any move preview /
      // erase working copy shown mid-gesture).
      scheduleStaticRender();
      scheduleOverlayRender();
    },
    [scheduleOverlayRender, scheduleStaticRender],
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

    // Reconcile the selection with the new stroke set. undo/redo can bring back
    // a state where selected strokes no longer exist (or remove them again);
    // without this the selection toolbar floats over phantom bounds and the
    // mutating actions operate on ids that aren't on the canvas.
    const reconciled = reconcileSelection(selectedIdsRef.current, history.present);
    if (reconciled !== selectedIdsRef.current) {
      const next = reconciled as Set<string>;
      selectedIdsRef.current = next;
      setSelectedIds(next);
      if (next.size === 0) {
        selectionPhaseRef.current = 'idle';
        setSelectionPhase('idle');
      }
    }

    scheduleStaticRender();
    if (hydratedRef.current) {
      save(history.present);
    } else {
      hydratedRef.current = true;
    }
  }, [history.present, save, scheduleStaticRender]);

  // Cancel any pending rAFs on unmount.
  useEffect(() => {
    return () => {
      if (staticRafId.current !== null) {
        cancelAnimationFrame(staticRafId.current);
        staticRafId.current = null;
      }
      if (overlayRafId.current !== null) {
        cancelAnimationFrame(overlayRafId.current);
        overlayRafId.current = null;
      }
    };
  }, []);

  // ─── View controls (zoom + pan) ───────────────────────────────────────────────

  const commitView = useCallback(
    (next: ViewTransform) => {
      viewRef.current = next;
      setView(next);
      // Both layers depend on the transform — repaint each once.
      scheduleStaticRender();
      scheduleOverlayRender();
    },
    [scheduleStaticRender, scheduleOverlayRender],
  );

  const zoomBy = useCallback(
    (factor: number, screenX?: number, screenY?: number) => {
      const prev = viewRef.current;
      const scale = clampScale(prev.scale * factor);
      if (scale === prev.scale) return;
      // Keep the anchor point stationary on screen while zooming.
      const canvas = overlayRef.current;
      const ax = screenX ?? (canvas ? canvas.clientWidth / 2 : 0);
      const ay = screenY ?? (canvas ? canvas.clientHeight / 2 : 0);
      // World point under the anchor must stay fixed: solve new pan.
      const worldX = ax / prev.scale + prev.panX;
      const worldY = ay / prev.scale + prev.panY;
      commitView({ scale, panX: worldX - ax / scale, panY: worldY - ay / scale });
    },
    [commitView],
  );

  const panBy = useCallback(
    (dxScreen: number, dyScreen: number) => {
      const prev = viewRef.current;
      commitView({
        ...prev,
        panX: prev.panX - dxScreen / prev.scale,
        panY: prev.panY - dyScreen / prev.scale,
      });
    },
    [commitView],
  );

  const resetView = useCallback(() => {
    commitView(IDENTITY_VIEW);
  }, [commitView]);

  // Native, non-passive wheel listener so we can preventDefault and stop the
  // browser from page-zooming on ctrl/⌘+wheel (pinch). Plain wheel pans.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const prev = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const scale = clampScale(prev.scale * Math.exp(-e.deltaY * 0.01));
        if (scale === prev.scale) return;
        const worldX = sx / prev.scale + prev.panX;
        const worldY = sy / prev.scale + prev.panY;
        commitView({ scale, panX: worldX - sx / scale, panY: worldY - sy / scale });
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        commitView({
          ...prev,
          panX: prev.panX + dx / prev.scale,
          panY: prev.panY + dy / prev.scale,
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [commitView]);

  // Memoize the public surface so consumers can safely use `selection` / `view`
  // (or the whole result) as effect deps — otherwise every render hands back
  // fresh object literals and defeats their memoization.
  const selectionState = useMemo<SelectionState>(
    () => ({
      phase: selectionPhase,
      selectedIds,
      bounds: selectionBounds,
      clearSelection,
      deleteSelected,
      duplicateSelected,
      recolorSelected,
    }),
    [
      selectionPhase,
      selectedIds,
      selectionBounds,
      clearSelection,
      deleteSelected,
      duplicateSelected,
      recolorSelected,
    ],
  );

  const viewState = useMemo<ViewState>(
    () => ({
      scale: view.scale,
      panX: view.panX,
      panY: view.panY,
      zoomBy,
      panBy,
      reset: resetView,
    }),
    [view.scale, view.panX, view.panY, zoomBy, panBy, resetView],
  );

  return useMemo<UseDrawingResult>(
    () => ({
      canvasRef,
      overlayRef,
      strokes: history.present,
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: cancelGesture,
      getHistorySnapshot: history.snapshot,
      undo,
      redo,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      clear,
      isEmpty,
      selection: selectionState,
      view: viewState,
    }),
    [
      history.present,
      onPointerDown,
      onPointerMove,
      endGesture,
      cancelGesture,
      undo,
      redo,
      history.canUndo,
      history.canRedo,
      clear,
      isEmpty,
      selectionState,
      viewState, history.snapshot,],
  );
}
