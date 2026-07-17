/**
 * ColoZoo v3 palette column — full-width named color bars grouped by side
 * brackets ("Core Colors" / "Colozoo Accent Colors"). Text sits ON the fill
 * with contrast-computed color; the White bar carries the round "Washes Out"
 * product badge, exactly as the v3 mockup lays it out.
 */

import { COLOZOO_PALETTE_GROUPS } from '../../lib/colozoo/palettes';
import { COLOZOO_THEME, textOn } from '../../lib/colozoo/theme';

interface Props {
  color: string;
  onPick: (hex: string, name: string) => void;
  glow?: boolean;
  /** Compact = phone bottom sheet (no brackets, tighter bars). */
  compact?: boolean;
}

/** Curly bracket spanning a group, opening toward the bars (right). */
function Bracket({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center gap-1">
      <span
        className="max-w-16 text-right text-[11px] font-black leading-tight"
        style={{ color: COLOZOO_THEME.ink }}
      >
        {label}
      </span>
      <svg viewBox="0 0 14 100" preserveAspectRatio="none" className="h-[92%] w-3.5" aria-hidden>
        <path
          d="M12 2 C5 2 8 24 2 50 C8 76 5 98 12 98"
          fill="none"
          stroke={COLOZOO_THEME.ink}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function ColozooPalette({ color, onPick, glow, compact }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {COLOZOO_PALETTE_GROUPS.map((group) => (
        <div key={group.label} className="flex items-stretch gap-1.5">
          {!compact && <Bracket label={group.label} />}
          <div
            className="flex flex-1 flex-col gap-1.5 rounded-2xl p-2 shadow-md"
            style={{ background: glow ? '#1b1226' : COLOZOO_THEME.card }}
          >
            {compact && (
              <div className="px-1 pt-0.5 text-[11px] font-black" style={{ color: glow ? '#cbd8da' : '#7C8A8E' }}>
                {group.label}
              </div>
            )}
            {group.colors.map((c) => {
              const active = color === c.hex;
              const isWhite = c.hex.toUpperCase() === '#FFFFFF';
              return (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={c.name}
                  aria-pressed={active}
                  onClick={() => onPick(c.hex, c.name)}
                  className="relative flex h-9 w-full items-center rounded-xl px-3 text-sm font-extrabold transition-transform active:scale-95"
                  style={{
                    background: c.hex,
                    color: textOn(c.hex),
                    boxShadow: isWhite ? 'inset 0 0 0 1.5px #E2E8EA' : undefined,
                    outline: active ? `3px solid ${COLOZOO_THEME.teal}` : 'none',
                    outlineOffset: 1.5,
                  }}
                >
                  {c.name}
                  {isWhite && (
                    <span
                      className="absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-center text-[7px] font-black leading-tight text-white shadow-md"
                      style={{ background: COLOZOO_THEME.badge }}
                    >
                      Washes Out
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
