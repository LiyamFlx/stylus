import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { InkPoint, Stroke } from '../types';
import { COLOZOO_BRUSHES, penProfile } from '../lib/penProfiles';
import type { ColozooBrush } from '../lib/penProfiles';
import { createId } from '../lib/id';
import { useColoringPage } from '../hooks/useColoringPage';
import {
  COLOZOO_ACCENT,
  COLOZOO_BG,
  paletteForBrush,
  speakColorName,
  type NamedColor,
} from '../lib/colozoo/palettes';
import { drawColozooStroke } from '../lib/colozoo/drawStroke';

/**
 * ColozooWorkspace — the entire kids' coloring-book UI, self-contained.
 *
 * Feature isolation: this component and the lib/colozoo modules are the ONLY
 * Colozoo code. It shares the stroke DATA format (Stroke/InkPoint + pen
 * profiles) with the rest of the app but never touches useDrawing, Canvas,
 * Toolbar, useHistory, or render — it owns its own capture, rendering, and
 * chrome. Design law: a child's "wrong" colour is never wrong. Nothing here
 * corrects, locks, or blocks; it only celebrates.
 *
 * Layer stack (bottom → top):
 *   1. zone-fill SVG   — tappable regions, filled with the chosen colour
 *   2. ink <canvas>    — freehand strokes, in viewBox (0–100) coordinates
 *   3. outline SVG     — the black line-art, pointer-events:none, always on top
 *
 * The active tool decides which layer captures pointer events: the bucket lets
 * taps reach the fill SVG (canvas is inert); a brush lets the canvas capture
 * (fill SVG is inert). The outline never captures — taps always pass through it.
 */

// Base stroke size in viewBox units. penProfile.widthFor scales from here and
// clamps to COLOZOO_MIN_WIDTH so every mark stays bold (except czPorcelain).
const BASE_SIZE = 3.5;
const VIEWBOX = 100;
/** Coverage at which the celebratory "Nice!" stamp appears. */
const NICE_AT = 0.9;

type Tool = 'bucket' | 'brush';

