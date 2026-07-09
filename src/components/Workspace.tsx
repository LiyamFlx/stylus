import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from './Canvas';
import { Toolbar } from './Toolbar';
import { ConfirmDialog } from './Dialog';
import { StudioPanel } from './StudioPanel';
import { TextLayer } from './TextLayer';
import { ReplayOverlay } from './ReplayOverlay';
import { ImageLayer } from './ImageLayer';
import { Toaster } from './Toaster';
import { toast } from '../lib/toast';
import { InputMethodGroup } from './ToolbarInputMethods';
import { BrandFooter } from './Brand';
import { MenuIcon } from './icons';
import { useDrawing } from '../hooks/useDrawing';
import { useMusicMode } from '../hooks/useMusicMode';
import { useLearningAudio } from '../hooks/useLearningAudio';
import { KandinskyWelcome, KandinskyPulses } from './KandinskyOverlay';
import { SelectionToolbar } from './SelectionToolbar';
import type { RefineAction } from '../lib/ai';
import { copyText } from '../lib/clipboard';
import { createId } from '../lib/id';
import { useEditingPrefs } from '../lib/editingPrefsContext';
import { loadStrokes } from '../hooks/useLocalStorage';
import { useRecognition } from '../hooks/useRecognition';
import { useScanmarkerScanner } from '../hooks/useScanmarkerScanner';
import { useBluetoothStylus } from '../hooks/useBluetoothStylus';
import { A4_BOUNDS, eraserRadius, worldToScreen } from '../lib/geometry';
import { effectiveTouchAction, modeConfig } from '../lib/modes';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { importChunk } from '../lib/chunkReload';
import {
  inkKey,
  listPages,
  pushCustomColor,
  readCustomColors,
  pageInkKey,
  readAux,
  readPageAux,
  setPagePaper,
  touchDocument,
  writeAux,
  writePageAux,
} from '../lib/documents';
import type { HistorySnapshot } from '../hooks/useHistory';
import type { AppMode, ToolbarVariant } from '../lib/modes';
import type { ImageItem, RulingDensity, PaperStyle, Stroke, TextItem } from '../types';

interface WorkspaceProps {
  documentId: string;
  documentName: string;
  stabilizer: boolean;
  nightMode: boolean;
  onOpenSidebar: () => void;
  /**
   * NoteWorkspace.tsx mode (Phase 1): the active page. When set, strokes persist under
   * pageInkKey and texts under pageAuxKey; `pagePaper` seeds the paper state
   * from PageMeta. The engine stays page-agnostic — this component just hands
   * it a different storageKey. Workspace is keyed by `${docId}:${pageId}` in
   * App, so a page flip is a remount (same pattern as doc switching).
   */
  pageId?: string | null;
  pagePaper?: PaperStyle;
  /** Page navigation UI, built in App where page state lives. */
  pageNav?: React.ReactNode;
  /** Mode color palette (ModeConfig.paletteOverride) — closed set when given. */
  paletteOverride?: readonly string[];
  /** Base toolbar composition from ModeConfig; exam lock overrides to
   *  'restricted' locally. */
  toolbarVariant?: ToolbarVariant;
  /** The document's mode (Phase 2): drives touch-action and orientation. Text
   *  entry uses the active box's real <textarea> (native OS keyboard on phones). */
  appMode?: AppMode;
  /** Undo/redo seed from the page-flip history cache. */
  initialHistory?: HistorySnapshot<Stroke[]>;
  /** Called on unmount so App can cache this page's undo/redo stacks. */
  onHistorySnapshot?: (pageId: string, snap: HistorySnapshot<Stroke[]>) => void;
  /** Exam lock, owned by App so it survives page-flip remounts. */
  examLock?: boolean;
  onToggleExamLock?: () => void;
  /** Report distraction-free (chrome hidden) so App can also hide the mode
   *  tabs, which live outside this component. */
  onChromeHiddenChange?: (hidden: boolean) => void;
}

const textId = () => createId('t_');

/**
 * The document editor. Re-mounted per document (keyed by id in App), so each
 * document loads its own strokes (via useDrawing's storage key) and its own
 * paper + text items (from the aux store).
 */
