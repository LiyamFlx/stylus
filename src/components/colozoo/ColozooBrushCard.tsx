/**
 * ColozooBrushCard — white rounded popover for picking a brush family and
 * brush size. Anchored off the left rail's brush FAB. Self-contained: reads
 * BRUSH_FAMILIES/familyForBrush (Task 3) and renders nothing when closed.
 */

import { BRUSH_FAMILIES, familyForBrush } from '../../lib/colozoo/brushFamilies';
import type { ColozooBrush } from '../../lib/penProfiles';
import { COLOZOO_ACCENT } from '../../lib/colozoo/palettes';

const FAMILY_ICON: Record<string, string> = {
  'magic-pens': '🖊️',
  'paint-brushes': '🖌️',
  'ceramic-markers': '🏺',
  'fabric-paint': '🖍️',
};

interface ColozooBrushCardProps {
  open: boolean;
  brush: ColozooBrush;
  size: number;
  onPickFamily: (primary: ColozooBrush) => void;
  onSize: (n: number) => void;
  onClose: () => void;
}

export function ColozooBrushCard({ open, brush, size, onPickFamily, onSize, onClose }: ColozooBrushCardProps) {
  if (!open) return null;
  const activeFamily = familyForBrush(brush);

  return (
    <div
      className="absolute left-full top-0 z-40 ml-3 w-64 rounded-3xl bg-white p-3 shadow-xl"
      role="dialog"
      aria-label="Brush selection"
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <h2
          className="text-lg font-semibold text-gray-800"
          style={{ fontFamily: "'Fredoka', ui-rounded, system-ui, sans-serif" }}
        >
          Brush selection
        </h2>
        <button
          type="button"
          aria-label="Close brush selection"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {BRUSH_FAMILIES.map((family) => {
          const active = activeFamily === family.id;
          return (
            <button
              key={family.id}
              type="button"
              aria-pressed={active}
              onClick={() => onPickFamily(family.primary)}
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors"
              style={active ? { background: '#FFF0E6' } : undefined}
            >
              <span className="text-2xl">{FAMILY_ICON[family.id] ?? '🖌️'}</span>
              <span className="flex-1 text-base font-extrabold" style={{ color: active ? COLOZOO_ACCENT : '#444' }}>
                {family.label}
              </span>
              {family.badge && (
                <span
                  className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ background: '#F4F1E8', color: '#888' }}
                >
                  {family.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-gray-100 px-1 pt-3">
        <label htmlFor="colozoo-brush-size" className="mb-1 block text-sm font-extrabold text-gray-600">
          Brush size
        </label>
        <input
          id="colozoo-brush-size"
          type="range"
          min={4}
          max={30}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="w-full accent-orange-500"
          style={{ accentColor: COLOZOO_ACCENT }}
        />
      </div>
    </div>
  );
}
