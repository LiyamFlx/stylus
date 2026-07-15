import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RulingDensity, InkPoint, PaperStyle, Shape, ShapeType, Stroke, Tool } from '../types';
import { useHistory } from './useHistory';
import type { HistorySnapshot } from './useHistory';
import { useLocalStorage } from './useLocalStorage';
import type { DrawingContent } from './useLocalStorage';
import { drawStroke, drawShape, drawLasso, drawSelectionRect, renderAll } from '../lib/render';
import { RULING_SPACING } from '../lib/paper';
import {
  duplicateShapes,
  duplicateStrokes,
  recolorShapes,
  recolorStrokes,
  reconcileSelection,
  reconcileShapeSelection,
} from '../lib/selectionOps';
import { penProfile, type PenType } from '../lib/penProfiles';
import { smoothPoint } from '../lib/stabilizer';
import { createId } from '../lib/id';
import type { Bounds, PinchSample, SelectionHandle, ZoomRange } from '../lib/geometry';
import {
  applyMoveOffset,
  applyMoveOffsetToShapes,
  applyRotateOffset,
  applyRotateOffsetToShapes,
  applyScaleOffset,
  applyScaleOffsetToShapes,
  clampPanToBounds,
  clampScale,
  combinedBounds,
  pinchDelta,
  eraserRadius,
  hitsSelectionBounds,
  hitsSelectionHandle,
  IDENTITY_VIEW,
  screenToWorld,
  shapeInLasso,
  shiftBounds,
  snapShapeEndpoint,
  splitStrokeAtErase,
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
   * RESOLVED page template id (documents.ts resolvePageTemplateId), or null.
   * Passed straight through to renderAll — when decoded it replaces the paper
   * guide on the bounded page (see RenderOptions.templateId).
   */
  templateId?: string | null;
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
  /** Active shape sub-type for the shape tool. Defaults to 'rect' when
   *  omitted, matching how penType defaults to 'fountain'. */
  shapeType?: ShapeType;
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
  initialHistory?: HistorySnapshot<DrawingContent>;
  /** Fired the moment a pen stroke commits — used for live music feedback. */
  onStrokeEnd?: (stroke: Stroke) => void;
  /** Optional live side-channel for per-sample pen feedback (Learning Mode
   *  audio). Additive: the core stroke pipeline ignores these entirely. */
  onPenStart?: () => void;
  onPenSample?: (point: InkPoint) => void;
  onPenEnd?: () => void;
  /**
   * Fired after a debounced local save actually lands in localStorage
   * (ADR 002 sync boundary — see useLocalStorage's writeNow doc comment for
   * the ordering guarantee this depends on). Additive, same as the pen
   * side-channels above: omitting it changes nothing about local
   * persistence, which is unconditional and untouched by this hook-up.
   */
  onStrokesSaved?: (content: DrawingContent, savedAt: number) => void;
}

/** Selection phase for the lasso tool. */
export type SelectPhase = 'idle' | 'lasso' | 'moving' | 'resizing' | 'rotating';

export interface SelectionState {
  phase: SelectPhase;
  /** Selected stroke ids and shape ids as two separate sets (not one mixed
   *  set) — lasso/move/resize/rotate all touch both together, but keeping
   *  them apart lets every consumer (deleteSelected, duplicateSelected,
   *  recolorSelected, the render loop) filter each array by its OWN id set
   *  without first partitioning a combined one by type on every use. */
  selectedStrokeIds: ReadonlySet<string>;
  selectedShapeIds: ReadonlySet<string>;
  /** Bounds of the selected strokes AND shapes together, with any in-flight
   *  move/resize/rotate offset applied. */
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
  /** Recenter + zoom to fit the given content bounds (falls back to reset()
   *  when null/empty — nothing to fit). */
  zoomToFit: (bounds: Bounds | null) => void;
}

