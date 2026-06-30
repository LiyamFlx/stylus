import { useState } from 'react';
import { worldToScreen, type ViewTransform, type Bounds } from '../lib/geometry';
import { PRESET_COLORS } from '../types';
import {
  TrashIcon,
  CopyIcon,
  DuplicateIcon,
  TypeIcon,
  SparkleIcon,
  PaperIcon,
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
}

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
}: SelectionToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);

  if (!bounds || selectedCount === 0 || phase === 'moving') return null;

  // Anchor: horizontal center of the selection, just above its top edge.
  const topLeft = worldToScreen(bounds.minX, bounds.minY, view);
  const topRight = worldToScreen(bounds.maxX, bounds.minY, view);
  const centerX = (topLeft.x + topRight.x) / 2;
  const top = Math.max(8, topLeft.y - 52);

  return (
    <div
      className="pointer-events-auto absolute z-30 -translate-x-1/2"
      style={{ left: centerX, top }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-bg-muted/90 px-2 py-1.5 shadow-pop backdrop-blur-pill">
        <ToolbarButton label="Convert to text" onClick={onConvert}>
          <TypeIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Ask Stylus" onClick={onAsk}>
          <SparkleIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Translate" onClick={onTranslate}>
          <GlobeIcon size={18} />
        </ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-border-strong" aria-hidden />
        <ToolbarButton label="Copy text" onClick={onCopy}>
          <CopyIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Duplicate" onClick={onDuplicate}>
          <DuplicateIcon size={18} />
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton label="Change color" onClick={() => setColorOpen((o) => !o)}>
            <PaperIcon size={18} />
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
        <ToolbarButton label="Delete" onClick={onDelete}>
          <TrashIcon size={18} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10"
    >
      {children}
    </button>
  );
}
