import { useEffect, useRef, useState, useCallback } from 'react';
import type { PaperStyle, PenSize, Tool } from '../types';
import { PAPER_STYLES, PEN_SIZES, PRESET_COLORS } from '../types';
import { PEN_TYPES, penProfile, type PenType } from '../lib/penProfiles';
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
  MusicIcon,
  GaugeIcon,
  PlayIcon,
  StopIcon,
  SparkleIcon,
} from './icons';
import type { PaletteId } from '../lib/kandinsky/audio';

/** Human-readable label for the current paper guide, used in the tooltip. */
const PAPER_LABELS: Record<PaperStyle, string> = {
  blank: 'Blank',
  grid: 'Grid',
  ruled: 'Ruled',
  dots: 'Dots',
  cornell: 'Cornell',
  isometric: 'Isometric',
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
  penType: PenType;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: PenSize) => void;
  onPenTypeChange: (penType: PenType) => void;
  onPaperSelect: (paper: PaperStyle) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onRecognize: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
  /** Text / scanner / stylus input-method buttons, rendered in the pill. */
  inputMethodGroup?: React.ReactNode;
  musicMode: boolean;
  onToggleMusic: () => void;
  /** Learning Mode: velocity audio-braking feedback while drawing. */
  learningMode: boolean;
  onToggleLearning: () => void;
  playing: boolean;
  onPlayToggle: () => void;
  palette: PaletteId;
  onCyclePalette: () => void;
}

/**
 * Live media-query match, used to decide which toolbar variant to mount.
 * Only one variant (desktop pill or mobile tray) exists in the DOM at a time —
 * previously both were mounted simultaneously and toggled with CSS `hidden`,
 * which doubled every popover's state, effects, and listeners.
 */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Shared close-on-outside-click / close-on-Escape behavior for popovers.
 * Uses `pointerdown` (not `mousedown`) since pen/touch input in embedded
 * WebViews isn't guaranteed to synthesize mouse events.
 */