export interface UseDrawingResult {
  /** Bottom canvas (committed strokes + paper). Used by callers for sizing. */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Top canvas (live stroke + lasso + selection); also the interactive surface. */
  overlayRef: React.RefObject<HTMLCanvasElement>;
  strokes: Stroke[];
  shapes: Shape[];
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  /** Abort the in-flight gesture without committing (pointercancel). */
  onPointerCancel: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  /** Capture the current undo/redo history (notebook page-flip cache). */
  getHistorySnapshot: () => HistorySnapshot<DrawingContent>;
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
  templateId = null,
  panBounds = null,
  zoomRange,
  penType = 'fountain',
  shapeType = 'rect',
  stabilizer = false,
  storageKey,
  onStrokeEnd,
  onPenStart,
  onPenSample,
  onPenEnd,
  onStrokesSaved,
  initialHistory,
}: UseDrawingOptions): UseDrawingResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const EMPTY_CONTENT: DrawingContent = { strokes: [], shapes: [] };
  // Captured once — a history seed only makes sense at mount (the page this
  // instance was created for). Later prop changes are ignored by design.
  const initialHistoryRef = useRef<HistorySnapshot<DrawingContent> | null>(initialHistory ?? null);
  const history = useHistory<DrawingContent>(EMPTY_CONTENT, initialHistoryRef.current ?? undefined);

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
  const { save, load } = useLocalStorage(storageKey, onStrokesSaved);

  // Latest committed strokes/shapes — mirrored in refs for event handlers and
  // rAF callbacks so they always read the current value without re-binding.
  const strokesRef = useRef<Stroke[]>(history.present.strokes);
  strokesRef.current = history.present.strokes;
  const shapesRef = useRef<Shape[]>(history.present.shapes);
  shapesRef.current = history.present.shapes;

  // In-progress stroke + active-gesture bookkeeping.
  const liveStrokeRef = useRef<Stroke | null>(null);
  // In-progress shape (drag-to-draw a rect/ellipse/line/arrow) — the shape
  // analog of liveStrokeRef, a preview only committed to history on pointerup.
  const liveShapeRef = useRef<Shape | null>(null);
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
  const settingsRef = useRef<UseDrawingOptions>({ tool, color, size, paper, ruling, templateId, penType, shapeType, stabilizer });
  settingsRef.current = { tool, color, size, paper, ruling, templateId, penType, shapeType, stabilizer };
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

  // Selected stroke/shape ids: refs are authoritative (read in rAF + event
  // handlers); state is the React-visible copy kept in sync on every
  // mutation. Two separate sets, not one mixed set (see SelectionState's doc
  // comment) — lasso/move/resize/rotate touch both together, but every
  // consumer filters ITS OWN array by ITS OWN id set.
  const selectedStrokeIdsRef = useRef<Set<string>>(new Set());
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(new Set());
  const selectedShapeIdsRef = useRef<Set<string>>(new Set());
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());

  const moveOriginRef = useRef<{ x: number; y: number } | null>(null);
  const moveOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Resize: which corner started the drag (its OPPOSITE corner is the fixed
  // pivot), the pivot itself, the origin distance (pivot→pointer at
  // pointerdown, for computing the live scale ratio), and the live scale.
  const resizeHandleRef = useRef<SelectionHandle | null>(null);
  const resizePivotRef = useRef<{ x: number; y: number } | null>(null);
  const resizeOriginDistRef = useRef(0);
  const resizeScaleRef = useRef(1);

  // Rotate: pivot is the selection's own center (fixed for the gesture —
  // computed once at pointerdown from the PRE-rotation bounds, not
  // recomputed live, so the pivot can't drift as points move away from it),
  // the starting pointer angle relative to that pivot, and the live delta.
  const rotatePivotRef = useRef<{ x: number; y: number } | null>(null);
  const rotateOriginAngleRef = useRef(0);
  const rotateAngleRef = useRef(0);

  /** Bounds of the selected strokes AND shapes together, with the current
   *  move/resize/rotate offset applied — resize changes the box size,
   *  rotate changes it too (a rotated shape's AXIS-ALIGNED bounding box
   *  grows), so both need the same "derive from a transformed copy"
   *  treatment move already uses, not a cheap shiftBounds()-only path. */
  const selectionBounds = useMemo((): Bounds | null => {
    if (selectedStrokeIds.size === 0 && selectedShapeIds.size === 0) return null;
    const selectedStrokes = strokesRef.current.filter((s) => selectedStrokeIds.has(s.id));
    const selectedShapes = shapesRef.current.filter((s) => selectedShapeIds.has(s.id));
    const b = combinedBounds(selectedStrokes, selectedShapes);
    if (!b) return null;
    const { dx, dy } = moveOffsetRef.current;
    if (dx !== 0 || dy !== 0) return shiftBounds(b, dx, dy);

    const pivot = resizePivotRef.current;
    if (pivot && resizeScaleRef.current !== 1) {
      const scale = resizeScaleRef.current;
      const scaledStrokes = applyScaleOffset(selectedStrokes, selectedStrokeIds, pivot.x, pivot.y, scale);
      const scaledShapes = applyScaleOffsetToShapes(selectedShapes, selectedShapeIds, pivot.x, pivot.y, scale);
      return combinedBounds(scaledStrokes, scaledShapes) ?? b;
    }

    const rPivot = rotatePivotRef.current;
    if (rPivot && rotateAngleRef.current !== 0) {
      const angle = rotateAngleRef.current;
      const rotatedStrokes = applyRotateOffset(selectedStrokes, selectedStrokeIds, rPivot.x, rPivot.y, angle);
      const rotatedShapes = applyRotateOffsetToShapes(selectedShapes, selectedShapeIds, rPivot.x, rPivot.y, angle);
      return combinedBounds(rotatedStrokes, rotatedShapes) ?? b;
    }

    return b;
    // strokesRef/shapesRef.current change identity when history.present
    // changes, but useMemo won't see that — we re-derive inside
    // scheduleRender (the single authoritative paint path) and also on
    // selectedStrokeIds/selectedShapeIds change which covers all commit
    // points. The memo here is for the public `selection.bounds` return
    // value consumed by external components.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStrokeIds, selectedShapeIds, history.present]);

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

  // Template-decode → repaint bridge (see paintStatic's onTemplateReady).
  const onTemplateReadyRef = useRef<() => void>(() => {});

  // Paint committed strokes + paper onto the static (bottom) canvas.
  const paintStatic = useCallback(
    (source?: { strokes: Stroke[]; shapes: Shape[] }) => {
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
      const strokes = source?.strokes ?? strokesRef.current;
      const shapes = source?.shapes ?? shapesRef.current;
      renderAll(ctx, strokes, canvas.clientWidth, canvas.clientHeight, {
        paper: settingsRef.current.paper,
        ruling: settingsRef.current.ruling,
        // Resolved page template; when its async decode lands, repaint. The
        // callback is ref-bridged because scheduleStaticRender is defined
        // after this callback (it wraps paintStatic).
        templateId: settingsRef.current.templateId,
        onTemplateReady: () => onTemplateReadyRef.current(),
        cull: viewRect,
        // Notebook: draw the paper as a bounded A4 page (panBounds IS the page
        // rect) with a backdrop around it, not bled to the window edges.
        pageBounds: panBoundsRef.current,
        viewRect,
        shapes,
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

    // Container-driven size changes (mode chrome, split view, sidebar toggle)
    // never fire window `resize` — observe the element itself. Without this the
    // backing store stays at the stale size and ink renders squashed/blurry.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resizeCanvas()) : null;
    if (canvasRef.current && ro) ro.observe(canvasRef.current);

    // DPR changes (window dragged between monitors) change neither the window
    // nor the element's CSS size, so neither listener above fires. Standard
    // trick: subscribe a matchMedia query pinned to the CURRENT dpr; it fires
    // exactly when dpr stops matching, then re-pin to the new value.
    let mql: MediaQueryList | null = null;
    const onDprChange = () => {
      resizeCanvas();
      watchDpr();
    };
    function watchDpr() {
      mql?.removeEventListener('change', onDprChange);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener('change', onDprChange);
    }
    watchDpr();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      ro?.disconnect();
      mql?.removeEventListener('change', onDprChange);
    };
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

  /**
   * Applies whichever selection transform is currently in flight (move,
   * resize, or rotate — mutually exclusive, gated by selectionPhaseRef) to
   * both `baseStrokes` and `baseShapes` together. Single choke point for the
   * three render/commit sites that all need "the content as the user
   * currently sees it mid-drag," so the live-preview math can't drift
   * between the static layer, the overlay selection-rect bounds, and the
   * eventual commit-on-pointerup. Strokes and shapes transform together
   * (same phase, same pivot/offset) since a mixed selection moves/resizes/
   * rotates as one group.
   */
  const applyLiveSelectionTransform = useCallback(
    (baseStrokes: Stroke[], baseShapes: Shape[]): { strokes: Stroke[]; shapes: Shape[] } => {
      const phase = selectionPhaseRef.current;
      const strokeIds = selectedStrokeIdsRef.current;
      const shapeIds = selectedShapeIdsRef.current;
      if (phase === 'moving') {
        const { dx, dy } = moveOffsetRef.current;
        if (dx === 0 && dy === 0) return { strokes: baseStrokes, shapes: baseShapes };
        return {
          strokes: applyMoveOffset(baseStrokes, strokeIds, dx, dy),
          shapes: applyMoveOffsetToShapes(baseShapes, shapeIds, dx, dy),
        };
      }
      if (phase === 'resizing' && resizePivotRef.current && resizeScaleRef.current !== 1) {
        const { x, y } = resizePivotRef.current;
        const scale = resizeScaleRef.current;
        return {
          strokes: applyScaleOffset(baseStrokes, strokeIds, x, y, scale),
          shapes: applyScaleOffsetToShapes(baseShapes, shapeIds, x, y, scale),
        };
      }
      if (phase === 'rotating' && rotatePivotRef.current && rotateAngleRef.current !== 0) {
        const { x, y } = rotatePivotRef.current;
        const angle = rotateAngleRef.current;
        return {
          strokes: applyRotateOffset(baseStrokes, strokeIds, x, y, angle),
          shapes: applyRotateOffsetToShapes(baseShapes, shapeIds, x, y, angle),
        };
      }
      return { strokes: baseStrokes, shapes: baseShapes };
    },
    [],
  );

  // ─── Render loop ────────────────────────────────────────────────────────────

  /**
   * Repaint the static (committed) layer on the next frame. Coalesced so many
   * triggers per frame collapse into one paint. During an erase drag the
   * working copy is shown; during a move/resize/rotate, the live transform is
   * applied to the static layer (these are bounded, lower-frequency gestures).
   */
  const scheduleStaticRender = useCallback(() => {
    if (staticRafId.current !== null) return;
    staticRafId.current = requestAnimationFrame(() => {
      staticRafId.current = null;
      // Eraser only ever touches strokes (see eraseWorkingRef's type) —
      // shapes are unaffected by an in-flight erase drag, always read fresh.
      const baseStrokes = eraseWorkingRef.current ?? strokesRef.current;
      paintStatic(applyLiveSelectionTransform(baseStrokes, shapesRef.current));
    });
  }, [paintStatic, applyLiveSelectionTransform]);

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
      if (liveShapeRef.current) drawShape(ctx, liveShapeRef.current);

      if (selectionPhaseRef.current === 'lasso') {
        drawLasso(ctx, lassoRef.current);
      }
      if (selectedStrokeIdsRef.current.size > 0 || selectedShapeIdsRef.current.size > 0) {
        // Selection bounds follow whichever transform is in flight (matches
        // the static layer via the same applyLiveSelectionTransform).
        const baseStrokes = eraseWorkingRef.current ?? strokesRef.current;
        const display = applyLiveSelectionTransform(baseStrokes, shapesRef.current);
        const selectedStrokes = display.strokes.filter((s) => selectedStrokeIdsRef.current.has(s.id));
        const selectedShapes = display.shapes.filter((s) => selectedShapeIdsRef.current.has(s.id));
        const b = combinedBounds(selectedStrokes, selectedShapes);
        if (b) drawSelectionRect(ctx, b);
      }
    });
  }, [applyTransform, clearDevice, applyLiveSelectionTransform]);

  // ─── Restore from storage ───────────────────────────────────────────────────

  useEffect(() => {
    // Seeded from the page-flip history cache → the seed is authoritative;
    // do not overwrite it with the (possibly staler) storage payload.
    if (initialHistoryRef.current) return;
    const restored = load();
    if (restored.strokes.length > 0 || restored.shapes.length > 0) {
      history.reset(restored);
      strokesRef.current = restored.strokes;
      shapesRef.current = restored.shapes;
      setIsEmpty(false);
      scheduleStaticRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the decode→repaint bridge pointed at the current scheduler.
  onTemplateReadyRef.current = scheduleStaticRender;

  // Repaint the static layer when the paper style or page template changes.
  useEffect(() => {
    scheduleStaticRender();
  }, [paper, templateId, scheduleStaticRender]);

  // Clear selection when switching away from the select tool.
  useEffect(() => {
    if (
      tool !== 'select' &&
      (selectedStrokeIdsRef.current.size > 0 || selectedShapeIdsRef.current.size > 0)
    ) {
      selectedStrokeIdsRef.current = new Set();
      setSelectedStrokeIds(new Set());
      selectedShapeIdsRef.current = new Set();
      setSelectedShapeIds(new Set());
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

  /** Canvas-relative SCREEN point (px). The pinch math works in screen space —
   *  its anchor formula converts to world itself — so pinch samples must be
   *  screen coords, not world (storing world double-converted the anchor and
   *  made zoom drift once panned/zoomed). */
  const getScreenPoint = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const rect = overlayRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
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
    let changed = false;
    for (const stroke of strokes) {
      const fragments = splitStrokeAtErase(stroke, x, y, radius);
      if (fragments === null) {
        survivors.push(stroke);
        continue;
      }
      changed = true;
      // A stroke that survives untouched keeps its id (selection, etc. stay
      // stable); split fragments are new strokes since neither half is "the"
      // original anymore.
      if (fragments.length === 1 && fragments[0].length === stroke.points.length) {
        survivors.push(stroke);
        continue;
      }
      for (const points of fragments) {
        survivors.push({ ...stroke, id: createId(), points });
      }
    }
    if (changed) {
      eraseWorkingRef.current = survivors;
      erasedDuringDrag.current = true;
      scheduleStaticRender();
    }
  }, [scheduleStaticRender]);

  // ─── Selection actions ──────────────────────────────────────────────────────

  const clearSelection = useCallback(() => {
    selectedStrokeIdsRef.current = new Set();
    setSelectedStrokeIds(new Set());
    selectedShapeIdsRef.current = new Set();
    setSelectedShapeIds(new Set());
    lassoRef.current = [];
    selectionPhaseRef.current = 'idle';
    setSelectionPhase('idle');
    moveOffsetRef.current = { dx: 0, dy: 0 };
    moveOriginRef.current = null;
    resizeHandleRef.current = null;
    resizePivotRef.current = null;
    resizeScaleRef.current = 1;
    rotatePivotRef.current = null;
    rotateAngleRef.current = 0;
    scheduleOverlayRender();
  }, [scheduleOverlayRender]);

  const deleteSelected = useCallback(() => {
    const strokeIds = selectedStrokeIdsRef.current;
    const shapeIds = selectedShapeIdsRef.current;
    if (strokeIds.size === 0 && shapeIds.size === 0) return;
    const nextStrokes = strokesRef.current.filter((s) => !strokeIds.has(s.id));
    const nextShapes = shapesRef.current.filter((s) => !shapeIds.has(s.id));
    selectedStrokeIdsRef.current = new Set();
    setSelectedStrokeIds(new Set());
    selectedShapeIdsRef.current = new Set();
    setSelectedShapeIds(new Set());
    selectionPhaseRef.current = 'idle';
    setSelectionPhase('idle');
    history.set({ strokes: nextStrokes, shapes: nextShapes });
    strokesRef.current = nextStrokes;
    shapesRef.current = nextShapes;
    // Committed content changed → static repaints via the history effect;
    // clear the now-stale selection rect off the overlay immediately.
    scheduleOverlayRender();
  }, [history, scheduleOverlayRender]);

  const duplicateSelected = useCallback(() => {
    const strokeIds = selectedStrokeIdsRef.current;
    const shapeIds = selectedShapeIdsRef.current;
    if (strokeIds.size === 0 && shapeIds.size === 0) return;
    const { next: nextStrokes, newIds: newStrokeIds } = duplicateStrokes(
      strokesRef.current,
      strokeIds,
      16,
      16,
    );
    const { next: nextShapes, newIds: newShapeIds } = duplicateShapes(
      shapesRef.current,
      shapeIds,
      16,
      16,
    );
    // No clones produced at all (e.g. the selection referenced content
    // removed by a prior undo) → don't burn an undo slot on a no-op.
    if (newStrokeIds.size === 0 && newShapeIds.size === 0) return;
    history.set({ strokes: nextStrokes, shapes: nextShapes });
    strokesRef.current = nextStrokes;
    shapesRef.current = nextShapes;
    selectedStrokeIdsRef.current = newStrokeIds;
    setSelectedStrokeIds(newStrokeIds);
    selectedShapeIdsRef.current = newShapeIds;
    setSelectedShapeIds(newShapeIds);
    scheduleOverlayRender();
  }, [history, scheduleOverlayRender]);

  const recolorSelected = useCallback(
    (color: string) => {
      const strokeIds = selectedStrokeIdsRef.current;
      const shapeIds = selectedShapeIdsRef.current;
      if (strokeIds.size === 0 && shapeIds.size === 0) return;
      const nextStrokes = recolorStrokes(strokesRef.current, strokeIds, color);
      const nextShapes = recolorShapes(shapesRef.current, shapeIds, color);
      // Both helpers return the same reference when their own selection is
      // empty — a real no-op only when NEITHER array actually changed.
      if (nextStrokes === strokesRef.current && nextShapes === shapesRef.current) return;
      history.set({ strokes: nextStrokes, shapes: nextShapes });
      strokesRef.current = nextStrokes;
      shapesRef.current = nextShapes;
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
    // Pair onPenEnd with an actual onPenStart: only a live pen stroke opened a
    // pen session (Learning Mode audio must never see an unmatched end).
    if (liveStrokeRef.current) {
      liveStrokeRef.current = null;
      onPenEndRef.current?.();
    }
    liveShapeRef.current = null;
    eraseWorkingRef.current = null;
    erasedDuringDrag.current = false;
    moveOffsetRef.current = { dx: 0, dy: 0 };
    moveOriginRef.current = null;
    resizeHandleRef.current = null;
    resizePivotRef.current = null;
    resizeScaleRef.current = 1;
    rotatePivotRef.current = null;
    rotateAngleRef.current = 0;
    // A cancelled lasso drops back to no selection; a cancelled move/resize/
    // rotate keeps the existing selection but drops the in-flight transform.
    // Either way, reset the phase.
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

      // ── touch gating + two-finger pinch entry ──
      if (e.pointerType === 'touch') {
        // While a pen stroke is in flight, touch is fully inert. A resting
        // palm routinely produces TWO+ contact points — without this guard the
        // pinch entry below would release the pen's capture, discard the live
        // stroke mid-word, and start zooming. Pen wins, always.
        if (
          activePointerId.current !== null &&
          activePenPointerTypeRef.current === 'pen'
        ) {
          return;
        }

        touchPointsRef.current.set(e.pointerId, getScreenPoint(e));
        if (touchPointsRef.current.size >= 2) {
          // Second finger = navigation, not ink. Discard the nascent
          // single-finger gesture (same semantics as pointercancel).
          if (activePointerId.current !== null) {
            try {
              e.currentTarget.releasePointerCapture(activePointerId.current);
            } catch { /* ignore */ }
            activePointerId.current = null;
            discardInFlightWork();
          }
          // Re-baseline on ANY finger-count change (2nd finger down, or a 3rd
          // added) so the next move never computes a delta across a jump.
          pinchPrevRef.current = currentPinchSample();
          return;
        }

        // Palm rejection gates single-finger DRAWING only. It deliberately
        // sits after the pinch entry: a write → pinch-to-zoom flow within the
        // rejection window is navigation and must not be blocked.
        if (isPalmRejected(e.pointerType)) return;
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
      if (
        activeTool !== 'pen' &&
        activeTool !== 'eraser' &&
        activeTool !== 'select' &&
        activeTool !== 'shape'
      ) {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        activePointerId.current = null;
        return;
      }

      const { x, y } = getCanvasPoint(e);

      // ── select ──
      if (activeTool === 'select') {
        // Compute current bounds from committed strokes+shapes (no in-flight
        // offset yet).
        const strokeIds = selectedStrokeIdsRef.current;
        const shapeIds = selectedShapeIdsRef.current;
        const currentBounds =
          strokeIds.size > 0 || shapeIds.size > 0
            ? combinedBounds(
                strokesRef.current.filter((s) => strokeIds.has(s.id)),
                shapesRef.current.filter((s) => shapeIds.has(s.id)),
              )
            : null;

        // Handle hit-testing takes priority over "inside the body = move" —
        // a handle sits ON or just outside the body's edge, so without this
        // ordering a corner/rotate grab would be swallowed as a move instead.
        const handle = currentBounds ? hitsSelectionHandle(currentBounds, x, y) : null;

        if (handle === 'rotate' && currentBounds) {
          const centerX = (currentBounds.minX + currentBounds.maxX) / 2;
          const centerY = (currentBounds.minY + currentBounds.maxY) / 2;
          selectionPhaseRef.current = 'rotating';
          setSelectionPhase('rotating');
          rotatePivotRef.current = { x: centerX, y: centerY };
          rotateOriginAngleRef.current = Math.atan2(y - centerY, x - centerX);
          rotateAngleRef.current = 0;
        } else if (handle && currentBounds) {
          // Pivot = the corner OPPOSITE the one grabbed (standard
          // corner-resize convention — the far corner stays put).
          const pad = 8; // must match drawSelectionRect's default pad
          const minX = currentBounds.minX - pad;
          const minY = currentBounds.minY - pad;
          const maxX = currentBounds.maxX + pad;
          const maxY = currentBounds.maxY + pad;
          const pivot =
            handle === 'nw' ? { x: maxX, y: maxY } :
            handle === 'ne' ? { x: minX, y: maxY } :
            handle === 'sw' ? { x: maxX, y: minY } :
            /* 'se' */         { x: minX, y: minY };
          selectionPhaseRef.current = 'resizing';
          setSelectionPhase('resizing');
          resizeHandleRef.current = handle;
          resizePivotRef.current = pivot;
          resizeOriginDistRef.current = Math.max(1, Math.hypot(x - pivot.x, y - pivot.y));
          resizeScaleRef.current = 1;
        } else if (currentBounds && hitsSelectionBounds(currentBounds, x, y)) {
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
          selectedStrokeIdsRef.current = new Set();
          setSelectedStrokeIds(new Set());
          selectedShapeIdsRef.current = new Set();
          setSelectedShapeIds(new Set());
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

      // ── shape ──
      if (activeTool === 'shape') {
        liveShapeRef.current = {
          id: createId(),
          type: settingsRef.current.shapeType ?? 'rect',
          color: activeColor,
          size: activeSize,
          x1: x,
          y1: y,
          x2: x,
          y2: y,
        };
        scheduleOverlayRender();
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
    [currentPinchSample, discardInFlightWork, eraseAt, getCanvasPoint, getScreenPoint, getPoint, isPalmRejected, scheduleOverlayRender],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      // ── pinch update: zoom at the midpoint, follow its drag ──
      if (
        e.pointerType === 'touch' &&
        pinchPrevRef.current &&
        touchPointsRef.current.has(e.pointerId)
      ) {
        touchPointsRef.current.set(e.pointerId, getScreenPoint(e));
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
          const nextPanX = prevMidWorldX - d.midX / scale;
          const nextPanY = prevMidWorldY - d.midY / scale;
          // Bounded page (notebook): keep the sheet horizontally centered on
          // zoom — no sideways drift; only vertical follows the pinch.
          const bounded = panBoundsRef.current;
          const cw = canvasRef.current?.clientWidth;
          const centeredPanX =
            bounded && cw != null
              ? bounded.minX - (cw / scale - (bounded.maxX - bounded.minX)) / 2
              : nextPanX;
          commitView({ scale, panX: centeredPanX, panY: nextPanY });
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

      // ONE layout read per event. getBoundingClientRect per coalesced sample
      // forces layout inside the hottest loop in the app (5–10 samples per
      // move on 120 Hz pens); the rect cannot change between samples of the
      // same event anyway.
      const rect = e.currentTarget.getBoundingClientRect();
      const toWorld = (cx: number, cy: number) =>
        screenToWorld(cx - rect.left, cy - rect.top, viewRef.current);

      // ── select ──
      if (activeTool === 'select') {
        const phase = selectionPhaseRef.current;
        if (phase === 'lasso') {
          for (const ev of samples) {
            lassoRef.current.push(toWorld(ev.clientX, ev.clientY));
          }
          scheduleOverlayRender();
        } else if (phase === 'moving' && moveOriginRef.current) {
          const last = samples[samples.length - 1];
          const w = toWorld(last.clientX, last.clientY);
          moveOffsetRef.current = {
            dx: w.x - moveOriginRef.current.x,
            dy: w.y - moveOriginRef.current.y,
          };
          // Moving shifts committed strokes visually (static) + the rect (overlay).
          scheduleStaticRender();
          scheduleOverlayRender();
        } else if (phase === 'resizing' && resizePivotRef.current) {
          const last = samples[samples.length - 1];
          const w = toWorld(last.clientX, last.clientY);
          const pivot = resizePivotRef.current;
          const dist = Math.hypot(w.x - pivot.x, w.y - pivot.y);
          // Clamp so a drag toward/through the pivot can't invert or
          // collapse the selection (scale floor), nor blow it up absurdly
          // large from a single fast drag (scale ceiling) — same spirit as
          // clampScale for the canvas zoom, just local to one selection.
          const raw = dist / resizeOriginDistRef.current;
          resizeScaleRef.current = Math.min(20, Math.max(0.05, raw));
          scheduleStaticRender();
          scheduleOverlayRender();
        } else if (phase === 'rotating' && rotatePivotRef.current) {
          const last = samples[samples.length - 1];
          const w = toWorld(last.clientX, last.clientY);
          const pivot = rotatePivotRef.current;
          const currentAngle = Math.atan2(w.y - pivot.y, w.x - pivot.x);
          rotateAngleRef.current = currentAngle - rotateOriginAngleRef.current;
          scheduleStaticRender();
          scheduleOverlayRender();
        }
        return;
      }

      // ── eraser ──
      if (activeTool === 'eraser') {
        const radius = eraserRadius(activeSize);
        for (const ev of samples) {
          const w = toWorld(ev.clientX, ev.clientY);
          eraseAt(w.x, w.y, radius);
        }
        return;
      }

      // ── shape ──
      if (activeTool === 'shape') {
        const live = liveShapeRef.current;
        if (!live) return;
        const last = samples[samples.length - 1];
        const w = toWorld(last.clientX, last.clientY);
        const snapped = snapShapeEndpoint(live.type, live.x1, live.y1, w.x, w.y, last.shiftKey);
        liveShapeRef.current = { ...live, x2: snapped.x, y2: snapped.y };
        scheduleOverlayRender();
        return;
      }

      // ── pen ──
      const live = liveStrokeRef.current;
      if (!live) return;
      const stabilize = settingsRef.current.stabilizer === true;
      for (const ev of samples) {
        const raw = toWorld(ev.clientX, ev.clientY);
        const w = stabilize ? smoothPoint(raw, smoothPrevRef.current, 0.35) : raw;
        if (stabilize) smoothPrevRef.current = w;
        const pt = buildPoint(w.x, w.y, ev.pointerType, ev.pressure, ev.tiltX ?? 0, ev.tiltY ?? 0);
        live.points.push(pt);
        onPenSampleRef.current?.(pt);
      }
      scheduleOverlayRender();
    },
    [buildPoint, commitView, currentPinchSample, eraseAt, getScreenPoint, scheduleOverlayRender, scheduleStaticRender],
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
          // of how many points were drawn or how many strokes/shapes matched.
          const matchedStrokes = new Set<string>();
          const matchedShapes = new Set<string>();
          if (lasso.length >= 3) {
            for (const stroke of strokesRef.current) {
              if (strokeInLasso(stroke, lasso)) matchedStrokes.add(stroke.id);
            }
            for (const shape of shapesRef.current) {
              if (shapeInLasso(shape, lasso)) matchedShapes.add(shape.id);
            }
          }
          selectedStrokeIdsRef.current = matchedStrokes;
          setSelectedStrokeIds(matchedStrokes);
          selectedShapeIdsRef.current = matchedShapes;
          setSelectedShapeIds(matchedShapes);
          lassoRef.current = [];
          selectionPhaseRef.current = 'idle';
          setSelectionPhase('idle');
          scheduleOverlayRender();

        } else if (phase === 'moving') {
          const { dx, dy } = moveOffsetRef.current;
          if (dx !== 0 || dy !== 0) {
            // Commit the offset to history as one undoable step, covering
            // both strokes and shapes in the selection together.
            const nextStrokes = applyMoveOffset(strokesRef.current, selectedStrokeIdsRef.current, dx, dy);
            const nextShapes = applyMoveOffsetToShapes(shapesRef.current, selectedShapeIdsRef.current, dx, dy);
            history.set({ strokes: nextStrokes, shapes: nextShapes });
            strokesRef.current = nextStrokes;
            shapesRef.current = nextShapes;
          }
          moveOffsetRef.current = { dx: 0, dy: 0 };
          moveOriginRef.current = null;
          selectionPhaseRef.current = 'idle';
          setSelectionPhase('idle');
          // Committed ink repaints via the history effect; redraw the rect at its
          // final resting place on the overlay.
          scheduleStaticRender();
          scheduleOverlayRender();

        } else if (phase === 'resizing') {
          const pivot = resizePivotRef.current;
          const scale = resizeScaleRef.current;
          if (pivot && scale !== 1) {
            const nextStrokes = applyScaleOffset(
              strokesRef.current,
              selectedStrokeIdsRef.current,
              pivot.x,
              pivot.y,
              scale,
            );
            const nextShapes = applyScaleOffsetToShapes(
              shapesRef.current,
              selectedShapeIdsRef.current,
              pivot.x,
              pivot.y,
              scale,
            );
            history.set({ strokes: nextStrokes, shapes: nextShapes });
            strokesRef.current = nextStrokes;
            shapesRef.current = nextShapes;
          }
          resizeHandleRef.current = null;
          resizePivotRef.current = null;
          resizeScaleRef.current = 1;
          selectionPhaseRef.current = 'idle';
          setSelectionPhase('idle');
          scheduleStaticRender();
          scheduleOverlayRender();

        } else if (phase === 'rotating') {
          const pivot = rotatePivotRef.current;
          const angle = rotateAngleRef.current;
          if (pivot && angle !== 0) {
            const nextStrokes = applyRotateOffset(
              strokesRef.current,
              selectedStrokeIdsRef.current,
              pivot.x,
              pivot.y,
              angle,
            );
            const nextShapes = applyRotateOffsetToShapes(
              shapesRef.current,
              selectedShapeIdsRef.current,
              pivot.x,
              pivot.y,
              angle,
            );
            history.set({ strokes: nextStrokes, shapes: nextShapes });
            strokesRef.current = nextStrokes;
            shapesRef.current = nextShapes;
          }
          rotatePivotRef.current = null;
          rotateAngleRef.current = 0;
          selectionPhaseRef.current = 'idle';
          setSelectionPhase('idle');
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
          // Eraser only ever touches strokes (shapes are deleted via
          // selection, not erased-through) — shapes pass through unchanged.
          history.set({ strokes: working, shapes: shapesRef.current });
          strokesRef.current = working;
        } else {
          scheduleStaticRender();
        }
        return;
      }

      // ── shape ──
      if (activeTool === 'shape') {
        const live = liveShapeRef.current;
        liveShapeRef.current = null;
        // A tap with no drag (x1===x2 && y1===y2) commits nothing — an
        // invisible zero-size shape would be a confusing, undo-able no-op.
        if (!live || (live.x1 === live.x2 && live.y1 === live.y2)) {
          scheduleOverlayRender();
          return;
        }
        const nextShapes = [...shapesRef.current, live];
        history.set({ strokes: strokesRef.current, shapes: nextShapes });
        shapesRef.current = nextShapes;
        scheduleOverlayRender();
        return;
      }

      // ── pen ──
      const live = liveStrokeRef.current;
      liveStrokeRef.current = null;
      // onPenEnd only if a pen session actually opened (paired with onPenStart).
      if (live) onPenEndRef.current?.();
      if (!live || live.points.length === 0) {
        scheduleOverlayRender(); // clear any partial live stroke
        return;
      }

      const nextStrokes = [...strokesRef.current, live];
      history.set({ strokes: nextStrokes, shapes: shapesRef.current });
      strokesRef.current = nextStrokes;
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
    // Drop any in-flight gesture first. A clear tapped mid-erase-drag would
    // otherwise resurrect the PRE-clear array on pointerup: the erase working
    // copy holds the old strokes and endGesture commits it wholesale.
    if (liveStrokeRef.current) {
      liveStrokeRef.current = null;
      onPenEndRef.current?.();
    }
    liveShapeRef.current = null;
    eraseWorkingRef.current = null;
    erasedDuringDrag.current = false;
    selectedStrokeIdsRef.current = new Set();
    setSelectedStrokeIds(new Set());
    selectedShapeIdsRef.current = new Set();
    setSelectedShapeIds(new Set());
    selectionPhaseRef.current = 'idle';
    setSelectionPhase('idle');
    lassoRef.current = [];
    moveOffsetRef.current = { dx: 0, dy: 0 };
    moveOriginRef.current = null;
    resizeHandleRef.current = null;
    resizePivotRef.current = null;
    resizeScaleRef.current = 1;
    rotatePivotRef.current = null;
    rotateAngleRef.current = 0;
    history.set({ strokes: [], shapes: [] });
    strokesRef.current = [];
    shapesRef.current = [];
  }, [history]);

  // Whenever committed content changes (draw/undo/redo/erase/move/delete/clear),
  // repaint, resync empty flag, and persist to localStorage.
  const hydratedRef = useRef(false);
  useEffect(() => {
    strokesRef.current = history.present.strokes;
    shapesRef.current = history.present.shapes;
    setIsEmpty(history.present.strokes.length === 0 && history.present.shapes.length === 0);

    // Reconcile the selection with the new content. undo/redo can bring back
    // a state where selected strokes/shapes no longer exist (or remove them
    // again); without this the selection toolbar floats over phantom bounds
    // and the mutating actions operate on ids that aren't on the canvas.
    const reconciledStrokes = reconcileSelection(selectedStrokeIdsRef.current, history.present.strokes);
    const reconciledShapes = reconcileShapeSelection(selectedShapeIdsRef.current, history.present.shapes);
    let selectionChanged = false;
    if (reconciledStrokes !== selectedStrokeIdsRef.current) {
      const next = reconciledStrokes as Set<string>;
      selectedStrokeIdsRef.current = next;
      setSelectedStrokeIds(next);
      selectionChanged = true;
    }
    if (reconciledShapes !== selectedShapeIdsRef.current) {
      const next = reconciledShapes as Set<string>;
      selectedShapeIdsRef.current = next;
      setSelectedShapeIds(next);
      selectionChanged = true;
    }
    if (
      selectionChanged &&
      selectedStrokeIdsRef.current.size === 0 &&
      selectedShapeIdsRef.current.size === 0
    ) {
      selectionPhaseRef.current = 'idle';
      setSelectionPhase('idle');
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

  /** Recenter + zoom so `bounds` fills the viewport with a comfortable margin.
   *  `null`/empty bounds (nothing drawn yet) falls back to `reset()` — there's
   *  nothing to fit, so 100%/origin is the sane default. */
  const zoomToFit = useCallback(
    (bounds: Bounds | null) => {
      const canvas = overlayRef.current;
      if (!bounds || !canvas) {
        commitView(IDENTITY_VIEW);
        return;
      }
      const contentW = bounds.maxX - bounds.minX;
      const contentH = bounds.maxY - bounds.minY;
      if (contentW <= 0 || contentH <= 0) {
        commitView(IDENTITY_VIEW);
        return;
      }
      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      const FIT_MARGIN = 0.9; // leave ~10% breathing room around the content
      const rawScale = Math.min((vw / contentW) * FIT_MARGIN, (vh / contentH) * FIT_MARGIN);
      const scale = clampScale(rawScale, zoomRangeRef.current);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      commitView({ scale, panX: cx - vw / 2 / scale, panY: cy - vh / 2 / scale });
    },
    [commitView],
  );

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
        // On a bounded page (notebook), the sheet is glued: no horizontal drift
        // — it stays centered — and the wheel only scrolls DOWN the page, like
        // reading real paper. The infinite canvas still pans both axes.
        const bounded = panBoundsRef.current !== null;
        const dx = bounded ? 0 : e.shiftKey ? e.deltaY : e.deltaX;
        const dy = bounded ? e.deltaY : e.shiftKey ? 0 : e.deltaY;
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
      selectedStrokeIds,
      selectedShapeIds,
      bounds: selectionBounds,
      clearSelection,
      deleteSelected,
      duplicateSelected,
      recolorSelected,
    }),
    [
      selectionPhase,
      selectedStrokeIds,
      selectedShapeIds,
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
      zoomToFit,
    }),
    [view.scale, view.panX, view.panY, zoomBy, panBy, resetView, zoomToFit],
  );

  return useMemo<UseDrawingResult>(
    () => ({
      canvasRef,
      overlayRef,
      strokes: history.present.strokes,
      shapes: history.present.shapes,
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
      viewState,
      history.snapshot,
      scrollToKeepVisible,
    ],
  );
}