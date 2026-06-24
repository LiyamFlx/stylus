import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { TextPanel } from './components/TextPanel';
import { TextBox } from './components/TextBox';
import { Toaster } from './components/Toaster';
import { InputMethodGroup } from './components/ToolbarInputMethods';
import { BrandFooter, BrandHeader } from './components/Brand';
import { useDrawing } from './hooks/useDrawing';
import { useRecognition } from './hooks/useRecognition';
import { useTextTool } from './hooks/useTextTool';
import { useScanmarkerScanner } from './hooks/useScanmarkerScanner';
import { useBluetoothStylus } from './hooks/useBluetoothStylus';
import type { PenSize, Tool } from './types';
import type { TextStroke, TextStyles } from './types/extensions';
import { PEN_SIZES, PRESET_COLORS } from './types';

export default function App() {
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [size, setSize] = useState<PenSize>(PEN_SIZES[1]);
  const [panelOpen, setPanelOpen] = useState(false);

  const drawing = useDrawing({ tool, color, size });
  const recognition = useRecognition();

  /* ----------------------- text / scanner / stylus ----------------------- */

  // Commit a placed-text stroke into the drawing's undo history.
  const addTextStroke = useCallback(
    (text: string, position: { x: number; y: number }, styles: TextStyles) => {
      const stroke: TextStroke = {
        type: 'text',
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `t_${Date.now()}`,
        x: position.x,
        y: position.y,
        content: text,
        styles,
        timestamp: Date.now(),
      };
      drawing.addStroke(stroke);
    },
    [drawing],
  );

  const textTool = useTextTool(addTextStroke);

  // A scan drops its text onto the canvas, staggered so repeats don't stack.
  const scanCount = useRef(0);
  const handleScan = useCallback(
    (scannedText: string) => {
      const canvas = drawing.canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const w = rect?.width ?? window.innerWidth;
      const offset = (scanCount.current++ % 8) * 28;
      addTextStroke(
        scannedText,
        { x: w / 2 - 100, y: 120 + offset },
        { fontSize: 16, bold: false, color: '#fafafa', fontFamily: 'inter' },
      );
    },
    [addTextStroke, drawing.canvasRef],
  );

  const scanner = useScanmarkerScanner(handleScan);
  const stylus = useBluetoothStylus();

  // Keep the toolbar's text button and the canvas cursor in sync with the
  // text-tool lifecycle: activating routes `tool` to 'text' (useDrawing then
  // ignores pointer-down so App can place the box instead).
  const handleToolChange = useCallback(
    (next: Tool) => {
      if (next === 'text') {
        textTool.activate();
      } else {
        textTool.deactivate();
      }
      setTool(next);
    },
    [textTool],
  );

  // Mirror the text tool back into `tool` so deactivating via Esc/commit
  // restores the pen.
  useEffect(() => {
    if (!textTool.isActive && tool === 'text') setTool('pen');
    if (textTool.isActive && tool !== 'text') setTool('text');
  }, [textTool.isActive, tool]);

  // When the text tool is active, a canvas tap places the text box instead of
  // drawing. Otherwise defer to the drawing engine.
  const handleCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (textTool.isActive) {
        const rect = e.currentTarget.getBoundingClientRect();
        textTool.setPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }
      drawing.onPointerDown(e);
    },
    [textTool, drawing],
  );

  /* --------------------------- export handlers ---------------------------- */

  const exportOpts = useCallback(() => {
    const canvas = drawing.canvasRef.current;
    return {
      width: canvas?.clientWidth ?? window.innerWidth,
      height: canvas?.clientHeight ?? window.innerHeight,
    };
  }, [drawing.canvasRef]);

  // Export lib (jsPDF) is heavy, so it's code-split and loaded on first use.
  const handleExportPNG = useCallback(async () => {
    const { exportPNG } = await import('./lib/export');
    exportPNG(drawing.strokes, exportOpts());
  }, [drawing.strokes, exportOpts]);

  const handleExportPDF = useCallback(async () => {
    const { exportPDF } = await import('./lib/export');
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
        if (e.key === 'e') handleToolChange('eraser');
        if (e.key === 'p' || e.key === 'b') handleToolChange('pen');
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          handleToolChange(textTool.isActive ? 'pen' : 'text');
        }
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
  }, [drawing, handleToolChange, textTool.isActive]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <Canvas
        ref={drawing.canvasRef}
        tool={tool}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={drawing.onPointerMove}
        onPointerUp={drawing.onPointerUp}
      />

      <BrandHeader />
      <BrandFooter />

      <Toolbar
        tool={tool}
        color={color}
        size={size}
        canUndo={drawing.canUndo}
        canRedo={drawing.canRedo}
        isEmpty={drawing.isEmpty}
        recognizing={recognition.status === 'loading'}
        onToolChange={handleToolChange}
        onColorChange={setColor}
        onSizeChange={setSize}
        onUndo={drawing.undo}
        onRedo={drawing.redo}
        onClear={drawing.clear}
        onRecognize={handleRecognize}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
        inputMethodGroup={
          <InputMethodGroup
            textTool={textTool}
            scanner={scanner}
            stylus={stylus}
          />
        }
      />

      <TextPanel
        open={panelOpen}
        status={recognition.status}
        text={recognition.text}
        error={recognition.error}
        onClose={handleClosePanel}
      />

      {textTool.isActive && textTool.pendingPosition && (
        <TextBox
          position={textTool.pendingPosition}
          initialStyles={textTool.styles}
          onCommit={(text, styles) => textTool.commitText(text, styles)}
          onCancel={textTool.deactivate}
        />
      )}

      <Toaster />

      {/* Subtle hint shown only on a fresh, empty canvas. */}
      {drawing.isEmpty && (
        <p className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-sm text-ink-400/60">
          Start writing or drawing — pen, finger, or stylus.
        </p>
      )}
    </div>
  );
}
