import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PaperStyle, PenSize, Tool } from '../types';
import { PAPER_STYLES, PEN_SIZES, PRESET_COLORS } from '../types';
import { PEN_TYPES, penProfile, type PenType } from '../lib/penProfiles';
import {
  PenIcon,
  ChevronDownIcon,
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
  FocusIcon,
  LockIcon,
  UnlockIcon,
  SearchIcon,
  MarkdownIcon,
  PlainTextIcon,
} from './icons';
import type { PaletteId } from '../lib/kandinsky/audio';
import type { ToolbarVariant } from '../lib/modes';
import { ColorWheel } from './ColorWheel';

/** Human-readable label for the current paper guide, used in the tooltip. */
const PAPER_LABELS: Record<PaperStyle, string> = {
  blank: 'Blank',
  grid: 'Grid',
  ruled: 'Ruled',
  dots: 'Dots',
  cornell: 'Cornell',
  isometric: 'Isometric',
  notebook: 'Notebook',
};

interface ToolbarProps {
  tool: Tool;
  color: string;
  size: PenSize;
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
  /** Text-only export (Quick Note Phase 4) — omit to hide both buttons
   *  (e.g. when there are no text boxes to export). */
  onExportMarkdown?: () => void;
  onExportText?: () => void;
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
  /** Mode color-palette override (ModeConfig.paletteOverride). */
  paletteOverride?: readonly string[];
  /**
   * Toolbar composition (Phase 1 item 7):
   * - 'full': everything (canvas / desktop default)
   * - 'minimal': hides non-classroom, non-desktop peripheral groups —
   *   pen-type picker, music/learning, scanner+BT input methods. Mobile Mode
   *   (Phase 2) reuses this variant as-is; keep its scope generic.
   * - 'restricted': exam lock — pen + undo + unlock only.
   */
  variant?: ToolbarVariant;
  /** 'bottom' anchors the pill thumb-reachable with safe-area padding
   *  (Phase 2 items 2+3+8); enables 44px touch targets. Default 'top'. */
  position?: 'top' | 'bottom';
  /** Exam-lock state + toggle (notebook mode). Omit to hide the button. */
  examLock?: boolean;
  onToggleExamLock?: () => void;
  /** Distraction-free: hide all chrome (Phase 1 item 8). */
  onHideChrome?: () => void;
  /** Stroke replay (Phase 3 item 6) — canvas-mode full toolbar only. */
  onReplay?: () => void;
  /** Find & replace across this document's text boxes (Quick Note Phase 2).
   *  Shown in every variant, including minimal — it's core to note-taking. */
  onFindReplace?: () => void;
  /** Canvas Mode color wheel (Phase 3 item 3). */
  enableColorWheel?: boolean;
  customColors?: readonly string[];
  onCustomColor?: (hex: string) => void;
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
 *
 * `panelRef` is optional: popover panels are portaled to `document.body` (see
 * `usePopoverFixedPosition`) so they're no longer a DOM descendant of the
 * trigger. Without also checking the panel, every click *inside* the panel
 * looks like an outside click — the popover closes (and unmounts the button)
 * before its own `onClick` can fire, so menu items silently do nothing.
 */
function usePopover(
  open: boolean,
  setOpen: (open: boolean) => void,
  panelRef?: React.RefObject<HTMLElement | null>,
) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef?.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, panelRef]);
  return ref;
}

/**
 * Popover panels live inside the desktop toolbar's `overflow-x-auto` row
 * (a scroll fallback for narrow windows). That `overflow-x` forces the
 * browser to also clip the Y axis, so an `absolute top-full` panel gets cut
 * off at the row's own height instead of floating below it — the popover
 * opens (state flips, ARIA is correct) but is invisible, which reads as a
 * dead button.
 *
 * `position: fixed` alone doesn't escape this: the row also has
 * `backdrop-blur-pill` (`backdrop-filter`), which — like `transform` or
 * `filter` — creates a new containing block, so a `fixed` descendant is
 * still positioned (and clipped) relative to that row, not the viewport.
 * The panel must be rendered via a portal to escape the DOM subtree
 * entirely; this hook only computes where to place it.
 */
function usePopoverFixedPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  align: 'center' | 'left' = 'center',
) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle(
        align === 'left'
          ? { position: 'fixed', top: rect.bottom + 8, left: rect.left }
          : {
              position: 'fixed',
              top: rect.bottom + 8,
              left: rect.left + rect.width / 2,
              transform: 'translateX(-50%)',
            },
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, align]);
  return style;
}

const isHexColor = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

/** When true, IconButtons render at >=44px touch-target size (Phase 2). Set
 *  once for the whole controls tree via context — 30+ call sites stay
 *  untouched. */
