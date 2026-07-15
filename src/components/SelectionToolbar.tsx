import { useEffect, useRef, useState } from 'react';
import { worldToScreen, type ViewTransform, type Bounds } from '../lib/geometry';
import { PRESET_COLORS } from '../types';
import {
  TrashIcon,
  CopyIcon,
  DuplicateIcon,
  TypeIcon,
  SparkleIcon,
  GlobeIcon,
} from './icons';

interface SelectionToolbarProps {
  bounds: Bounds | null;
  selectedCount: number;
  phase: string;
  view: ViewTransform;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onRecolor: (color: string) => void;
  onConvert: () => void;
  onAsk: () => void;
  onTranslate: () => void;
  /** Recognition in flight — disable actions that start a new OCR job. */
  busy: boolean;
}

const TOOLBAR_HALF_WIDTH = 160; // ~pill width / 2, for viewport clamping

/**
 * Floating actions pill anchored above a lasso selection. World-space bounds →
 * screen via the live view, so it tracks zoom/pan. Hidden unless there's a
 * settled (non-moving) non-empty selection.
 */
export function SelectionToolbar({
  bounds,
  selectedCount,
  phase,
  view,
  onDelete,
  onDuplicate,
  onCopy,
  onRecolor,
  onConvert,
  onAsk,
  onTranslate,
  busy,
}: SelectionToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  const hidden =
    !bounds ||
    selectedCount === 0 ||
    phase === 'moving' ||
    phase === 'lasso' ||
    phase === 'resizing' ||
    phase === 'rotating';

  // Close the color popover whenever the selection changes or disappears —
  // the pill stays mounted for the whole select-tool session, so stale open
  // state would otherwise resurface on the next selection.
  useEffect(() => {
    setColorOpen(false);
  }, [bounds, selectedCount]);

  // Outside-click / Escape to close, matching the app's other popovers. Uses
  // pointerdown, not mousedown, for pen/touch in embedded WebViews.
  useEffect(() => {
    if (!colorOpen) return;
    const onDown = (e: PointerEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setColorOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [colorOpen]);

  if (hidden) return null;

  // Anchor: horizontal center of the selection, just above its top edge —
  // clamped so the pill never runs off the viewport for edge selections.
  const topLeft = worldToScreen(bounds.minX, bounds.minY, view);
  const topRight = worldToScreen(bounds.maxX, bounds.minY, view);
  const rawCenterX = (topLeft.x + topRight.x) / 2;
  const centerX = Math.min(
    Math.max(rawCenterX, TOOLBAR_HALF_WIDTH),
    window.innerWidth - TOOLBAR_HALF_WIDTH,
  );
  const top = Math.max(8, topLeft.y - 52);

  return (
    <div
      className="pointer-events-auto absolute z-30 -translate-x-1/2"
      style={{ left: centerX, top }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-bg-muted/90 px-2 py-1.5 shadow-pop backdrop-blur-pill">
        <ToolbarButton label="Convert to text" onClick={onConvert} disabled={busy}>
          <TypeIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Ask Stylus" onClick={onAsk} disabled={busy}>
          <SparkleIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Translate" onClick={onTranslate} disabled={busy}>
          <GlobeIcon size={18} />
        </ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-border-strong" aria-hidden />
        <ToolbarButton label="Copy text" onClick={onCopy} disabled={busy}>
          <CopyIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Duplicate" onClick={onDuplicate} disabled={busy}>
          <DuplicateIcon size={18} />
        </ToolbarButton>
        <div ref={colorRef} className="relative">
          <ToolbarButton
            label="Change color"
            onClick={() => setColorOpen((o) => !o)}
            disabled={busy}
          >
            {/* Swatch, not an icon — matches ColorPicker's pattern instead of
                misusing PaperIcon. */}
            <span className="h-[18px] w-[18px] rounded-full border border-border-strong bg-[conic-gradient(from_0deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)]" />
          </ToolbarButton>
          {colorOpen && (
            <div className="absolute left-1/2 top-full z-40 mt-2 flex -translate-x-1/2 gap-1.5 rounded-panel border border-border bg-bg-muted/95 p-2 shadow-pop backdrop-blur-pill">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Recolor ${c}`}
                  onClick={() => {
                    onRecolor(c);
                    setColorOpen(false);
                  }}
                  className="h-6 w-6 rounded-full border border-border-strong transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>
        <span className="mx-0.5 h-5 w-px bg-border-strong" aria-hidden />
        <ToolbarButton label="Delete" onClick={onDelete} disabled={busy}>
          <TrashIcon size={18} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
