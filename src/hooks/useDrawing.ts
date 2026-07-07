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
import { RULING_SPACING } from '../lib/paper';
import { duplicateStrokes, recolorStrokes, reconcileSelection } from '../lib/selectionOps';
import { penProfile, type PenType } from '../lib/penProfiles';
import { smoothPoint } from '../lib/stabilizer';
import { createId } from '../lib/id';
import type { Bounds, PinchSample, ZoomRange } from '../lib/geometry';
import {
  applyMoveOffset,
  clampPanToBounds,
  clampScale,
  pinchDelta,
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
  /**
   * World-space rect the view must keep on screen (notebook page bounds).
   * `null`/omitted = infinite canvas, no clamping. Enforced in commitView so
   * pan, zoom-anchor and any future view mutation share one rule.
   */
  panBounds?: Bounds | null;
  /** Mode zoom bounds (ModeConfig.zoomRange). Default keeps legacy MIN/MAX. */
  zoomRange?: ZoomRange;
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
  /** Scroll a bounded page so a world-Y position stays comfortably in view
   *  (notebook "focus follows writing"; no-op on the infinite canvas). */
  scrollToKeepVisible: (worldY: number) => void;
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
  panBounds = null,
  zoomRange,
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
  // Page rect for bounded modes (notebook A4). Declared early because both the
  // render path (paintStatic) and the pan clamp read it.
  const panBoundsRef = useRef<Bounds | null>(panBounds);
  panBoundsRef.current = panBounds;
  // Notebook auto-scroll handler; assigned once commitView exists, called from
  // endGesture (both defined below). Declared here to precede endGesture.
  const autoScrollRef = useRef<((stroke: Stroke) => void) | null>(null);
  const [view, setView] = useState<ViewTransform>(IDENTITY_VIEW);
  const { save, load } = useLocalStorage(storageKey);

  // Latest committed strokes — mirrored in a ref for event handlers and rAF
  // callbacks so they always read the current value without re-binding.
  const strokesRef = useRef<Stroke[]>(history.present);
  strokesRef.current = history.present;

  // In-progress stroke + active-gesture bookkeeping.
  const liveStrokeRef = useRef<Stroke | null>(null);
  const activePointerId = useRef<number | null>(null);

  // ── Two-finger pinch (Phase 3 item 2) ──
  // Live touch points by pointerId; a pinch engages the moment a second touch
  // lands, DISCARDING any nascent single-finger stroke (the classic pinch-
  // starts-as-accidental-draw problem). Rotation is deliberately out of scope.
  const touchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchPrevRef = useRef<PinchSample | null>(null);

  const currentPinchSample = useCallback((): PinchSample | null => {
    const pts = [...touchPointsRef.current.values()];
    if (pts.length < 2) return null;
    return { ax: pts[0].x, ay: pts[0].y, bx: pts[1].x, by: pts[1].y };
  }, []);

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
      const viewRect = { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y };
      renderAll(ctx, source ?? strokesRef.current, canvas.clientWidth, canvas.clientHeight, {
        paper: settingsRef.current.paper,
        ruling: settingsRef.current.ruling,
        cull: viewRect,
        // Notebook: draw the paper as a bounded A4 page (panBounds IS the page
        // rect) with a backdrop around it, not bled to the window edges.
        pageBounds: panBoundsRef.current,
        viewRect,
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

  // Center a bounded page (notebook A4) horizontally in the viewport on mount,
  // so it opens like a document sheet rather than pinned to the left edge. Runs
  // once per page instance (Workspace remounts per page/doc). No-op for the
  // infinite canvas.
  const didCenterRef = useRef(false);
  useLayoutEffect(() => {
    if (didCenterRef.current) return;
    const bounds = panBoundsRef.current;
    const canvas = overlayRef.current;
    if (!bounds || !canvas) return;
    didCenterRef.current = true;
    const pageW = bounds.maxX - bounds.minX;
    const vw = canvas.clientWidth;
    const scale = viewRef.current.scale;
    // panX centers horizontally; panY opens the page top just BELOW the toolbar
    // (which floats at the top of the screen) so it never overlaps what you
    // write near the top. screen = (world - pan) * scale.
    const TOP_GAP = 132; // clears the floating toolbar + a little breathing room
    const panX = bounds.minX - (vw / scale - pageW) / 2;
    const panY = bounds.minY - TOP_GAP / scale;
    const next = { ...viewRef.current, panX, panY };
    viewRef.current = next;
    setView(next);
    scheduleStaticRender();
    scheduleOverlayRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * Discard all in-flight per-tool work without committing (none of it
   * touches history). Shared by pointercancel AND the pinch entry path — a
   * second finger landing means "this was navigation, not ink", the same
   * semantics as the browser stealing the pointer.
   */
  const discardInFlightWork = useCallback(() => {
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
    // Repaint both layers back to committed ink.
    scheduleStaticRender();
    scheduleOverlayRender();
  }, [scheduleOverlayRender, scheduleStaticRender]);

  const commitView = useCallback(
    (next: ViewTransform) => {
      const bounds = panBoundsRef.current;
      if (bounds) {
        const canvas = canvasRef.current;
        next = clampPanToBounds(
          next,
          bounds,
          canvas?.clientWidth ?? window.innerWidth,
          canvas?.clientHeight ?? window.innerHeight,
        );
      }
      viewRef.current = next;
      setView(next);
      // Both layers depend on the transform — repaint each once.
      scheduleStaticRender();
      scheduleOverlayRender();
    },
    [scheduleStaticRender, scheduleOverlayRender],
  );

  /**
   * Notebook "focus follows writing": after a pen stroke commits, keep the
   * writing position comfortably in the upper-middle of the page so you're not
   * writing at the bottom edge. Pure geometry — the stroke's baseline (its
   * lowest ink) is the write head; if it sits below a comfort band, pan down so
   * it rises to ~42% of the viewport. When the stroke ended near the right
   * margin (a finished line), advance an extra ruling so the next line lands in
   * view. commitView clamps to the page, so this never scrolls past the sheet.
   */
  /**
   * Core "focus follows writing": if a world-Y write head sits below a comfort
   * band on screen, pan down so it rises to ~42% of the viewport. Only active
   * for a bounded page (notebook); commitView clamps to the page so it never
   * scrolls past the sheet. Shared by pen strokes and text editing.
   */
  const scrollToKeepVisible = useCallback(
    (worldY: number, extraLines = 0) => {
      const bounds = panBoundsRef.current;
      const canvas = canvasRef.current;
      if (!bounds || !canvas) return;
      const view = viewRef.current;
      const vh = canvas.clientHeight;
      const screenY = (worldY - view.panY) * view.scale;

      const comfortLine = vh * 0.62;
      const target = vh * 0.42;
      let deltaScreenY = screenY > comfortLine ? screenY - target : 0;
      if (extraLines > 0) {
        deltaScreenY += extraLines * RULING_SPACING[settingsRef.current.ruling ?? 'college'] * view.scale;
      }
      if (deltaScreenY < 1) return;
      commitView({ ...view, panY: view.panY + deltaScreenY / view.scale });
    },
    [commitView],
  );

  const autoScroll = useCallback(
    (stroke: Stroke) => {
      if (stroke.points.length === 0) return;
      const bounds = panBoundsRef.current;
      if (!bounds) return;
      // Write head = lowest (max y) ink; a line ending near the right margin
      // advances one extra ruling so the next line lands in view.
      let baseY = -Infinity;
      let maxX = -Infinity;
      for (const p of stroke.points) {
        if (p.y > baseY) baseY = p.y;
        if (p.x > maxX) maxX = p.x;
      }
      const pageW = bounds.maxX - bounds.minX;
      const atRightMargin = maxX >= bounds.minX + pageW * 0.9;
      scrollToKeepVisible(baseY, atRightMargin ? 1 : 0);
    },
    [scrollToKeepVisible],
  );
  autoScrollRef.current = autoScroll;

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (isPalmRejected(e.pointerType)) return;

      // ── two-finger pinch entry ──
      if (e.pointerType === 'touch') {
        touchPointsRef.current.set(e.pointerId, getCanvasPoint(e));
        if (touchPointsRef.current.size === 2) {
          // Second finger = navigation, not ink. Discard the nascent
          // single-finger gesture (same semantics as pointercancel).
          if (activePointerId.current !== null) {
            try {
              e.currentTarget.releasePointerCapture(activePointerId.current);
            } catch { /* ignore */ }
            activePointerId.current = null;
            discardInFlightWork();
          }
          pinchPrevRef.current = currentPinchSample();
          return;
        }
        if (touchPointsRef.current.size > 2) return; // ignore extra fingers
      }
      if (pinchPrevRef.current) return; // pinch owns the surface

      if (activePointerId.current !== null) return;

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
    [currentPinchSample, discardInFlightWork, eraseAt, getCanvasPoint, getPoint, isPalmRejected, scheduleOverlayRender],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      // ── pinch update: zoom at the midpoint, follow its drag ──
      if (
        e.pointerType === 'touch' &&
        pinchPrevRef.current &&
        touchPointsRef.current.has(e.pointerId)
      ) {
        touchPointsRef.current.set(e.pointerId, getCanvasPoint(e));
        const prev = pinchPrevRef.current;
        const next = currentPinchSample();
        if (next) {
          const d = pinchDelta(prev, next);
          const v = viewRef.current;
          const scale = clampScale(v.scale * d.factor, zoomRangeRef.current);
          // The world point under the PREVIOUS midpoint lands on the NEW
          // midpoint — one formula covers both the zoom anchor and the drag.
          const prevMidWorldX = (d.midX - d.panDx) / v.scale + v.panX;
          const prevMidWorldY = (d.midY - d.panDy) / v.scale + v.panY;
          commitView({
            scale,
            panX: prevMidWorldX - d.midX / scale,
            panY: prevMidWorldY - d.midY / scale,
          });
          pinchPrevRef.current = next;
        }
        return;
      }

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
    [buildPoint, clientToWorld, commitView, currentPinchSample, eraseAt, getCanvasPoint, scheduleOverlayRender, scheduleStaticRender],
  );

  const endGesture = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      // ── pinch bookkeeping ──
      if (e.pointerType === 'touch') {
        touchPointsRef.current.delete(e.pointerId);
        if (pinchPrevRef.current) {
          // Down to one finger: end the pinch. The survivor does nothing
          // until lifted — it never becomes a stroke mid-flight.
          pinchPrevRef.current =
            touchPointsRef.current.size >= 2 ? currentPinchSample() : null;
          return;
        }
      }

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
      // Notebook: gently follow the writing position down the page (and advance
      // a line when the pen reached the right margin). Ref-indirected because
      // the handler needs commitView, defined below.
      autoScrollRef.current?.(live);
      // Clear the live copy off the overlay now; the committed copy lands on the
      // static layer via the history effect (avoids a one-frame double draw).
      scheduleOverlayRender();
    },
    [currentPinchSample, history, scheduleOverlayRender, scheduleStaticRender],
  );

  /**
   * Abort the in-flight gesture WITHOUT committing it. Fired on `pointercancel`
   * (palm rejection, a system/browser gesture stealing the pointer) — precisely
   * the case where the partial stroke/erase/move is not what the user meant to
   * keep. Discards all in-flight state and repaints back to the committed ink.
   */
  const cancelGesture = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      // Pinch bookkeeping mirrors endGesture: a cancelled touch leaves the map.
      if (e.pointerType === 'touch') {
        touchPointsRef.current.delete(e.pointerId);
        if (pinchPrevRef.current) {
          pinchPrevRef.current =
            touchPointsRef.current.size >= 2 ? currentPinchSample() : null;
          return;
        }
      }
      if (e.pointerId !== activePointerId.current) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      activePointerId.current = null;

      if (e.pointerType === 'pen' && activePenPointerTypeRef.current === 'pen') {
        lastPenLiftTimeRef.current = Date.now();
        activePenPointerTypeRef.current = null;
      }

      discardInFlightWork();
    },
    [currentPinchSample, discardInFlightWork],
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

  // panBoundsRef declared earlier (both render + pan clamp read it).
  const zoomRangeRef = useRef<ZoomRange | undefined>(zoomRange);
  zoomRangeRef.current = zoomRange;

  const zoomBy = useCallback(
    (factor: number, screenX?: number, screenY?: number) => {
      const prev = viewRef.current;
      const scale = clampScale(prev.scale * factor, zoomRangeRef.current);
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
        const scale = clampScale(prev.scale * Math.exp(-e.deltaY * 0.01), zoomRangeRef.current);
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
      scrollToKeepVisible,
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
      viewState, history.snapshot, scrollToKeepVisible,],
  );
}
