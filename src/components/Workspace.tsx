import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from './Canvas';
import { Toolbar } from './Toolbar';
import { ConfirmDialog } from './Dialog';
import { StudioPanel } from './StudioPanel';
import { TextLayer } from './TextLayer';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { Toaster } from './Toaster';
import { toast } from '../lib/toast';
import { InputMethodGroup } from './ToolbarInputMethods';
import { BrandFooter } from './Brand';
import { MenuIcon } from './icons';
import { useDrawing } from '../hooks/useDrawing';
import { useMusicMode } from '../hooks/useMusicMode';
import { KandinskyWelcome, KandinskyPulses } from './KandinskyOverlay';
import { SelectionToolbar } from './SelectionToolbar';
import type { RefineAction } from '../lib/ai';
import type { PenType } from '../lib/penProfiles';
import { useRecognition } from '../hooks/useRecognition';
import { useScanmarkerScanner } from '../hooks/useScanmarkerScanner';
import { useBluetoothStylus } from '../hooks/useBluetoothStylus';
import { eraserRadius, worldToScreen } from '../lib/geometry';
import { importChunk } from '../lib/chunkReload';
import { inkKey, readAux, touchDocument, writeAux } from '../lib/documents';
import type { PaperStyle, PenSize, Stroke, TextItem, Tool } from '../types';

interface WorkspaceProps {
  documentId: string;
  documentName: string;
  tool: Tool;
  color: string;
  size: PenSize;
  penType: PenType;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: PenSize) => void;
  onPenTypeChange: (penType: PenType) => void;
  onOpenSidebar: () => void;
}