export function ColozooWorkspace({
  documentId,
  onOpenSidebar,
}: {
  documentId: string;
  onOpenSidebar: () => void;
}) {
  const cp = useColoringPage(documentId);
  const [tool, setTool] = useState<Tool>('bucket');
  const [brush, setBrush] = useState<ColozooBrush>('czDaub');
  const [glow, setGlow] = useState(false);

  // Palette follows glow mode (neon set) or the standard tempera set.
  const palette = useMemo<readonly NamedColor[]>(
    () => paletteForBrush(glow ? 'czGlow' : brush),
    [glow, brush],
  );
  const [color, setColor] = useState<string>(palette[0].hex);

  // Keep the selected colour valid when the palette changes (glow toggle).
  useEffect(() => {
    if (!palette.some((c) => c.hex === color)) setColor(palette[0].hex);
  }, [palette, color]);

  // Glow mode implies the glow brush (its screen blend only reads on the dark
  // background); leaving glow returns to a normal opaque brush.
  useEffect(() => {
    if (glow) setBrush('czGlow');
    else setBrush((b) => (b === 'czGlow' ? 'czDaub' : b));
  }, [glow]);

  // ── Stage sizing (square, fits the available box) ──
  const stageRef = useRef<HTMLDivElement>(null);
  const [stagePx, setStagePx] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStagePx(Math.max(0, Math.min(r.width, r.height)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Ink canvas ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;

  // Repaint all committed strokes. viewBox coords → px via the stage scale, and
  // ×dpr for crispness, applied once as the base transform.
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || stagePx <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = (stagePx / VIEWBOX) * dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, VIEWBOX, VIEWBOX);
    for (const stroke of cp.ink) drawColozooStroke(ctx, stroke);
  }, [cp.ink, stagePx, dpr]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  // ── Freehand capture (viewBox coordinates) ──
  const drawing = useRef<{ points: InkPoint[]; start: number } | null>(null);

  const toViewBox = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * VIEWBOX,
      y: ((e.clientY - r.top) / r.height) * VIEWBOX,
    };
  }, []);

  const buildPoint = useCallback(
    (e: React.PointerEvent, start: number): InkPoint => {
      const { x, y } = toViewBox(e);
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const profile = penProfile(brush);
      return {
        x,
        y,
        pressure,
        width: profile.widthFor(pressure, BASE_SIZE),
        opacity: profile.opacity,
        t: start === 0 ? 0 : performance.now() - start,
      };
    },
    [brush, toViewBox],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (tool !== 'brush') return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const start = performance.now();
      const p = buildPoint(e, 0);
      drawing.current = { points: [p], start };
      // Draw an initial dot so a tap leaves a mark.
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawColozooStroke(ctx, makeStroke([p], brush, color));
    },
    [tool, buildPoint, brush, color],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drawing.current;
      if (!d) return;
      const p = buildPoint(e, d.start);
      d.points.push(p);
      // Redraw the in-progress stroke over the committed layer so smoothing
      // and textures match the final committed render exactly.
      repaint();
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawColozooStroke(ctx, makeStroke(d.points, brush, color));
    },
    [buildPoint, brush, color, repaint],
  );

  const endStroke = useCallback(() => {
    const d = drawing.current;
    drawing.current = null;
    if (!d || d.points.length === 0) return;
    cp.addStroke(makeStroke(d.points, brush, color));
  }, [cp, brush, color]);

  // ── Fill a zone ──
  const onFillZone = useCallback(
    (zoneId: string) => {
      if (tool !== 'bucket') return;
      cp.fillZone(zoneId, color);
      speakColorName(color);
    },
    [tool, cp, color],
  );

  const showNice = cp.coverage >= NICE_AT;
  const bg = glow ? '#0A0010' : COLOZOO_BG;
  const outlineStroke = glow ? '#FFFFFF' : '#1F2430';

  return (
    <div
      className="absolute inset-0 flex flex-col select-none"
      style={{ background: bg, touchAction: 'none' }}
    >
      {/* Header */}
      <header className="flex items-center gap-2 px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="grid h-10 w-10 place-items-center rounded-full text-xl"
          style={{ background: glow ? '#1A1030' : '#FFF1E6', color: COLOZOO_ACCENT }}
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black" style={{ color: glow ? '#fff' : '#2A2320' }}>
            {cp.book.emoji} {cp.page.name}
          </div>
          <div className="text-[11px] font-semibold" style={{ color: COLOZOO_ACCENT }}>
            Create Happiness
          </div>
        </div>
        {/* Stars for this page */}
        <div aria-label={`${cp.stars} of 3 stars`} className="text-xl tracking-tight">
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ opacity: i < cp.stars ? 1 : 0.25 }}>
              ⭐
            </span>
          ))}
        </div>
      </header>

      {/* Book switcher */}
      <div className="flex items-center justify-center gap-2 px-3 pb-1">
        {cp.books.map((b) => {
          const active = b.id === cp.book.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => cp.switchBook(b.id)}
              aria-pressed={active}
              className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold transition-transform active:scale-95"
              style={{
                background: active ? COLOZOO_ACCENT : glow ? '#1A1030' : '#FFF1E6',
                color: active ? '#fff' : glow ? '#fff' : '#2A2320',
              }}
            >
              <span aria-hidden>{b.emoji}</span>
              {b.name}
            </button>
          );
        })}
      </div>

      {/* Stage */}
      <div ref={stageRef} className="relative flex-1 overflow-hidden p-3">
        {stagePx > 0 && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-3xl shadow-lg"
            style={{ width: stagePx, height: stagePx, background: glow ? '#050008' : '#fff' }}
          >
            {/* 1 — zone fills */}
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full"
              style={{ pointerEvents: tool === 'bucket' ? 'auto' : 'none' }}
            >
              {cp.page.zones.map((z) => (
                <path
                  key={z.id}
                  d={z.d}
                  fill={cp.fills[z.id] ?? 'transparent'}
                  onPointerDown={() => onFillZone(z.id)}
                  style={{ cursor: tool === 'bucket' ? 'pointer' : 'default' }}
                />
              ))}
            </svg>

            {/* 2 — freehand ink */}
            <canvas
              ref={canvasRef}
              width={Math.round(stagePx * dpr)}
              height={Math.round(stagePx * dpr)}
              className="absolute inset-0 h-full w-full"
              style={{ pointerEvents: tool === 'brush' ? 'auto' : 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
            />

            {/* 3 — outline (always on top, never captures pointer events) */}
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full"
              style={{ pointerEvents: 'none' }}
              aria-label={`Coloring page: ${cp.page.name}`}
            >
              <path
                d={cp.page.outline}
                fill="none"
                stroke={outlineStroke}
                strokeWidth={1.1}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>

            {/* Celebratory stamp — appears, never blocks */}
            {showNice && (
              <div
                className="pointer-events-none absolute inset-0 grid place-items-center"
                aria-hidden
              >
                <div
                  className="rotate-[-8deg] rounded-2xl px-6 py-2 text-3xl font-black text-white shadow-xl"
                  style={{ background: COLOZOO_ACCENT }}
                >
                  Nice!
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Page dots */}
      <div className="flex items-center justify-center gap-3 py-1">
        <NavArrow dir="prev" onClick={cp.prevPage} disabled={cp.pageIndex === 0} glow={glow} />
        <div className="flex items-center gap-2">
          {Array.from({ length: cp.pageCount }, (_, i) => {
            const active = i === cp.pageIndex;
            const done = cp.bookStars[i] >= 3;
            return (
              <button
                key={i}
                type="button"
                aria-label={`Page ${i + 1}${done ? ', complete' : ''}`}
                aria-current={active}
                onClick={() => cp.goToPage(i)}
                className="grid place-items-center rounded-full transition-transform active:scale-90"
                style={{
                  width: active ? 16 : 12,
                  height: active ? 16 : 12,
                  background: done ? '#22C55E' : active ? COLOZOO_ACCENT : glow ? '#3A2A50' : '#E8D9CC',
                }}
              />
            );
          })}
        </div>
        <NavArrow
          dir="next"
          onClick={cp.nextPage}
          disabled={cp.pageIndex === cp.pageCount - 1}
          glow={glow}
        />
      </div>

      {/* Palette */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-1">
        {palette.map((c) => {
          const active = c.hex === color;
          return (
            <button
              key={c.hex}
              type="button"
              aria-label={c.name}
              aria-pressed={active}
              title={c.name}
              onClick={() => {
                setColor(c.hex);
                speakColorName(c.hex);
              }}
              className="rounded-full transition-transform active:scale-90"
              style={{
                width: active ? 40 : 34,
                height: active ? 40 : 34,
                background: c.hex,
                border: active ? '3px solid #fff' : '2px solid rgba(0,0,0,0.15)',
                boxShadow: active ? `0 0 0 3px ${COLOZOO_ACCENT}` : 'none',
              }}
            />
          );
        })}
      </div>

      {/* Tools: fill bucket (primary), brushes, undo */}
      <div className="flex items-center gap-2 px-3 pb-3 pt-1">
        <button
          type="button"
          onClick={() => setTool('bucket')}
          aria-pressed={tool === 'bucket'}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-black transition-transform active:scale-95"
          style={{
            background: tool === 'bucket' ? COLOZOO_ACCENT : glow ? '#1A1030' : '#FFF1E6',
            color: tool === 'bucket' ? '#fff' : COLOZOO_ACCENT,
            outline: tool === 'bucket' ? `3px solid ${COLOZOO_ACCENT}` : 'none',
          }}
        >
          <span aria-hidden className="text-2xl">🪣</span>
          Fill
        </button>

        <div className="flex flex-1 gap-1 overflow-x-auto">
          {COLOZOO_BRUSHES.map((b) => {
            const active = tool === 'brush' && b === brush;
            const label = penProfile(b).label;
            return (
              <button
                key={b}
                type="button"
                aria-label={label}
                aria-pressed={active}
                title={label}
                onClick={() => {
                  setBrush(b);
                  setTool('brush');
                }}
                className="grid h-14 min-w-[3rem] place-items-center rounded-2xl text-xl transition-transform active:scale-95"
                style={{
                  background: active ? COLOZOO_ACCENT : glow ? '#1A1030' : '#FFF1E6',
                  color: active ? '#fff' : glow ? '#fff' : '#2A2320',
                }}
              >
                {BRUSH_GLYPH[b]}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={cp.undo}
          aria-label="Undo"
          className="grid h-14 w-14 place-items-center rounded-2xl text-2xl transition-transform active:scale-90"
          style={{ background: glow ? '#1A1030' : '#FFF1E6', color: glow ? '#fff' : '#2A2320' }}
        >
          ↩️
        </button>

        <button
          type="button"
          onClick={() => setGlow((g) => !g)}
          aria-label="Glow mode"
          aria-pressed={glow}
          className="grid h-14 w-14 place-items-center rounded-2xl text-2xl transition-transform active:scale-90"
          style={{ background: glow ? COLOZOO_ACCENT : '#FFF1E6', color: glow ? '#fff' : '#2A2320' }}
        >
          ✨
        </button>
      </div>
    </div>
  );
}

/** A friendly glyph per brush for the picker (labels come from penProfile). */
const BRUSH_GLYPH: Record<ColozooBrush, string> = {
  czDaub: '🔵',
  czMarker: '🖊️',
  czPaintbrush: '🖌️',
  czPencil: '✏️',
  czChalk: '🩶',
  czColorPencil: '🖍️',
  czCrayon: '🖍️',
  czMagicMarker: '🌈',
  czPorcelain: '🪶',
  czGlow: '💡',
  czCeramic: '💠',
};

function NavArrow({
  dir,
  onClick,
  disabled,
  glow,
}: {
  dir: 'prev' | 'next';
  onClick: () => void;
  disabled: boolean;
  glow: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Previous page' : 'Next page'}
      className="grid h-9 w-9 place-items-center rounded-full text-lg font-black transition-transform active:scale-90 disabled:opacity-25"
      style={{ background: glow ? '#1A1030' : '#FFF1E6', color: COLOZOO_ACCENT }}
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

function makeStroke(points: InkPoint[], brush: ColozooBrush, color: string): Stroke {
  return { id: `cz_${createId()}`, color, size: BASE_SIZE, penType: brush, points };
}