export function Workspace({
  documentId,
  documentName,
  stabilizer,
  nightMode,
  onOpenSidebar,
  pageId = null,
  pagePaper,
  pageNav,
  paletteOverride,
  toolbarVariant = 'full',
  appMode = 'canvas',
  initialHistory,
  onHistorySnapshot,
  examLock = false,
  onToggleExamLock,
  onChromeHiddenChange,
}: WorkspaceProps) {
  const {
    tool,
    color,
    size,
    penType,
    setTool: onToolChange,
    setColor: onColorChange,
    setSize: onSizeChange,
    setPenType: onPenTypeChange,
  } = useEditingPrefs();

  // NoteWorkspace.tsx pages read per-page aux (texts + images) + PageMeta paper;
  // single-array docs keep the per-doc aux exactly as before.
  const initialAux = useRef(
    (() => {
      if (!pageId) return readAux(documentId);
      const aux = readPageAux(documentId, pageId);
      return {
        // Fall back to the MODE's default paper (noteWorkspace.tsx → cream ruled page
        // with a red margin), not a hardcoded 'ruled' — that bug left new
        // noteWorkspace.tsx pages showing plain grey rules on the dark canvas instead
        // of the exercise-Workspace.tsx page.
        paper: pagePaper ?? modeConfig(appMode).defaultPaper,
        texts: aux.texts,
        // Images MUST load here too. The old page branch dropped them: every
        // remount (i.e. every page flip) reset images to [], and the next aux
        // write persisted that empty array over the stored ones — silent,
        // permanent loss of any image pasted onto a page.
        images: aux.images ?? [],
      };
    })(),
  ).current;
  const [paper, setPaper] = useState<PaperStyle>(initialAux.paper);
  // Ruling density for 'noteWorkspace.tsx' paper (Phase 1 item 4). State lives here so
  // the exam-lock/toolbar work (item 7) can surface a picker without touching
  // the engine; persistence rides with PageMeta when the picker lands.
  const [ruling] = useState<RulingDensity>('college');
  const [texts, setTexts] = useState<TextItem[]>(initialAux.texts);
  const [images, setImages] = useState<ImageItem[]>(initialAux.images ?? []);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);

  // A palette override is a closed set: if the sticky editing-prefs color
  // isn't in it (e.g. white ink from a canvas doc, invisible on cream paper),
  // snap to the palette's first entry once on mount.
  useEffect(() => {
    if (paletteOverride && !paletteOverride.includes(color)) {
      onColorChange(paletteOverride[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exam lock (item 7) is owned by App (it must survive the per-page remount);
  // here it just drives the toolbar variant. Distraction-free (item 8) is local:
  // one boolean, chrome fades via CSS — not a separate component tree.
  const [chromeHidden, setChromeHidden] = useState(false);
  useEffect(() => {
    if (!chromeHidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChromeHidden(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chromeHidden]);

  // Let App hide the mode tabs (rendered outside Workspace) in distraction-free.
  useEffect(() => {
    onChromeHiddenChange?.(chromeHidden);
    return () => onChromeHiddenChange?.(false);
  }, [chromeHidden, onChromeHiddenChange]);

  const removeImage = useCallback((id: string) => {
    setImages((imgs) => {
      const target = imgs.find((i) => i.id === id);
      if (target) {
        void import('../lib/imageStore').then((m) => m.deleteImages([target.imageId]));
      }
      return imgs.filter((i) => i.id !== id);
    });
  }, []);

  // Stroke replay (Phase 3 item 6).
  const [replayOpen, setReplayOpen] = useState(false);

  // Canvas Mode custom palette (Phase 3 item 3) — per-doc, capped, persisted.
  const [customColors, setCustomColors] = useState<string[]>(() =>
    readCustomColors(documentId),
  );
  const saveCustomColor = useCallback(
    (hex: string) => setCustomColors(pushCustomColor(documentId, hex)),
    [documentId],
  );

  const music = useMusicMode();
  const learningAudio = useLearningAudio();

  const drawing = useDrawing({
    tool,
    color,
    size,
    paper,
    ruling,
    penType,
    stabilizer,
    storageKey: pageId ? pageInkKey(documentId, pageId) : inkKey(documentId),
    // NoteWorkspace.tsx pages are A4-shaped: pan can't take the page fully off-screen.
    panBounds: pageId ? A4_BOUNDS : null,
    zoomRange: modeConfig(appMode).zoomRange,
    initialHistory,
    onStrokeEnd: (stroke: Stroke) => {
      // Ink edits must bump the doc's recency: switchToMode picks documents by
      // updatedAt, and a pure-ink session would otherwise never register.
      touchDocument(documentId, Date.now());
      const el = drawing.canvasRef.current;
      music.handleStrokeEnd(
        stroke,
        drawing.view,
        el?.clientWidth ?? window.innerWidth,
        el?.clientHeight ?? window.innerHeight,
      );
    },
    // Learning Mode: live per-sample velocity → audio braking.
    onPenStart: learningAudio.onStrokeStart,
    onPenSample: learningAudio.onSample,
    onPenEnd: learningAudio.onStrokeEnd,
  });
  const recognition = useRecognition();

  // useDrawing returns a fresh object every render, so depending on it directly
  // in effects re-binds their listeners on every pointer-move frame. Route it
  // through a ref instead and keep the effect deps on stable primitives.
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;

  // NoteWorkspace.tsx page-flip history cache: capture this page's undo/redo stacks at
  // unmount (page flip = remount with a new key). Reads through refs so the
  // cleanup closure never goes stale; empty deps = runs exactly once.
  const snapshotCbRef = useRef(onHistorySnapshot);
  snapshotCbRef.current = onHistorySnapshot;
  const pageIdRef = useRef(pageId);
  pageIdRef.current = pageId;
  useEffect(() => {
    return () => {
      const pid = pageIdRef.current;
      const cb = snapshotCbRef.current;
      if (pid && cb) cb(pid, drawingRef.current.getHistorySnapshot());
    };
  }, []);

  // Surface an audio-load failure (offline / stale chunk) instead of a silently
  // dead toggle button.
  useEffect(() => {
    if (music.loadError) {
      toast.error("Couldn't load music mode — check your connection and retry.");
    }
  }, [music.loadError]);

  useEffect(() => {
    if (learningAudio.loadError) {
      toast.error("Couldn't load Learning Mode audio — check your connection and retry.");
    }
  }, [learningAudio.loadError]);

  // Reconcile the melody with the strokes still on the canvas. When a stroke is
  // erased, deleted, undone, or moved away, drop/refresh its melody entry so the
  // sweep never fires a phantom note or glows a deleted shape.
  useEffect(() => {
    if (!music.enabled) return;
    music.syncMelody(new Set(drawing.strokes.map((s) => s.id)));
    // Depend on the specific stable members, not the whole `music` object —
    // useMusicMode returns a fresh object each render, which would otherwise
    // run this on every re-render instead of only on stroke changes. Both
    // `enabled` and `syncMelody` (a useCallback) are the only members read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.strokes, music.enabled, music.syncMelody]);

  const [panelOpen, setPanelOpen] = useState(false);

  // Persist paper + text items to the document's aux store (skip first run —
  // we just loaded these values).
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (pageId) {
      writePageAux(documentId, pageId, { texts, images });
      setPagePaper(documentId, pageId, paper);
    } else {
      writeAux(documentId, { paper, texts, images });
    }
    touchDocument(documentId, Date.now());
  }, [documentId, pageId, paper, texts, images]);

  /* ------------------------------- text edit ------------------------------ */

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeTextId;

  const createText = useCallback(
    (x: number, y: number) => {
      const item: TextItem = {
        id: textId(),
        x,
        y,
        text: '',
        color,
        size: Math.max(20, size * 4),
      };
      setTexts((t) => [...t, item]);
      setActiveTextId(item.id);
    },
    [color, size],
  );

  // Full-value replacement for the hidden textarea (IME/autocorrect emit
  // value changes, not per-character keys).
  const setActiveText = useCallback((next: string) => {
    const id = activeIdRef.current;
    if (!id) return;
    setTexts((t) => t.map((it) => (it.id === id ? { ...it, text: next } : it)));
  }, []);

  const editActive = useCallback((fn: (text: string) => string) => {
    const id = activeIdRef.current;
    if (!id) return;
    setTexts((t) => t.map((it) => (it.id === id ? { ...it, text: fn(it.text) } : it)));
  }, []);

  /* --------------------- hardware input: scanner + stylus ----------------- */

  // Drop point for programmatic text (scan / paste): a spot near the top-centre
  // of the CURRENT VIEWPORT, converted to world coords. Text items live in
  // world space — computing this from raw clientWidth (screen px) placed boxes
  // at world (w/2, 96), which is off-screen the moment the view is panned or
  // zoomed. A notebook page is ALWAYS panned once you've written anything
  // (auto-scroll), so pasted text silently vanished above the fold.
  // Staggered so repeated drops don't stack on the same spot.
  const scanCount = useRef(0);
  const nextDropPoint = useCallback(() => {
    const d = drawingRef.current;
    const el = d.canvasRef.current;
    const view = d.view;
    const sw = el?.clientWidth ?? window.innerWidth; // screen px
    const offset = (scanCount.current++ % 8) * 28; // screen px
    return {
      x: view.panX + Math.max(16, sw / 2 - 120) / view.scale,
      y: view.panY + (96 + offset) / view.scale,
    };
  }, []);

  // A scan drops a finished text box onto the canvas.
  const handleScan = useCallback(
    (scannedText: string) => {
      const text = scannedText.trim();
      if (!text) return;
      const { x, y } = nextDropPoint();
      setTexts((t) => [
        ...t,
        { id: textId(), x, y, text, color, size: Math.max(20, size * 4) },
      ]);
    },
    [color, size, nextDropPoint],
  );

  const scanner = useScanmarkerScanner(handleScan);
  const stylus = useBluetoothStylus();

  // Drop pasted clipboard text onto the canvas. If a text box is being edited,
  // append into it; otherwise place a new finished box (staggered like scans).
  const pasteText = useCallback(
    (pasted: string) => {
      const text = pasted.replace(/\r\n/g, '\n');
      if (!text.trim()) return;
      if (activeIdRef.current) {
        editActive((t) => t + text);
        return;
      }
      const { x, y } = nextDropPoint();
      const item: TextItem = {
        id: textId(),
        x,
        y,
        text,
        color,
        size: Math.max(20, size * 4),
      };
      setTexts((t) => [...t, item]);
      setActiveTextId(item.id);
    },
    [color, size, editActive, nextDropPoint],
  );

  const moveText = useCallback((id: string, x: number, y: number) => {
    setTexts((t) => t.map((it) => (it.id === id ? { ...it, x, y } : it)));
  }, []);

  // Drop a text box that was placed but left empty.
  const pruneEmpty = useCallback(() => {
    setTexts((t) => t.filter((it) => it.text.trim() !== ''));
  }, []);

  const finishText = useCallback(() => {
    pruneEmpty();
    setActiveTextId(null);
    onToolChange('pen');
  }, [pruneEmpty, onToolChange]);

  // Leaving the text tool prunes any empty box and deselects.
  useEffect(() => {
    if (tool !== 'text') {
      setActiveTextId(null);
      pruneEmpty();
    }
  }, [tool, pruneEmpty]);

  // Deselecting a box (tap empty space) drops it if it was left empty — no
  // stray zero-content boxes accumulate.
  useEffect(() => {
    if (activeTextId === null) pruneEmpty();
  }, [activeTextId, pruneEmpty]);

  /* --------------------------- export + recognize ------------------------- */

  const exportOpts = useCallback(() => {
    const canvas = drawing.canvasRef.current;
    return {
      width: canvas?.clientWidth ?? window.innerWidth,
      height: canvas?.clientHeight ?? window.innerHeight,
      paper,
      texts,
    };
  }, [drawing.canvasRef, paper, texts]);

  const handleExportPNG = useCallback(async () => {
    const mod = await importChunk(() => import('../lib/export'));
    if (appMode === 'mobile') {
      // Phone-native: OS share sheet first, download only when unsupported.
      const { shareFile } = await import('../lib/share');
      const blob = await mod.buildPNGBlob(drawing.strokes, exportOpts());
      if (await shareFile(blob, 'stylus.png')) return;
    }
    mod.exportPNG(drawing.strokes, exportOpts());
  }, [appMode, drawing.strokes, exportOpts]);

  const handleExportPDF = useCallback(async () => {
    const mod = await importChunk(() => import('../lib/export'));
    if (!pageId) {
      if (appMode === 'mobile') {
        const { shareFile } = await import('../lib/share');
        const blob = mod.buildPDFBlob(drawing.strokes, exportOpts());
        if (await shareFile(blob, 'stylus.pdf')) return;
      }
      mod.exportPDF(drawing.strokes, exportOpts());
      return;
    }
    // NoteWorkspace.tsx doc: one true-A4 PDF page per noteWorkspace.tsx page. Only the active
    // page lives in memory — every other page's ink/texts load from storage.
    // FULL, unculled reads by design: this is an export, not a viewport paint
    // (see RenderOptions.cull). Loading stays inside this async chunk
    // boundary so a large noteWorkspace.tsx never blocks the UI thread.
    const pages = listPages(documentId).map((p) => ({
      strokes:
        p.id === pageId ? drawing.strokes : loadStrokes(pageInkKey(documentId, p.id)),
      paper: p.paper,
      ruling,
      texts: p.id === pageId ? texts : readPageAux(documentId, p.id).texts,
    }));
    mod.exportPDFPages(pages);
  }, [pageId, appMode, documentId, ruling, texts, drawing.strokes, exportOpts]);

  const handleRecognize = useCallback(() => {
    setPanelAutoAction(null);
    setPanelOpen(true);
    // Recognition OCRs ink strokes only. If there's no ink, give an accurate
    // message instead of falsely claiming the canvas is empty when there are
    // typed text boxes (which are already digital text).
    if (drawing.strokes.length === 0) {
      recognition.fail(
        texts.some((t) => t.text.trim())
          ? 'No handwriting to convert — typed text is already digital text.'
          : 'Nothing to recognize — the canvas is empty.',
      );
      return;
    }
    void recognition.recognize(drawing.strokes);
  }, [drawing.strokes, recognition, texts]);

  // Bumped whenever a new selection-recognition request starts. Async handlers
  // capture their generation and bail if it's been superseded — so a result
  // from a since-changed selection never acts on the wrong strokes.
  const requestGen = useRef(0);

  // Copy the recognized text of the current lasso selection to the clipboard.
  const handleCopySelection = useCallback(async () => {
    const ids = drawing.selection.selectedIds;
    const selected = drawing.strokes.filter((s) => ids.has(s.id));
    if (selected.length === 0) return;
    const gen = ++requestGen.current;
    try {
      const { recognizeText } = await importChunk(() => import('../lib/recognition'));
      const { text } = await recognizeText(selected);
      if (gen !== requestGen.current) return; // selection changed mid-flight
      if (!text.trim()) {
        toast.error('Nothing to copy — no handwriting recognized in the selection.');
        return;
      }
      const ok = await copyText(text);
      if (gen !== requestGen.current) return;
      if (ok) toast.success('Copied recognized text');
      else toast.error("Couldn't copy to the clipboard.");
    } catch {
      if (gen === requestGen.current) toast.error("Couldn't copy — recognition failed.");
    }
  }, [drawing.selection.selectedIds, drawing.strokes]);

  // AI action to auto-run in the studio panel once recognition lands (set by
  // the selection toolbar's Ask Stylus / Translate). null = manual studio.
  const [panelAutoAction, setPanelAutoAction] = useState<RefineAction | null>(null);

  const selectedStrokes = useCallback(() => {
    const ids = drawing.selection.selectedIds;
    return drawing.strokes.filter((s) => ids.has(s.id));
  }, [drawing.selection.selectedIds, drawing.strokes]);

  // Open the studio on the current selection and (optionally) auto-run an AI
  // action (Ask Stylus / Translate). Falls back to the whole canvas when the
  // selection is empty, matching the toolbar Convert behaviour.
  const runSelectionAI = useCallback(
    (action: RefineAction | null) => {
      const selected = selectedStrokes();
      const strokes = selected.length > 0 ? selected : drawing.strokes;
      setPanelOpen(true);
      if (strokes.length === 0) {
        // No ink → don't leave an unfulfillable auto-action queued for a later
        // successful recognition to pick up.
        setPanelAutoAction(null);
        recognition.fail('Nothing to recognize — the selection is empty.');
        return;
      }
      setPanelAutoAction(action);
      void recognition.recognize(strokes);
    },
    [selectedStrokes, drawing.strokes, recognition],
  );

  const handleAskSelection = useCallback(() => runSelectionAI('ask'), [runSelectionAI]);
  const handleTranslateSelection = useCallback(
    () => runSelectionAI('translate'),
    [runSelectionAI],
  );

  // Convert the selection to a typed text box on the canvas.
  const handleConvertSelection = useCallback(async () => {
    const selected = selectedStrokes();
    if (selected.length === 0) {
      handleRecognize();
      return;
    }
    const gen = ++requestGen.current;
    try {
      const { recognizeText } = await importChunk(() => import('../lib/recognition'));
      const { text } = await recognizeText(selected);
      if (gen !== requestGen.current) return; // selection changed mid-flight
      if (!text.trim()) {
        toast.error('No handwriting recognized in the selection.');
        return;
      }
      // Switch to the text tool so the pasted box is actually editable — the
      // active textarea only mounts in text mode (matches the paste handler).
      onToolChange('text');
      pasteText(text);
    } catch {
      if (gen === requestGen.current) toast.error("Couldn't convert — recognition failed.");
    }
  }, [selectedStrokes, handleRecognize, pasteText, onToolChange]);

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const handleClear = useCallback(() => {
    if (drawing.isEmpty && texts.length === 0) return;
    setClearConfirmOpen(true);
  }, [drawing.isEmpty, texts.length]);

  const confirmClear = useCallback(() => {
    drawing.clear();
    setTexts([]);
    music.resetMelody();
    setClearConfirmOpen(false);
  }, [drawing, music]);

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelAutoAction(null);
    recognition.reset();
  }, [recognition]);

  const handlePlayToggle = useCallback(() => {
    const el = drawing.canvasRef.current;
    music.togglePlayback(drawing.view, el?.clientWidth ?? window.innerWidth);
  }, [drawing.canvasRef, drawing.view, music]);

  /* ------------------------------- zoom + pan ----------------------------- */
  // Wheel/pinch zoom + pan are handled by a native listener in useDrawing; the
  // controls below drive zoom from the toolbar cluster.

  const { scale, zoomBy, reset: resetView } = drawing.view;

  /* --------------------------- keyboard shortcuts ------------------------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const drawing = drawingRef.current;
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      const meta = e.metaKey || e.ctrlKey;

      // Text entry lives in the active box's real <textarea> (see TextLayer).
      // While it has focus the `typing` guard below skips these window-level
      // tool shortcuts, so typing never triggers them.

      if (!meta) {
        if (typing) return;
        // Delete / Backspace removes selected strokes when the select tool is active.
        if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select') {
          e.preventDefault();
          drawing.selection.deleteSelected();
          return;
        }
        if (e.key === 'Escape' && tool === 'select') {
          drawing.selection.clearSelection();
          return;
        }
        if (e.key === 'e') onToolChange('eraser');
        if (e.key === 'p' || e.key === 'b') onToolChange('pen');
        if (e.key === 't') onToolChange('text');
        if (e.key === 's') onToolChange('select');
        return;
      }
      // While typing in a real field (e.g. the AI studio editor), let the
      // browser handle ⌘Z / ⌘⇧Z natively so it undoes the text, not the canvas.
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        drawing.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        drawing.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, onToolChange]);

  // Paste clipboard text onto the canvas (Cmd/Ctrl+V, right-click → Paste).
  // When the paste targets a real input/textarea/contenteditable (e.g. the AI
  // studio editor), let the browser handle it natively.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Exam lock strips the toolbar and page nav — the clipboard must not
      // remain an open side door for dropping external text/images onto a
      // locked page. (The Scanmarker scanner stays live: hardware scanning is
      // a sanctioned accessibility input during exams.)
      if (examLock) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Image paste (Phase 3 item 5): bytes -> IndexedDB, metadata -> aux.
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (file) {
        e.preventDefault();
        void (async () => {
          const { putImage } = await import('../lib/imageStore');
          const imageId = createId('img_');
          await putImage(imageId, file);
          // Natural size, fitted into the viewport center, in world coords.
          const bmp = await createImageBitmap(file).catch(() => null);
          const view = drawingRef.current.view;
          const el = drawingRef.current.canvasRef.current;
          const vw = (el?.clientWidth ?? 800) / view.scale;
          const vh = (el?.clientHeight ?? 600) / view.scale;
          const natW = bmp?.width ?? 400;
          const natH = bmp?.height ?? 300;
          bmp?.close();
          const fit = Math.min((vw * 0.7) / natW, (vh * 0.7) / natH, 1);
          const w = natW * fit;
          const h = natH * fit;
          setImages((imgs) => [
            ...imgs,
            {
              id: createId('iu_'),
              imageId,
              x: view.panX + (vw - w) / 2,
              y: view.panY + (vh - h) / 2,
              w,
              h,
            },
          ]);
        })();
        return;
      }

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      // Pasting activates the text tool so the new box is editable.
      if (tool !== 'text') onToolChange('text');
      pasteText(text);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [tool, onToolChange, pasteText, examLock]);

  const isBlank = drawing.isEmpty && texts.length === 0;
  const touchAction = effectiveTouchAction(appMode, tool);
  // Portrait-only by spec (item 9): overlay, not a landscape layout — but ONLY
  // on actual phones. A desktop is always "landscape"; without the coarse-
  // pointer + small-screen guard, opening a Quick note on a laptop wrongly
  // demanded "rotate your device".
  const isLandscape = useMediaQuery('(orientation: landscape)');
  const isPhone = useMediaQuery('(pointer: coarse) and (max-width: 820px)');
  const showRotateOverlay = appMode === 'mobile' && isLandscape && isPhone;

  // Cursor tracks both tool and selection phase so it's always accurate.
  const canvasCursor = (() => {
    if (tool === 'eraser') return 'none';
    if (tool === 'select') {
      if (drawing.selection.phase === 'moving') return 'grabbing';
      if (drawing.selection.selectedIds.size > 0) return 'grab';
      return 'crosshair'; // lasso phase or idle with no selection
    }
    if (tool === 'text') return 'text';
    return 'crosshair';
  })();

  return (
    <main className="relative h-full w-full overflow-hidden bg-bg">
      {/* Reference underlay — beneath the ink, never exported. */}
      <ImageLayer items={images} view={drawing.view} onRemove={removeImage} />

      <Canvas
        baseCanvasRef={drawing.canvasRef}
        overlayCanvasRef={drawing.overlayRef}
        tool={tool}
        eraserRadius={eraserRadius(size)}
        scale={drawing.view.scale}
        cursor={canvasCursor}
        touchAction={touchAction}
        onPointerDown={drawing.onPointerDown}
        onPointerMove={drawing.onPointerMove}
        onPointerUp={drawing.onPointerUp}
        onPointerCancel={drawing.onPointerCancel}
      />

      {/* Night Mode: a warm, dimming tint over the canvas + ink only. Sits above
          the canvas (z-10) but below the toolbars/dialogs/toasts/tour (z-20+),
          so UI chrome stays un-tinted and readable. pointer-events-none keeps
          drawing unaffected. */}
      {nightMode && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{ backgroundColor: 'rgba(255, 170, 80, 0.10)', mixBlendMode: 'multiply' }}
        />
      )}

      <TextLayer
        items={texts}
        activeId={activeTextId}
        tool={tool}
        view={drawing.view}
        onCreate={createText}
        onSelect={setActiveTextId}
        onMove={moveText}
        onEdit={setActiveText}
        onDone={finishText}
        onActiveExtent={drawing.scrollToKeepVisible}
      />

      {tool === 'select' && (
        <SelectionToolbar
          bounds={drawing.selection.bounds}
          selectedCount={drawing.selection.selectedIds.size}
          phase={drawing.selection.phase}
          view={drawing.view}
          onDelete={drawing.selection.deleteSelected}
          onDuplicate={drawing.selection.duplicateSelected}
          onRecolor={drawing.selection.recolorSelected}
          onCopy={handleCopySelection}
          onConvert={handleConvertSelection}
          onAsk={handleAskSelection}
          onTranslate={handleTranslateSelection}
          busy={recognition.status === 'loading'}
        />
      )}

      {/* Chrome layer — distraction-free fades it out as one unit and kills
          pointer events on everything inside (children set their own
          pointer-events, hence the descendant override). */}
      <div
        className={
          chromeHidden
            ? 'pointer-events-none opacity-0 transition-opacity duration-300 [&_*]:!pointer-events-none'
            : 'transition-opacity duration-300'
        }
        aria-hidden={chromeHidden}
      >
      {/* Brand + sidebar opener + current document name. The logo mark gives
          the app identity here (it used to be a never-rendered BrandHeader);
          the doc-name pill carries the wordmark + current document. */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          aria-label="Open menu"
          title="Open menu"
          data-tour="menu"
          onClick={onOpenSidebar}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-muted/80 text-ink-900 shadow-pop backdrop-blur-pill"
        >
          <MenuIcon size={22} />
        </button>
        <button
          type="button"
          title={documentName}
          aria-label={`Current document: ${documentName}. Open menu`}
          onClick={onOpenSidebar}
          className="hidden h-11 max-w-[24vw] items-center truncate rounded-full border border-border bg-bg-muted/80 px-4 text-sm font-medium text-ink-700 shadow-pop backdrop-blur-pill sm:flex"
        >
          <span className="truncate">{documentName}</span>
        </button>
      </div>

      <Toolbar
        paletteOverride={paletteOverride}
        variant={examLock ? 'restricted' : toolbarVariant}
        position="top"
        onReplay={appMode === 'canvas' ? () => setReplayOpen(true) : undefined}
        enableColorWheel={appMode === 'canvas'}
        customColors={customColors}
        onCustomColor={saveCustomColor}
        examLock={examLock}
        onToggleExamLock={onToggleExamLock}
        onHideChrome={() => setChromeHidden(true)}
        tool={tool}
        color={color}
        size={size}
        penType={penType}
        paper={paper}
        canUndo={drawing.canUndo}
        canRedo={drawing.canRedo}
        isEmpty={drawing.isEmpty && texts.length === 0}
        recognizing={recognition.status === 'loading'}
        onToolChange={onToolChange}
        onColorChange={onColorChange}
        onSizeChange={onSizeChange}
        onPenTypeChange={onPenTypeChange}
        onPaperSelect={setPaper}
        onUndo={drawing.undo}
        onRedo={drawing.redo}
        onClear={handleClear}
        onRecognize={handleRecognize}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
        inputMethodGroup={
          <InputMethodGroup scanner={scanner} stylus={stylus} />
        }
        musicMode={music.enabled}
        onToggleMusic={music.toggleMusicMode}
        learningMode={learningAudio.enabled}
        onToggleLearning={learningAudio.toggle}
        playing={music.playing}
        onPlayToggle={handlePlayToggle}
        palette={music.palette}
        onCyclePalette={music.cyclePalette}
      />

      <StudioPanel
        open={panelOpen}
        status={recognition.status}
        text={recognition.text}
        recognitionError={recognition.error}
        autoAction={panelAutoAction}
        onClose={handleClosePanel}
      />

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear the whole canvas?"
        message="All strokes and text on this page will be removed. This can be undone with ⌘Z."
        confirmLabel="Clear canvas"
        danger
        onConfirm={confirmClear}
        onCancel={() => setClearConfirmOpen(false)}
      />

      {/* The active box is now a real in-place <textarea> (see TextLayer), so
          it owns typing, the caret, selection, clipboard and the native OS
          keyboard directly — no hidden proxy or custom on-screen keyboard. */}

      {isBlank && (
        <p className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-sm text-ink-400/60">
          Start writing or drawing — pen, finger, or stylus.
        </p>
      )}

      {tool === 'text' && texts.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center text-sm text-ink-400/80">
          Tap anywhere to place text.
        </p>
      )}

      {/* Zoom controls (desktop). */}
      <div className="absolute bottom-4 right-4 z-20 hidden items-center gap-1 rounded-full border border-border bg-bg-muted/80 px-2 py-1.5 shadow-pop backdrop-blur-pill sm:flex">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 hover:bg-white/[0.06]"
        >
          <span className="text-lg leading-none">−</span>
        </button>
        <button
          type="button"
          aria-label="Reset zoom to 100%"
          title="Reset zoom"
          onClick={resetView}
          className="min-w-[3.25rem] rounded-full px-1 text-center text-xs font-medium tabular-nums text-ink-700 hover:bg-white/[0.06]"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomBy(1.2)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 hover:bg-white/[0.06]"
        >
          <span className="text-lg leading-none">+</span>
        </button>
      </div>

      {music.enabled && music.playing && (
        <>
          <KandinskyPulses
            shapes={music.melody}
            litIds={music.litIds}
            view={drawing.view}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-brand-400/80"
            style={{
              left: `${worldToScreen(music.playheadX, 0, drawing.view).x}px`,
            }}
          />
        </>
      )}

      {music.welcome && <KandinskyWelcome />}

      {pageNav}

      <BrandFooter />
      </div>

      {/* Distraction-free recall: the one element that survives the fade. */}
      {chromeHidden && (
        <button
          type="button"
          aria-label="Show controls"
          title="Show controls (Esc)"
          onClick={() => setChromeHidden(false)}
          className="absolute inset-x-0 top-0 z-30 mx-auto h-6 w-24 rounded-b-lg border border-t-0 border-border bg-bg-muted/60 text-[10px] text-ink-400/70 backdrop-blur-pill transition-colors hover:bg-bg-muted"
        >
          ⌄
        </button>
      )}

      {replayOpen && (
        <ReplayOverlay strokes={drawing.strokes} onClose={() => setReplayOpen(false)} />
      )}

      {showRotateOverlay && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-bg/95 px-8 text-center">
          <span className="text-3xl" aria-hidden>⟳</span>
          <p className="text-sm font-medium text-ink-900">Rotate your device</p>
          <p className="text-xs leading-relaxed text-ink-400">
            Quick notes are portrait-only. Turn your phone upright to keep writing.
          </p>
        </div>
      )}

      <Toaster />
    </main>
  );
}