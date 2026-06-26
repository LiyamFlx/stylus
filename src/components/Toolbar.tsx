import { useEffect, useRef, useState } from 'react';
import type { PaperStyle, PenSize, Tool } from '../types';
import { PAPER_STYLES, PEN_SIZES, PRESET_COLORS } from '../types';
import {
  PenIcon,
  EraserIcon,
  TypeIcon,
  UndoIcon,
  RedoIcon,
  TrashIcon,
  ImageIcon,
  FileIcon,
  PaperIcon,
  MenuIcon,
  LassoIcon,
  CloseIcon,
  SpinnerIcon,
} from './icons';

/** Human-readable label for the current paper guide, used in the tooltip. */
const PAPER_LABELS: Record<PaperStyle, string> = {
  blank: 'Blank',
  grid: 'Grid',
  ruled: 'Ruled',
  dots: 'Dots',
};

interface ToolbarProps {
  tool: Tool;
  color: string;
  size: number;
  paper: PaperStyle;
  canUndo: boolean;
  canRedo: boolean;
  isEmpty: boolean;
  recognizing: boolean;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: PenSize) => void;
  onPaperSelect: (paper: PaperStyle) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onRecognize: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
  /** Text / scanner / stylus input-method buttons, rendered in the pill. */
  inputMethodGroup?: React.ReactNode;
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
          ? 'bg-brand-500 text-white shadow-soft hover:bg-brand-600'
          : 'text-ink-700 hover:bg-white/[0.06] active:bg-white/10',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px self-center bg-border-strong" aria-hidden />;
}

/** Sparkle "Convert" button — runs OCR and opens the Stylus AI studio. */
function ConvertButton({
  disabled,
  recognizing,
  onClick,
}: {
  disabled: boolean;
  recognizing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title="Convert handwriting to text"
      aria-label="Convert to text"
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-9 items-center justify-center gap-1.5 rounded-full px-3 transition-colors',
        'border border-brand-500/40 bg-brand-500/[0.14] text-brand-300',
        'hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-40',
      ].join(' ')}
    >
      {recognizing ? <SpinnerIcon size={18} /> : <SparkleIcon />}
      <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">
        Convert
      </span>
    </button>
  );
}

/** Sparkle glyph for the Convert action. */
function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15l-1.7-4L6 9.3l4.3-1.7z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
    </svg>
  );
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
            size === s
              ? 'bg-white/[0.08] ring-1 ring-brand-500/50'
              : 'hover:bg-white/[0.06]',
          ].join(' ')}
        >
          <span
            className={[
              'rounded-full',
              size === s ? 'bg-brand-500' : 'bg-ink-700',
            ].join(' ')}
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
              ? 'scale-110 border-bg ring-2 ring-brand-500'
              : 'border-border-strong hover:scale-105',
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
            ? 'scale-110 border-bg ring-2 ring-brand-500'
            : 'border-border-strong hover:scale-105',
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

/** A small CSS rendering of each paper guide, shown in the picker swatches. */
function PaperSwatch({ style }: { style: PaperStyle }) {
  const base = 'h-7 w-7 rounded bg-bg';
  if (style === 'blank') return <span className={base} />;
  if (style === 'dots') {
    return (
      <span
        className={base}
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px)',
          backgroundSize: '7px 7px',
        }}
      />
    );
  }
  const line = 'rgba(255,255,255,0.4) 0 1px, transparent 1px 7px';
  return (
    <span
      className={base}
      style={{
        backgroundImage:
          style === 'grid'
            ? `repeating-linear-gradient(0deg, ${line}), repeating-linear-gradient(90deg, ${line})`
            : `repeating-linear-gradient(0deg, ${line})`,
      }}
    />
  );
}

/** Paper-guide button that opens a popover to pick Blank / Grid / Ruled / Dots. */
function PaperPicker({
  paper,
  onPaperSelect,
}: {
  paper: PaperStyle;
  onPaperSelect: (paper: PaperStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={`Paper: ${PAPER_LABELS[paper]}`}
        active={open || paper !== 'blank'}
        onClick={() => setOpen((o) => !o)}
      >
        <PaperIcon />
      </IconButton>
      {open && (
        <div
          role="menu"
          aria-label="Paper background"
          className="absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 rounded-panel border border-border bg-bg-muted/95 p-1.5 shadow-pop backdrop-blur-pill"
        >
          {PAPER_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={paper === s}
              onClick={() => {
                onPaperSelect(s);
                setOpen(false);
              }}
              className={[
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                paper === s
                  ? 'bg-white/[0.08] ring-1 ring-brand-500/50'
                  : 'hover:bg-white/[0.06]',
              ].join(' ')}
            >
              <PaperSwatch style={s} />
              <span className="text-[13px] font-medium text-ink-900">
                {PAPER_LABELS[s]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar(props: ToolbarProps) {
  const {
    tool,
    color,
    size,
    paper,
    canUndo,
    canRedo,
    isEmpty,
    recognizing,
    onToolChange,
    onColorChange,
    onSizeChange,
    onPaperSelect,
    onUndo,
    onRedo,
    onClear,
    onRecognize,
    onExportPNG,
    onExportPDF,
    inputMethodGroup,
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
      <IconButton
        label="Select"
        active={tool === 'select'}
        onClick={() => onToolChange('select')}
      >
        <LassoIcon />
      </IconButton>
      <IconButton
        label="Text"
        active={tool === 'text'}
        onClick={() => onToolChange('text')}
      >
        <TypeIcon />
      </IconButton>

      <Divider />
      <SizePicker size={size} onSizeChange={onSizeChange} />

      <Divider />
      <ColorPicker color={color} onColorChange={onColorChange} />

      <Divider />
      <PaperPicker paper={paper} onPaperSelect={onPaperSelect} />

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

      {inputMethodGroup}

      <Divider />
      <ConvertButton
        disabled={isEmpty || recognizing}
        recognizing={recognizing}
        onClick={onRecognize}
      />
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
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 hidden justify-center sm:flex">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-bg-muted/80 px-2 py-1.5 shadow-pop backdrop-blur-pill">
          {controls}
        </div>
      </div>

      {/* Mobile: a menu button that expands into a wrapping tray. */}
      <div className="absolute inset-x-0 top-4 z-20 flex flex-col items-center sm:hidden">
        <button
          type="button"
          aria-label={mobileOpen ? 'Close tools' : 'Open tools'}
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-muted/80 text-ink-900 shadow-pop backdrop-blur-pill"
        >
          {mobileOpen ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
        </button>
        {mobileOpen && (
          <div className="mt-2 flex max-w-[92vw] flex-wrap items-center justify-center gap-1 rounded-panel border border-border bg-bg-muted/80 px-3 py-2 shadow-pop backdrop-blur-pill">
            {controls}
          </div>
        )}
      </div>
    </>
  );
}
