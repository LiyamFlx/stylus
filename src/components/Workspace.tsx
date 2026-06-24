import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from './Canvas';
import { Toolbar } from './Toolbar';
import { StudioPanel } from './StudioPanel';
import { TextLayer } from './TextLayer';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { Toaster } from './Toaster';
import { InputMethodGroup } from './ToolbarInputMethods';
import { BrandFooter } from './Brand';
import { MenuIcon } from './icons';
import { useDrawing } from '../hooks/useDrawing';
import { useRecognition } from '../hooks/useRecognition';
import { useScanmarkerScanner } from '../hooks/useScanmarkerScanner';
import { useBluetoothStylus } from '../hooks/useBluetoothStylus';
import { eraserRadius } from '../lib/geometry';
import { importChunk } from '../lib/chunkReload';
import { inkKey, readAux, touchDocument, writeAux } from '../lib/documents';
import type { PaperStyle, PenSize, TextItem, Tool } from '../types';
import { PAPER_STYLES } from '../types';

interface WorkspaceProps {
  documentId: string;
  tool: Tool;
  color: string;
  size: PenSize;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: PenSize) => void;
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
  tool,
  color,
  size,
  onToolChange,
  onColorChange,
  onSizeChange,
  onOpenSidebar,
}: WorkspaceProps) {
  const initialAux = useRef(readAux(documentId)).current;
  const [paper, setPaper] = useState<PaperStyle>(initialAux.paper);
  const [texts, setTexts] = useState<TextItem[]>(initialAux.texts);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);

  const drawing = useDrawing({ tool, color, size, paper, storageKey: inkKey(documentId) });
  const recognition = useRecognition();

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

  /* ------------------------------ paper cycle ----------------------------- */

  const cyclePaper = useCallback(() => {
    setPaper((p) => PAPER_STYLES[(PAPER_STYLES.indexOf(p) + 1) % PAPER_STYLES.length]);
  }, []);

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
    setPanelOpen(true);
    void recognition.recognize(drawing.strokes);
  }, [drawing.strokes, recognition]);

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
    recognition.reset();
  }, [recognition]);

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
        if (e.key === 'e') onToolChange('eraser');
        if (e.key === 'p' || e.key === 'b') onToolChange('pen');
        if (e.key === 't') onToolChange('text');
        return;
      }
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

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <Canvas
        ref={drawing.canvasRef}
        tool={tool}
        eraserRadius={eraserRadius(size)}
        onPointerDown={drawing.onPointerDown}
        onPointerMove={drawing.onPointerMove}
        onPointerUp={drawing.onPointerUp}
      />

      <TextLayer
        items={texts}
        activeId={activeTextId}
        tool={tool}
        onCreate={createText}
        onSelect={setActiveTextId}
        onMove={moveText}
      />

      {/* Sidebar opener */}
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenSidebar}
        className="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-muted/80 text-ink-900 shadow-pop backdrop-blur-pill"
      >
        <MenuIcon size={22} />
      </button>

      <Toolbar
        tool={tool}
        color={color}
        size={size}
        paper={paper}
        canUndo={drawing.canUndo}
        canRedo={drawing.canRedo}
        isEmpty={drawing.isEmpty && texts.length === 0}
        recognizing={recognition.status === 'loading'}
        onToolChange={onToolChange}
        onColorChange={onColorChange}
        onSizeChange={onSizeChange}
        onPaperChange={cyclePaper}
        onUndo={drawing.undo}
        onRedo={drawing.redo}
        onClear={drawing.clear}
        onRecognize={handleRecognize}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
        inputMethodGroup={
          <InputMethodGroup scanner={scanner} stylus={stylus} />
        }
      />

      <StudioPanel
        open={panelOpen}
        status={recognition.status}
        text={recognition.text}
        recognitionError={recognition.error}
        onClose={handleClosePanel}
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

      <BrandFooter />

      <Toaster />
    </div>
  );
}
