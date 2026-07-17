/**
 * ColoZoo v3 brush selection — the OPEN, labeled card ("Brush selection"):
 * four product-family rows with real icons and product badges, plus the
 * brush-size slider. Always visible on tablet/desktop; the same card renders
 * inside the phone bottom sheet.
 */

import { BRUSH_FAMILIES } from '../../lib/colozoo/brushFamilies';
import { COLOZOO_THEME } from '../../lib/colozoo/theme';

const FAMILY_ICON: Record<string, string> = {
  'magic-pens': '/colozoo/ui/brush-magic.png',
  'paint-brushes': '/colozoo/ui/brush-paint.png',
  'ceramic-markers': '/colozoo/ui/brush-ceramic.png',
  'fabric-paint': '/colozoo/ui/brush-fabric.png',
};

interface Props {
  activeFamily: string;
  onPickFamily: (familyId: string) => void;
  brushSize: number;
  onBrushSize: (n: number) => void;
  glow?: boolean;
}

export function ColozooBrushCard({ activeFamily, onPickFamily, brushSize, onBrushSize, glow }: Props) {
  return (
    <div
      className="w-60 rounded-3xl p-4 shadow-md"
      style={{ background: glow ? '#1b1226' : COLOZOO_THEME.card }}
    >
      <h3 className="mb-3 text-lg font-black" style={{ color: glow ? '#fff' : COLOZOO_THEME.ink }}>
        Brush selection
      </h3>
      <div className="flex flex-col gap-2">
        {BRUSH_FAMILIES.map((f) => {
          const active = f.id === activeFamily;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => onPickFamily(f.id)}
              className="relative flex h-12 items-center gap-3 rounded-2xl px-3 text-left transition-transform active:scale-95"
              style={{
                background: active ? COLOZOO_THEME.mint : glow ? '#241a33' : '#F7FAFA',
                outline: active ? `2px solid ${COLOZOO_THEME.teal}` : 'none',
              }}
            >
              <img src={FAMILY_ICON[f.id]} alt="" className="h-8 w-8 object-contain" draggable={false} />
              <span className="text-sm font-extrabold" style={{ color: glow ? '#fff' : COLOZOO_THEME.ink }}>
                {f.label}
              </span>
              {f.badge && (
                <span
                  className="absolute -right-2 -top-2 flex h-11 w-11 items-center justify-center rounded-full text-center text-[8px] font-black leading-tight text-white shadow-md"
                  style={{ background: COLOZOO_THEME.badge }}
                >
                  {f.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <div className="mb-1 text-sm font-black" style={{ color: glow ? '#fff' : COLOZOO_THEME.ink }}>
          Brush size
        </div>
        <input
          type="range"
          min={4}
          max={28}
          step={1}
          value={brushSize}
          aria-label="Brush size"
          onChange={(e) => onBrushSize(Number(e.target.value))}
          className="colozoo-slider w-full"
          style={{ accentColor: COLOZOO_THEME.teal }}
        />
      </div>
    </div>
  );
}