const LargeTargetsContext = createContext(false);

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
  const large = useContext(LargeTargetsContext);
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
        large ? 'flex h-11 w-11 items-center justify-center rounded-full transition-colors'
              : 'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-30',
        active
          ? 'bg-brand-600 text-white shadow-soft hover:bg-brand-700'
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
  size: PenSize;
  onSizeChange: (s: PenSize) => void;
}) {
  const large = useContext(LargeTargetsContext);
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
            large ? 'flex h-11 w-11 items-center justify-center rounded-full transition-colors'
                  : 'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
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
  paletteOverride,
  enableWheel = false,
  customColors = [],
  onCustomColor,
}: {
  color: string;
  onColorChange: (c: string) => void;
  /** Mode palette override (e.g. NOTEBOOK_COLORS). Undefined = full presets
   *  plus the custom-color input; an override is a closed set by design. */
  paletteOverride?: readonly string[];
  /** Canvas Mode: HSB wheel + EyeDropper as an alternate view (item 3). */
  enableWheel?: boolean;
  /** Per-doc saved custom colors, shown inside the wheel popover. */
  customColors?: readonly string[];
  /** Persist a committed wheel/eyedropper color. */
  onCustomColor?: (hex: string) => void;
}) {
  const colors = paletteOverride ?? PRESET_COLORS;
  const isPreset = (colors as readonly string[]).includes(color);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = usePopover(open, setOpen, panelRef);
  const popoverStyle = usePopoverFixedPosition(open, ref);
  const [wheelOpen, setWheelOpen] = useState(false);
  const showCustom = paletteOverride === undefined;
  const large = useContext(LargeTargetsContext);

  return (
    <div ref={ref} className="relative">
      {/* Trigger: one swatch showing the current color — the 8+ swatches live
          in the popover instead of eating toolbar width. */}
      <button
        type="button"
        title="Color"
        aria-label={`Color: ${color}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={[
          large ? 'flex h-11 w-11 items-center justify-center rounded-full transition-colors'
                : 'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
          open ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]',
        ].join(' ')}
      >
        <span
          className="h-6 w-6 rounded-full border border-border-strong ring-2 ring-brand-500/60"
          style={{ backgroundColor: isHexColor(color) ? color : '#ffffff' }}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Colors"
            style={popoverStyle}
            className="z-30 rounded-panel border border-border bg-bg-muted/95 p-2.5 shadow-pop backdrop-blur-pill"
          >
          <div className="grid grid-cols-4 gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => {
                  onColorChange(c);
                  setOpen(false);
                }}
                className={[
                  'h-7 w-7 rounded-full border transition-transform',
                  color === c
                    ? 'scale-110 border-bg ring-2 ring-brand-500'
                    : 'border-border-strong hover:scale-105',
                ].join(' ')}
                style={{ backgroundColor: c }}
              />
            ))}
            {/* Native custom-color input (closed under a palette override). */}
            {showCustom && (
              <label
                title="Custom color"
                className={[
                  'relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border',
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
                  value={isHexColor(color) ? color : '#ffffff'}
                  onChange={(e) => onColorChange(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pick a custom color"
                />
              </label>
            )}
          </div>

          {enableWheel && showCustom && (
            <>
              <button
                type="button"
                aria-expanded={wheelOpen}
                onClick={() => setWheelOpen((o) => !o)}
                className="mt-2 w-full rounded-lg py-1 text-[12px] font-medium text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-700"
              >
                {wheelOpen ? 'Hide color wheel' : 'Color wheel…'}
              </button>
              {wheelOpen && (
                <div className="mt-2 flex flex-col items-center">
                  <ColorWheel color={color} onColorChange={onColorChange} onCommit={onCustomColor} />
                  {customColors.length > 0 && (
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                      {customColors.map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          aria-label={`Saved color ${c}`}
                          onClick={() => {
                            onColorChange(c);
                            setOpen(false);
                          }}
                          className="h-5 w-5 rounded-full border border-border-strong hover:scale-110"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </div>,
          document.body,
        )}
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
  notebook: {
    backgroundColor: '#FDF6E3',
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(107,138,188,0.5) 0 1px, transparent 1px 7px), linear-gradient(90deg, transparent 6px, rgba(217,84,79,0.6) 6px 7px, transparent 7px)',
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
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = usePopover(open, setOpen, panelRef);
  const popoverStyle = usePopoverFixedPosition(open, ref);

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={`Paper: ${PAPER_LABELS[paper]}`}
        active={open || paper !== 'blank'}
        onClick={() => setOpen((o) => !o)}
      >
        <PaperIcon />
      </IconButton>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Paper background"
            style={popoverStyle}
            className="z-30 rounded-panel border border-border bg-bg-muted/95 p-1.5 shadow-pop backdrop-blur-pill"
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
          </div>,
          document.body,
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
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = usePopover(open, setOpen, panelRef);
  const popoverStyle = usePopoverFixedPosition(open, ref, 'left');

  return (
    <div ref={ref} className="relative">
      {/* A compact caret — the pen-*type* dropdown, distinct from the Pen tool
          button beside it (both used to render an identical PenIcon, which read
          as a duplicated pen). */}
      <button
        type="button"
        title={`Pen: ${penProfile(penType).label}`}
        aria-label={`Pen type: ${penProfile(penType).label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={[
          'flex h-9 w-6 items-center justify-center rounded-full transition-colors',
          open ? 'bg-white/[0.08] text-ink-900' : 'text-ink-700 hover:bg-white/[0.06]',
        ].join(' ')}
      >
        <ChevronDownIcon size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Pen type"
            style={popoverStyle}
            className="z-30 rounded-panel border border-border bg-bg-muted/95 p-1.5 shadow-pop backdrop-blur-pill"
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
          </div>,
          document.body,
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
    onExportMarkdown,
    onExportText,
    inputMethodGroup,
    musicMode,
    onToggleMusic,
    learningMode,
    onToggleLearning,
    playing,
    onPlayToggle,
    palette,
    paletteOverride,
    variant = 'full',
    position = 'top',
    examLock = false,
    onToggleExamLock,
    onHideChrome,
    onReplay,
    onFindReplace,
    enableColorWheel = false,
    customColors,
    onCustomColor,
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

  const minimal = variant !== 'full';

  // Exam lock: pen + undo + unlock. Nothing else renders — a closed surface,
  // not a styled-down full toolbar.
  if (variant === 'restricted') {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-bg-muted/80 px-2 py-1.5 shadow-pop backdrop-blur-pill">
          <IconButton label="Pen" active={tool === 'pen'} onClick={() => onToolChange('pen')}>
            <PenIcon />
          </IconButton>
          <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </IconButton>
          {onToggleExamLock && (
            <IconButton label="Exit exam lock" active onClick={onToggleExamLock}>
              <UnlockIcon />
            </IconButton>
          )}
        </div>
      </div>
    );
  }

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
      {tool === 'pen' && !minimal && (
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
      <ColorPicker
        color={color}
        onColorChange={onColorChange}
        paletteOverride={paletteOverride}
        enableWheel={enableColorWheel}
        customColors={customColors}
        onCustomColor={onCustomColor}
      />

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

      {!minimal && inputMethodGroup}

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
      {onExportMarkdown && (
        <IconButton label="Export Markdown" disabled={isEmpty} onClick={onExportMarkdown}>
          <MarkdownIcon />
        </IconButton>
      )}
      {onExportText && (
        <IconButton label="Export text" disabled={isEmpty} onClick={onExportText}>
          <PlainTextIcon />
        </IconButton>
      )}

      {!minimal && (
      <>
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
      )}

      {onReplay && !minimal && (
        <IconButton label="Replay drawing" disabled={isEmpty} onClick={onReplay}>
          <PlayIcon />
        </IconButton>
      )}

      {onFindReplace && (
        <IconButton label="Find & replace" onClick={onFindReplace}>
          <SearchIcon />
        </IconButton>
      )}

      {(onToggleExamLock || onHideChrome) && <Divider />}
      {onToggleExamLock && (
        <IconButton
          label={examLock ? 'Exit exam lock' : 'Exam lock — pen and undo only'}
          active={examLock}
          onClick={onToggleExamLock}
        >
          <LockIcon />
        </IconButton>
      )}
      {onHideChrome && (
        <IconButton label="Distraction-free — hide all controls" onClick={onHideChrome}>
          <FocusIcon />
        </IconButton>
      )}
    </>
  );

  // Only one variant is ever mounted now — no hidden duplicate toolbar
  // (and its popovers/effects) sitting in the DOM on the other breakpoint.
  // Phase 2: bottom-anchored, thumb-reachable, 44px targets, notch-safe.
  // Same `controls` JSX — position is a wrapper concern, never a fork.
  if (position === 'bottom') {
    return (
      <LargeTargetsContext.Provider value={true}>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-2"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        >
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-panel border border-border bg-bg-muted/85 px-2 py-1.5 shadow-pop backdrop-blur-pill">
            {controls}
          </div>
        </div>
      </LargeTargetsContext.Provider>
    );
  }

  if (isDesktop) {
    // Reserve a fixed strip on the left for the menu + document-name cluster
    // (left-4 + 44px menu + gap + capped doc pill ≈ 13rem) so the pill can't
    // overlap it — but ONLY the left, since the top-right is empty. The pill
    // then gets the full remaining width and centres within it; overflow-x-auto
    // is a last-resort fallback for genuinely narrow windows.
    return (
      <div className="pointer-events-none absolute left-4 right-4 top-[4.25rem] z-20 flex justify-center">
        <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-bg-muted/80 px-2 py-1.5 shadow-pop backdrop-blur-pill">
          {controls}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 top-[4.25rem] z-20 flex flex-col items-center">
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
          <LargeTargetsContext.Provider value={true}>{controls}</LargeTargetsContext.Provider>
        </div>
      )}
    </div>
  );
}
