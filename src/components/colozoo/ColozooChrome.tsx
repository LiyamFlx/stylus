/**
 * ColoZoo v3 chrome primitives — rail buttons, line icons, decorations.
 * Icons are inline SVG line art (v3 uses clean line icons, never emoji).
 */

import type { ReactNode } from 'react';
import { COLOZOO_THEME, LEAF_SVG, SPARKLE_PATH } from '../../lib/colozoo/theme';

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function IconUndo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M8 5 4 9l4 4" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

export function IconRedo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M16 5l4 4-4 4" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  );
}

export function IconEraser({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M5 16 14.5 6.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L10 21H6l-1-1a2 2 0 0 1 0-2.8Z" />
      <path d="M12 9l5 5" />
      <path d="M10 21h10" />
    </svg>
  );
}

export function IconGear({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
  );
}

export function IconShare({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/** White rounded-square rail button with a small label underneath (v3). */
export function RailButton({
  label,
  onClick,
  active,
  disabled,
  glow,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  glow?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="flex w-14 flex-col items-center gap-0.5 rounded-2xl py-1.5 shadow-sm transition-transform active:scale-90 disabled:opacity-40"
      style={{
        background: active ? COLOZOO_THEME.teal : glow ? '#1b1226' : '#fff',
        color: active ? '#fff' : glow ? '#eee' : '#5A6B70',
      }}
    >
      {children}
      <span className="text-[10px] font-extrabold">{label}</span>
    </button>
  );
}

/** Pale leaf corner motif (decoration, pointer-events none). */
export function LeafMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden style={{ pointerEvents: 'none' }}>
      <g fill={COLOZOO_THEME.teal} opacity="0.18">
        <path d={LEAF_SVG.leafA} transform="translate(20 60) scale(1.3) rotate(-20 50 50)" />
        <path d={LEAF_SVG.leafB} transform="translate(70 90) scale(1.05) rotate(24 50 50)" />
        <path d={LEAF_SVG.leafA} transform="translate(0 120) scale(0.8) rotate(8 50 50)" />
      </g>
    </svg>
  );
}

/** Little four-point sparkles scattered near the canvas (v3). */
export function Sparkle({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden style={{ pointerEvents: 'none' }}>
      <path d={SPARKLE_PATH} fill="#fff" opacity="0.9" />
    </svg>
  );
}

/** The branded Colozoo stylus, drawn as vector (v3 shows it leaning on the
 *  page edge). Diagonal pen: teal cap, white barrel with wordmark, teal nib. */
export function StylusDecor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 340" className={className} aria-hidden style={{ pointerEvents: 'none' }}>
      <g transform="rotate(18 60 170)">
        {/* cap */}
        <rect x="42" y="8" width="36" height="52" rx="14" fill={COLOZOO_THEME.teal} />
        {/* barrel */}
        <rect x="42" y="54" width="36" height="200" rx="10" fill="#fff" stroke="#E3EEF0" strokeWidth="1.5" />
        {/* wordmark down the barrel */}
        <text
          x="60"
          y="150"
          fontFamily="'Nunito', ui-rounded, sans-serif"
          fontWeight="900"
          fontSize="17"
          fill={COLOZOO_THEME.teal}
          textAnchor="middle"
          transform="rotate(90 60 150)"
          letterSpacing="1"
        >
          colozoo
        </text>
        {/* grip ring */}
        <rect x="42" y="250" width="36" height="14" rx="7" fill={COLOZOO_THEME.teal} />
        {/* nib */}
        <path d="M48 262 L60 306 L72 262 Z" fill="#fff" stroke="#E3EEF0" strokeWidth="1.5" />
        <circle cx="60" cy="300" r="7" fill="#E73F3E" />
      </g>
    </svg>
  );
}