function usePopover(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

const isHexColor = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

/** A square icon button with active / disabled states. */
function IconButton({
  label,
  active = false,
  disabled = false,
  onClick,
  dataTour,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Optional onboarding-tour target hook. */
  dataTour?: string;
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
      data-tour={dataTour}
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
      data-tour="convert"
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
          // Show the real current color whenever it's valid hex — previously
          // this forced #ffffff for presets, causing a jump on open.
          value={isHexColor(color) ? color : '#ffffff'}
          onChange={(e) => onColorChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick a custom color"
        />
      </label>
    </div>
  );
}

/** A small CSS rendering of each paper guide, shown in the picker swatches. */
// A repeating 1px line every 7px, reused by the line-based swatches.
const SWATCH_LINE = 'rgba(255,255,255,0.4) 0 1px, transparent 1px 7px';

/**
 * CSS `background-image` for each paper-style swatch. Typed as a full
 * `Record<PaperStyle, ...>` so adding a paper style without a swatch is a
 * compile error (no silent fall-through to the ruled preview).
 */
const SWATCH_BG: Record<PaperStyle, React.CSSProperties> = {
  blank: {},
  dots: {
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px)',
    backgroundSize: '7px 7px',
  },
  ruled: { backgroundImage: `repeating-linear-gradient(0deg, ${SWATCH_LINE})` },
  grid: {
    backgroundImage: `repeating-linear-gradient(0deg, ${SWATCH_LINE}), repeating-linear-gradient(90deg, ${SWATCH_LINE})`,
  },
  cornell: {
    backgroundImage: `repeating-linear-gradient(0deg, ${SWATCH_LINE}), linear-gradient(90deg, transparent 9px, rgba(255,255,255,0.4) 9px 10px, transparent 10px)`,
  },
  isometric: {
    backgroundImage: `repeating-linear-gradient(0deg, ${SWATCH_LINE}), repeating-linear-gradient(60deg, ${SWATCH_LINE}), repeating-linear-gradient(120deg, ${SWATCH_LINE})`,
  },
};

function PaperSwatch({ style }: { style: PaperStyle }) {
  return <span className="h-7 w-7 rounded bg-bg" style={SWATCH_BG[style]} />;
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
  const ref = usePopover(open, setOpen);

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

/** Pen-type button that opens a popover to pick Fountain / Ballpoint / etc. */
function PenTypePicker({
  penType,
  onPenTypeChange,
}: {
  penType: PenType;
  onPenTypeChange: (penType: PenType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = usePopover(open, setOpen);

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={`Pen: ${penProfile(penType).label}`}
        active={open}
        onClick={() => setOpen((o) => !o)}
      >
        <PenIcon />
      </IconButton>
      {open && (
        <div
          role="menu"
          aria-label="Pen type"
          className="absolute left-0 top-full z-30 mt-2 rounded-panel border border-border bg-bg-muted/95 p-1.5 shadow-pop backdrop-blur-pill"
        >
          {PEN_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={penType === t}
              onClick={() => {
                onPenTypeChange(t);
                setOpen(false);
              }}
              className={[
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors',
                penType === t
                  ? 'bg-white/[0.08] ring-1 ring-brand-500/50'
                  : 'hover:bg-white/[0.06]',
              ].join(' ')}
            >
              <span className="text-[13px] font-medium text-ink-900">
                {penProfile(t).label}
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
    penType,
    paper,
    canUndo,
    canRedo,
    isEmpty,
    recognizing,
    onToolChange,
    onColorChange,
    onSizeChange,
    onPenTypeChange,
    onPaperSelect,
    onUndo,
    onRedo,
    onClear,
    onRecognize,
    onExportPNG,
    onExportPDF,
    inputMethodGroup,
    musicMode,
    onToggleMusic,
    learningMode,
    onToggleLearning,
    playing,
    onPlayToggle,
    palette,
    onCyclePalette,
  } = props;

  // Mobile: the pill collapses to a single menu button that expands a tray.
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)');

  // If the viewport crosses into desktop while the mobile tray is open, don't
  // leave it stuck in a hidden-but-mounted state.
  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  const handlePenTypeChange = useCallback(
    (t: PenType) => {
      onPenTypeChange(t);
      onToolChange('pen');
    },
    [onPenTypeChange, onToolChange],
  );

  const controls = (
    <>
      <IconButton
        label="Pen"
        active={tool === 'pen'}
        onClick={() => onToolChange('pen')}
        dataTour="pen"
      >
        <PenIcon />
      </IconButton>
      {tool === 'pen' && (
        <PenTypePicker penType={penType} onPenTypeChange={handlePenTypeChange} />
      )}
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
        dataTour="select"
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

      <Divider />
      <IconButton
        label={musicMode ? 'Turn music mode off' : 'Turn music mode on'}
        active={musicMode}
        onClick={onToggleMusic}
      >
        <MusicIcon />
      </IconButton>
      <IconButton
        label={
          learningMode
            ? 'Turn Learning Mode off'
            : 'Learning Mode — audio feedback when drawing too fast'
        }
        active={learningMode}
        onClick={onToggleLearning}
      >
        <GaugeIcon />
      </IconButton>
      {musicMode && (
        <>
          <IconButton
            label={playing ? 'Stop' : 'Play soundscape'}
            active={playing}
            disabled={isEmpty}
            onClick={onPlayToggle}
          >
            {playing ? <StopIcon /> : <PlayIcon />}
          </IconButton>
          <button
            type="button"
            title={`Sound palette ${palette} — tap to switch`}
            aria-label={`Sound palette ${palette}, tap to switch`}
            onClick={onCyclePalette}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/[0.06]"
          >
            <span
              className="h-5 w-5 rounded-full border border-border-strong"
              style={{
                background:
                  palette === 'A'
                    ? 'linear-gradient(90deg, #22c55e 50%, #3b82f6 50%)'
                    : 'linear-gradient(90deg, #a855f7 50%, #ec4899 50%)',
              }}
            />
          </button>
        </>
      )}
    </>
  );

  // Only one variant is ever mounted now — no hidden duplicate toolbar
  // (and its popovers/effects) sitting in the DOM on the other breakpoint.
  if (isDesktop) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
        <div className="pointer-events-auto flex max-w-[calc(100vw-152px)] items-center gap-1 overflow-x-auto rounded-full border border-border bg-bg-muted/80 px-2 py-1.5 shadow-pop backdrop-blur-pill">
          {controls}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 top-4 z-20 flex flex-col items-center">
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
  );
}
