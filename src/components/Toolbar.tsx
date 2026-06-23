import { useState } from 'react';
import type { PenSize, Tool } from '../types';
import { PEN_SIZES, PRESET_COLORS } from '../types';
import {
  PenIcon,
  EraserIcon,
  UndoIcon,
  RedoIcon,
  TrashIcon,
  TextIcon,
  ImageIcon,
  FileIcon,
  MenuIcon,
  CloseIcon,
  SpinnerIcon,
} from './icons';

interface ToolbarProps {
  tool: Tool;
  color: string;
  size: number;
  canUndo: boolean;
  canRedo: boolean;
  isEmpty: boolean;
  recognizing: boolean;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: PenSize) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onRecognize: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
}

/** A square icon button with active / disabled states. */
function IconButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-30',
        active
          ? 'bg-white text-black'
          : 'text-zinc-200 hover:bg-white/10 active:bg-white/20',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px self-center bg-white/15" aria-hidden />;
}

/** The size selector: three dots of increasing radius. */
function SizePicker({
  size,
  onSizeChange,
}: {
  size: number;
  onSizeChange: (s: PenSize) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {PEN_SIZES.map((s) => (
        <button
          key={s}
          type="button"
          title={`Thickness ${s}`}
          aria-label={`Thickness ${s}`}
          aria-pressed={size === s}
          onClick={() => onSizeChange(s)}
          className={[
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            size === s ? 'bg-white/15' : 'hover:bg-white/10',
          ].join(' ')}
        >
          <span
            className="rounded-full bg-current text-zinc-100"
            style={{ width: s + 2, height: s + 2 }}
          />
        </button>
      ))}
    </div>
  );
}

/** Eight preset swatches plus a native color input for custom colors. */
function ColorPicker({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (c: string) => void;
}) {
  const isPreset = (PRESET_COLORS as readonly string[]).includes(color);
  return (
    <div className="flex items-center gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`Color ${c}`}
          aria-pressed={color === c}
          onClick={() => onColorChange(c)}
          className={[
            'h-6 w-6 rounded-full border transition-transform',
            color === c
              ? 'scale-110 border-white ring-2 ring-white/40'
              : 'border-white/20 hover:scale-105',
          ].join(' ')}
          style={{ backgroundColor: c }}
        />
      ))}
      {/* Custom color: the swatch shows the picked color when it's non-preset. */}
      <label
        title="Custom color"
        className={[
          'relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border',
          !isPreset
            ? 'scale-110 border-white ring-2 ring-white/40'
            : 'border-white/20 hover:scale-105',
        ].join(' ')}
        style={{
          background: !isPreset
            ? color
            : 'conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)',
        }}
      >
        <input
          type="color"
          value={isPreset ? '#ffffff' : color}
          onChange={(e) => onColorChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick a custom color"
        />
      </label>
    </div>
  );
}

export function Toolbar(props: ToolbarProps) {
  const {
    tool,
    color,
    size,
    canUndo,
    canRedo,
    isEmpty,
    recognizing,
    onToolChange,
    onColorChange,
    onSizeChange,
    onUndo,
    onRedo,
    onClear,
    onRecognize,
    onExportPNG,
    onExportPDF,
  } = props;

  // Mobile: the pill collapses to a single menu button that expands a tray.
  const [mobileOpen, setMobileOpen] = useState(false);

  const controls = (
    <>
      <IconButton
        label="Pen"
        active={tool === 'pen'}
        onClick={() => onToolChange('pen')}
      >
        <PenIcon />
      </IconButton>
      <IconButton
        label="Eraser"
        active={tool === 'eraser'}
        onClick={() => onToolChange('eraser')}
      >
        <EraserIcon />
      </IconButton>

      <Divider />
      <SizePicker size={size} onSizeChange={onSizeChange} />

      <Divider />
      <ColorPicker color={color} onColorChange={onColorChange} />

      <Divider />
      <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
        <UndoIcon />
      </IconButton>
      <IconButton label="Redo" disabled={!canRedo} onClick={onRedo}>
        <RedoIcon />
      </IconButton>
      <IconButton label="Clear canvas" disabled={isEmpty} onClick={onClear}>
        <TrashIcon />
      </IconButton>

      <Divider />
      <IconButton
        label="Recognize handwriting"
        disabled={isEmpty || recognizing}
        onClick={onRecognize}
      >
        {recognizing ? <SpinnerIcon /> : <TextIcon />}
      </IconButton>
      <IconButton label="Export PNG" disabled={isEmpty} onClick={onExportPNG}>
        <ImageIcon />
      </IconButton>
      <IconButton label="Export PDF" disabled={isEmpty} onClick={onExportPDF}>
        <FileIcon />
      </IconButton>
    </>
  );

  return (
    <>
      {/* Desktop / wide: single floating pill, horizontally centered. */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 hidden justify-center sm:flex">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-panel px-2 py-1.5 shadow-2xl backdrop-blur-pill">
          {controls}
        </div>
      </div>

      {/* Mobile: a menu button that expands into a wrapping tray. */}
      <div className="absolute inset-x-0 top-3 z-20 flex flex-col items-center sm:hidden">
        <button
          type="button"
          aria-label={mobileOpen ? 'Close tools' : 'Open tools'}
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-panel text-zinc-100 shadow-2xl backdrop-blur-pill"
        >
          {mobileOpen ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
        </button>
        {mobileOpen && (
          <div className="mt-2 flex max-w-[92vw] flex-wrap items-center justify-center gap-1 rounded-3xl border border-white/10 bg-panel px-3 py-2 shadow-2xl backdrop-blur-pill">
            {controls}
          </div>
        )}
      </div>
    </>
  );
}