function textId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * The document editor. Re-mounted per document (keyed by id in App), so each
 * document loads its own strokes (via useDrawing's storage key) and its own
 * paper + text items (from the aux store).
 */
export function Workspace({
  documentId,
  documentName,
  tool,
  color,
  size,
  penType,
  onToolChange,
  onColorChange,
  onSizeChange,
  onPenTypeChange,
  onOpenSidebar,
}: WorkspaceProps) {
  const initialAux = useRef(readAux(documentId)).current;
  const [paper, setPaper] = useState<PaperStyle>(initialAux.paper);
  const [texts, setTexts] = useState<TextItem[]>(initialAux.texts);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);

  const music = useMusicMode();

  const drawing = useDrawing({
    tool,
    color,
    size,
    paper,
    penType,
    storageKey: inkKey(documentId),
    onStrokeEnd: (stroke: Stroke) => {
      const el = drawing.canvasRef.current;
      music.handleStrokeEnd(
        stroke,
        drawing.view,
        el?.clientWidth ?? window.innerWidth,
        el?.clientHeight ?? window.innerHeight,
      );
    },
  });
  const recognition = useRecognition();

  // Surface an audio-load failure (offline / stale chunk) instead of a silently
  // dead toggle button.
  useEffect(() => {
    if (music.loadError) {
      toast.error("Couldn't load music mode — check your connection and retry.");
    }
  }, [music.loadError]);

  // Reconcile the melody with the strokes still on the canvas. When a stroke is
  // erased, deleted, undone, or moved away, drop/refresh its melody entry so the
  // sweep never fires a phantom note or glows a deleted shape.
  useEffect(() => {
    if (!music.enabled) return;
    music.syncMelody(new Set(drawing.strokes.map((s) => s.id)));
  }, [drawing.strokes, music]);

  const [panelOpen, setPanelOpen] = useState(false);

  // Persist paper + text items to the document's aux store (skip first run —
  // we just loaded these values).
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    writeAux(documentId, { paper, texts });
    touchDocument(documentId, Date.now());
  }, [documentId, paper, texts]);

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

  const editActive = useCallback((fn: (text: string) => string) => {
    const id = activeIdRef.current;
    if (!id) return;
    setTexts((t) => t.map((it) => (it.id === id ? { ...it, text: fn(it.text) } : it)));
  }, []);

  /* --------------------- hardware input: scanner + stylus ----------------- */

  // A scan drops a finished text box onto the canvas, staggered so repeated
  // scans don't stack on the same spot.
  const scanCount = useRef(0);
  const handleScan = useCallback(
    (scannedText: string) => {
      const text = scannedText.trim();
      if (!text) return;
      const canvas = drawing.canvasRef.current;
      const w = canvas?.clientWidth ?? window.innerWidth;
      const offset = (scanCount.current++ % 8) * 28;
      setTexts((t) => [
        ...t,
        {
          id: textId(),
          x: Math.max(16, w / 2 - 120),
          y: 96 + offset,
          text,
          color,
          size: Math.max(20, size * 4),
        },
      ]);
    },
    [color, size, drawing.canvasRef],
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
      const canvas = drawing.canvasRef.current;
      const w = canvas?.clientWidth ?? window.innerWidth;
      const offset = (scanCount.current++ % 8) * 28;
      const item: TextItem = {
        id: textId(),
        x: Math.max(16, w / 2 - 120),
        y: 96 + offset,
        text,
        color,
        size: Math.max(20, size * 4),
      };
      setTexts((t) => [...t, item]);
      setActiveTextId(item.id);
    },
    [color, size, editActive, drawing.canvasRef],
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
    const { exportPNG } = await importChunk(() => import('../lib/export'));
    exportPNG(drawing.strokes, exportOpts());
  }, [drawing.strokes, exportOpts]);

  const handleExportPDF = useCallback(async () => {
    const { exportPDF } = await importChunk(() => import('../lib/export'));
    exportPDF(drawing.strokes, exportOpts());
  }, [drawing.strokes, exportOpts]);

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

  // Copy the recognized text of the current lasso selection to the clipboard.
  const handleCopySelection = useCallback(async () => {
    const ids = drawing.selection.selectedIds;
    const selected = drawing.strokes.filter((s) => ids.has(s.id));
    if (selected.length === 0) return;
    try {
      const { recognizeText } = await importChunk(() => import('../lib/recognition'));
      const { text } = await recognizeText(selected);
      if (!text.trim()) {
        toast.error('Nothing to copy — no handwriting recognized in the selection.');
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('Copied recognized text');
    } catch {
      toast.error("Couldn't copy — recognition or clipboard failed.");
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
      setPanelAutoAction(action);
      setPanelOpen(true);
      if (strokes.length === 0) {
        recognition.fail('Nothing to recognize — the selection is empty.');
        return;
      }
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
    try {
      const { recognizeText } = await importChunk(() => import('../lib/recognition'));
      const { text } = await recognizeText(selected);
      if (!text.trim()) {
        toast.error('No handwriting recognized in the selection.');
        return;
      }
      pasteText(text);
    } catch {
      toast.error("Couldn't convert — recognition failed.");
    }
  }, [selectedStrokes, handleRecognize, pasteText]);

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

  /* ------------------------------- zoom + pan ----------------------------- */
  // Wheel/pinch zoom + pan are handled by a native listener in useDrawing; the
  // controls below drive zoom from the toolbar cluster.

  const { scale, zoomBy, reset: resetView } = drawing.view;

  /* --------------------------- keyboard shortcuts ------------------------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      const meta = e.metaKey || e.ctrlKey;

      // Physical typing into the active text box.
      if (tool === 'text' && activeIdRef.current && !meta && !typing) {
        if (e.key === 'Backspace') {
          e.preventDefault();
          editActive((t) => t.slice(0, -1));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          editActive((t) => t + '\n');
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          finishText();
          return;
        }
        if (e.key.length === 1) {
          e.preventDefault();
          editActive((t) => t + e.key);
          return;
        }
      }

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
  }, [tool, editActive, finishText, onToolChange, drawing]);

  // Paste clipboard text onto the canvas (Cmd/Ctrl+V, right-click → Paste).
  // When the paste targets a real input/textarea/contenteditable (e.g. the AI
  // studio editor), let the browser handle it natively.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
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
  }, [tool, onToolChange, pasteText]);

  const showKeyboard = tool === 'text';
  const isBlank = drawing.isEmpty && texts.length === 0;

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
      <Canvas
        baseCanvasRef={drawing.canvasRef}
        overlayCanvasRef={drawing.overlayRef}
        tool={tool}
        eraserRadius={eraserRadius(size)}
        scale={drawing.view.scale}
        cursor={canvasCursor}
        onPointerDown={drawing.onPointerDown}
        onPointerMove={drawing.onPointerMove}
        onPointerUp={drawing.onPointerUp}
      />

      <TextLayer
        items={texts}
        activeId={activeTextId}
        tool={tool}
        view={drawing.view}
        onCreate={createText}
        onSelect={setActiveTextId}
        onMove={moveText}
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
        />
      )}

      {/* Sidebar opener + current document name */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          aria-label="Open menu"
          title="Open menu"
          onClick={onOpenSidebar}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-muted/80 text-ink-900 shadow-pop backdrop-blur-pill"
        >
          <MenuIcon size={22} />
        </button>
        <button
          type="button"
          title={documentName}
          aria-label={`Current document: ${documentName} — open menu`}
          onClick={onOpenSidebar}
          className="hidden h-11 max-w-[40vw] items-center truncate rounded-full border border-border bg-bg-muted/80 px-4 text-sm font-medium text-ink-700 shadow-pop backdrop-blur-pill sm:flex"
        >
          <span className="truncate">{documentName}</span>
        </button>
      </div>

      <Toolbar
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
        playing={music.playing}
        onPlayToggle={() => {
          const el = drawing.canvasRef.current;
          music.togglePlayback(drawing.view, el?.clientWidth ?? window.innerWidth);
        }}
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

      {/* On-screen keyboard for the text tool. */}
      {showKeyboard && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-3">
          <OnScreenKeyboard
            onInput={(s) => editActive((t) => t + s)}
            onBackspace={() => editActive((t) => t.slice(0, -1))}
            onEnter={() => editActive((t) => t + '\n')}
            onClose={finishText}
          />
        </div>
      )}

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

      <BrandFooter />

      <Toaster />
    </main>
  );
}
