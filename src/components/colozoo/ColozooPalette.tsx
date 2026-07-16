/**
 * ColoZoo palette column (tablet) — the right-side named-color picker from the
 * v3 brand mockup. Colors are grouped "Core Colors" / "Colozoo Accent Colors"
 * and every swatch shows its NAME (kids learn color names; the name is spoken
 * on tap via the parent's onPick → speakColorName).
 *
 * Presentational only: all state (active color, fill mode) lives in the parent.
 */

import { COLOZOO_PALETTE_GROUPS } from '../../lib/colozoo/palettes';
import { COLOZOO_THEME } from '../../lib/colozoo/theme';

interface ColozooPaletteProps {
  /** Active color hex. */
  color: string;
  /** Pick a named color (parent speaks the name). */
  onPick: (hex: string, name: string) => void;
  /** True when the fill bucket is the active tool. */
  fillMode: boolean;
  /** Switch to the fill-bucket tool. */
  onFillMode: (on: boolean) => void;
  /** Glow mode restyles the card dark. */
  glow?: boolean;
}

export function ColozooPalette({ color, onPick, fillMode, onFillMode, glow }: ColozooPaletteProps) {
  return (
    <div
      className="hidden min-[860px]:flex w-32 shrink-0 flex-col gap-3 self-start rounded-3xl p-3 shadow-lg"
      style={{ background: glow ? '#1b1226' : '#fff' }}
    >
      <h3
        className="text-center text-lg font-semibold"
        style={{
          fontFamily: "'Fredoka', ui-rounded, system-ui, sans-serif",
          color: glow ? '#fff' : '#333',
        }}
      >
        Palette
      </h3>

      {COLOZOO_PALETTE_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <span
            className="px-1 text-[10px] font-extrabold uppercase tracking-wide"
            style={{ color: glow ? '#9a8fb0' : '#9aa' }}
          >
            {group.label}
          </span>
          {group.colors.map((c) => {
            const active = color === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                aria-label={c.name}
                aria-pressed={active}
                onClick={() => onPick(c.hex, c.name)}
                className="flex h-8 items-center rounded-xl px-2 text-xs font-extrabold transition-transform active:scale-95"
                style={{
                  background: c.hex,
                  color: pillTextColor(c.hex),
                  outline: active ? `3px solid ${COLOZOO_THEME.teal}` : 'none',
                  outlineOffset: 2,
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      ))}

      <button
        type="button"
        aria-label="Fill bucket"
        aria-pressed={fillMode}
        onClick={() => onFillMode(true)}
        className="mt-1 flex h-11 items-center justify-center rounded-2xl text-xl transition-transform active:scale-90"
        style={
          fillMode
            ? { background: COLOZOO_THEME.teal, boxShadow: `0 4px 14px ${COLOZOO_THEME.teal}66` }
            : { background: glow ? '#2a2138' : '#F4F1E8' }
        }
      >
        🪣
      </button>
    </div>
  );
}

/** Readable label color on a swatch: dark text on light fills, white on dark. */
function pillTextColor(hex: string): string {
  const n = hex.replace('#', '');
  if (n.length !== 6) return '#fff';
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  // Perceived luminance (Rec. 601).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#333' : '#fff';
}
