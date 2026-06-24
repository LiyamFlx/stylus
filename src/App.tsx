import { useCallback, useEffect, useState } from 'react';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { TextPanel } from './components/TextPanel';
import { BrandFooter, BrandHeader } from './components/Brand';
import { useDrawing } from './hooks/useDrawing';
import { useRecognition } from './hooks/useRecognition';
import { eraserRadius } from './lib/geometry';
import { importChunk } from './lib/chunkReload';
import type { PaperStyle, PenSize, Tool } from './types';
import { PAPER_STYLES, PEN_SIZES, PRESET_COLORS } from './types';

export default function App() {
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [size, setSize] = useState<PenSize>(PEN_SIZES[1]);
  const [paper, setPaper] = useState<PaperStyle>('blank');
  const [panelOpen, setPanelOpen] = useState(false);

  const drawing = useDrawing({ tool, color, size, paper });
  const recognition = useRecognition();

  const cyclePaper = useCallback(() => {
    setPaper((p) => {
      const i = PAPER_STYLES.indexOf(p);
      return PAPER_STYLES[(i + 1) % PAPER_STYLES.length];
    });
  }, []);

  /* --------------------------- export handlers ---------------------------- */

  const exportOpts = useCallback(() => {
    const canvas = drawing.canvasRef.current;
    return {
      width: canvas?.clientWidth ?? window.innerWidth,
      height: canvas?.clientHeight ?? window.innerHeight,
      paper,
    };
  }, [drawing.canvasRef, paper]);

  // Export lib (jsPDF) is heavy, so it's code-split and loaded on first use.
  // importChunk reloads once if a stale deploy 404s the chunk.
  const handleExportPNG = useCallback(async () => {
    const { exportPNG } = await importChunk(() => import('./lib/export'));
    exportPNG(drawing.strokes, exportOpts());
  }, [drawing.strokes, exportOpts]);

  const handleExportPDF = useCallback(async () => {
    const { exportPDF } = await importChunk(() => import('./lib/export'));
    exportPDF(drawing.strokes, exportOpts());
  }, [drawing.strokes, exportOpts]);

  /* ------------------------------ recognize ------------------------------- */

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
      if (!meta) {
        if (typing) return;
        // Tool hotkeys.
        if (e.key === 'e') setTool('eraser');
        if (e.key === 'p' || e.key === 'b') setTool('pen');
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
  }, [drawing]);

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

      <BrandHeader />
      <BrandFooter />

      <Toolbar
        tool={tool}
        color={color}
        size={size}
        paper={paper}
        canUndo={drawing.canUndo}
        canRedo={drawing.canRedo}
        isEmpty={drawing.isEmpty}
        recognizing={recognition.status === 'loading'}
        onToolChange={setTool}
        onColorChange={setColor}
        onSizeChange={setSize}
        onPaperChange={cyclePaper}
        onUndo={drawing.undo}
        onRedo={drawing.redo}
        onClear={drawing.clear}
        onRecognize={handleRecognize}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
      />

      <TextPanel
        open={panelOpen}
        status={recognition.status}
        text={recognition.text}
        error={recognition.error}
        onClose={handleClosePanel}
      />

      {/* Subtle hint shown only on a fresh, empty canvas. */}
      {drawing.isEmpty && (
        <p className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-sm text-ink-400/60">
          Start writing or drawing — pen, finger, or stylus.
        </p>
      )}
    </div>
  );
}
