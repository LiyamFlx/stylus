/**
 * ColoZoo mode workspace — the whole kid-facing coloring UI.
 *
 * Fully self-contained (useLearningAudio isolation pattern): its own brush
 * picker, named-color pots, freehand ink layer, flood-fill interaction, glow
 * mode, stars, and undo. It shares the stroke DATA format (Stroke/InkPoint +
 * penProfiles) but none of the core drawing components — Canvas/Toolbar/
 * useDrawing are untouched.
 *
 * Layer stack (bottom → top):
 *   cream page → backgroundSvg → zone fills (SVG, tappable) →
 *   freehand ink (canvas) → outlines (SVG, pointer-events: none) → UI chrome
 *
 * Philosophy: a child's "wrong" color is never wrong. Nothing here corrects,
 * locks, or blocks — it only celebrates.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InkPoint, Stroke } from '../types';
import { penProfile, COLOZOO_BRUSHES, type ColozooBrush } from '../lib/penProfiles';
import { COLOZOO_BOOKS } from '../lib/colozoo/books';
import {
  COLOZOO_ACCENT,
  COLOZOO_BG,
  COLOZOO_GLOW_BG,
  paletteForBrush,
  speakColorName,
} from '../lib/colozoo/palettes';
import { colozooInkKey } from '../lib/colozoo/storage';
import { useColoringPage } from '../hooks/useColoringPage';
import { createId } from '../lib/id';
import { hexToHsb, hsbToHex } from '../lib/color';
import { fireConfetti } from '../lib/confetti';
import { saveColozooPage } from '../lib/colozoo/exportPage';
import { useShakeUndo, requestShakePermission } from '../hooks/useShakeUndo';

interface ColozooWorkspaceProps {
  documentId: string;
  onOpenSidebar: () => void;
}

const BRUSH_EMOJI: Record<ColozooBrush, string> = {
  czDaub: '🔴',
  czMarker: '🖊️',
  czPaintbrush: '🖌️',
  czPencil: '✏️',
  czChalk: '🩶',
  czColorPencil: '🌈',
  czCrayon: '🖍️',
  czMagicMarker: '✨',
  czPorcelain: '🪶',
  czGlow: '💡',
  czCeramic: '🏺',
};

/** Read/write one page's freehand strokes (kid docs are small — plain JSON). */
function readStrokes(key: string): Stroke[] {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as { strokes?: Stroke[] }) : null;
    return Array.isArray(v?.strokes) ? v!.strokes! : [];
  } catch {
    return [];
  }
}
function writeStrokes(key: string, strokes: Stroke[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ strokes }));
  } catch {
    // never interrupt a kid mid-mark for a quota problem
  }
}

// ── Brush textures (ColoZoo-only; render.ts is never touched) ────────────────
// Everything here is DETERMINISTIC — a pure function of point coords/index, not
// Math.random — because redraw() repaints every stroke on every frame of a
// gesture. Random texture would crawl; hashed texture stays put.

function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Unit vector perpendicular to a→b. */
function perp(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** Paintbrush bristle wobble: nudge points ±3px along their perpendicular,
 *  scaled by drawing speed. Returns a new array (never mutates input). */
function jitterPoints(points: InkPoint[]): InkPoint[] {
  const MAX = 3;
  return points.map((p, i) => {
    if (i === 0) return p;
    const prev = points[i - 1];
    const velocity = Math.hypot(p.x - prev.x, p.y - prev.y);
    const amount = Math.min(velocity * 0.4, MAX) * (hash01(i * 2.7 + p.x) - 0.5) * 2;
    const n = perp(prev.x, prev.y, p.x, p.y);
    return { ...p, x: p.x + n.x * amount, y: p.y + n.y * amount };
  });
}

/** Pencil/chalk grain: scatter faint speckles across the stroke width. */
function stipple(ctx: CanvasRenderingContext2D, pts: InkPoint[], color: string, dense: boolean): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  const per = dense ? 5 : 3;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const w = p.width ?? 8;
    const n = perp(pts[i - 1].x, pts[i - 1].y, p.x, p.y);
    for (let k = 0; k < per; k++) {
      const seed = i * 7.3 + k * 3.1;
      const off = (hash01(seed) - 0.5) * w;
      const r = (0.1 + hash01(seed + 1) * 0.16) * w;
      ctx.globalAlpha = 0.1 + hash01(seed + 2) * 0.18;
      ctx.beginPath();
      ctx.arc(p.x + n.x * off, p.y + n.y * off, Math.max(0.5, r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Ceramic gloss: a thin bright streak riding just off the stroke centre. */
function shimmer(ctx: CanvasRenderingContext2D, pts: InkPoint[], color: string): void {
  const hsb = hexToHsb(color);
  const hi = hsb ? hsbToHex({ h: hsb.h, s: hsb.s * 0.4, b: Math.min(1, hsb.b * 1.5 + 0.3) }) : '#ffffff';
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = hi;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const w = p.width ?? 8;
    const n = perp(pts[Math.max(0, i - 1)].x, pts[Math.max(0, i - 1)].y, p.x, p.y);
    const x = p.x + n.x * w * 0.2;
    const y = p.y + n.y * w * 0.2;
    ctx.lineWidth = w * 0.28;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function ColozooWorkspace({ documentId, onOpenSidebar }: ColozooWorkspaceProps) {
  const coloring = useColoringPage(documentId, COLOZOO_BOOKS[0].id);
  const [brush, setBrush] = useState<ColozooBrush>('czCrayon');
  const palette = paletteForBrush(brush);
  const [color, setColor] = useState(palette[0].hex);
  const [glow, setGlow] = useState(false);
  const [fillMode, setFillMode] = useState(true); // fill bucket = primary action
  const [hint, setHint] = useState<string | null>(null);
  const [showNice, setShowNice] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  // Load Nunito once, on mode entry only.
  useEffect(() => {
    const id = 'colozoo-nunito';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;800;900&display=swap';
    document.head.appendChild(link);
  }, []);

  // Palette switches with brush type (SKU sets); keep color valid.
  useEffect(() => {
    const p = paletteForBrush(brush);
    if (!p.some((c) => c.hex === color)) setColor(p[0].hex);
    if (brush === 'czGlow') setGlow(true);
  }, [brush]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Freehand ink layer ──────────────────────────────────────────────────────
  const page = coloring.page;
  const inkKey = page ? colozooInkKey(documentId, page.id) : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const liveStroke = useRef<Stroke | null>(null);
  const startedAt = useRef(0);
  // Ordered mark log — the ONE undo button dispatches to strokes or fills by
  // whichever the child did last.
  const markLog = useRef<('stroke' | 'fill')[]>([]);
  // Shake-to-undo permission is asked lazily on first interaction (iOS rule).
  const askedShake = useRef(false);
  const wasComplete = useRef(false);
  const requestShakeOnce = useCallback(() => {
    if (askedShake.current) return;
    askedShake.current = true;
    void requestShakePermission();
  }, []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, s: Stroke) => {
    const brush = (s.penType ?? 'czCrayon') as ColozooBrush;
    const prof = penProfile(brush);
    ctx.save();
    ctx.globalCompositeOperation = prof.blend ?? 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = prof.opacity;

    // Paintbrush frays with speed; every other brush traces the exact path.
    const pts = brush === 'czPaintbrush' ? jitterPoints(s.points) : s.points;

    if (pts.length === 1) {
      const w = pts[0].width ?? prof.widthFor(pts[0].pressure, s.size);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Magic marker: hue rotates +2° per 100px along the stroke's length.
    const baseHsb = brush === 'czMagicMarker' ? hexToHsb(s.color) : null;
    let lengthSoFar = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (baseHsb) {
        lengthSoFar += Math.hypot(b.x - a.x, b.y - a.y);
        ctx.strokeStyle = hsbToHex({ ...baseHsb, h: baseHsb.h + (lengthSoFar / 100) * 2 });
      }
      ctx.beginPath();
      ctx.lineWidth = b.width ?? prof.widthFor(b.pressure, s.size);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Texture overlays on top of the base line.
    if (brush === 'czPencil') stipple(ctx, pts, s.color, false);
    else if (brush === 'czChalk') stipple(ctx, pts, s.color, true);
    else if (brush === 'czCeramic') shimmer(ctx, pts, s.color);

    ctx.restore();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    if (liveStroke.current) drawStroke(ctx, liveStroke.current);
    ctx.restore();
  }, [drawStroke]);

  // (Re)load strokes when the page changes; size canvas to its box.
  useEffect(() => {
    strokesRef.current = inkKey ? readStrokes(inkKey) : [];
    liveStroke.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [inkKey, redraw]);

  const buildPoint = useCallback(
    (e: React.PointerEvent, t0: number): InkPoint => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const prof = penProfile(brush);
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure,
        width: prof.widthFor(pressure, 8),
        opacity: prof.opacity,
        t: performance.now() - t0,
      };
    },
    [brush],
  );

  const commitStroke = useCallback(() => {
    const s = liveStroke.current;
    liveStroke.current = null;
    if (!s || !inkKey) return;
    strokesRef.current = [...strokesRef.current, s];
    markLog.current.push('stroke');
    writeStrokes(inkKey, strokesRef.current);
    coloring.markInk();
    redraw();
  }, [inkKey, coloring, redraw]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (fillMode || !page) return;
      requestShakeOnce();
      e.currentTarget.setPointerCapture(e.pointerId);
      startedAt.current = performance.now();
      const point = buildPoint(e, startedAt.current);
      const s: Stroke = {
        id: createId('s_'),
        startedAt: Date.now(),
        color,
        size: 8,
        penType: brush,
        points: [point],
      };
      if (brush === 'czDaub') {
        // Dauber: one tap, one dot — commit immediately, no drag stroke.
        liveStroke.current = s;
        commitStroke();
        return;
      }
      liveStroke.current = s;
      redraw();
    },
    [fillMode, page, buildPoint, color, brush, commitStroke, redraw, requestShakeOnce],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!liveStroke.current || brush === 'czDaub') return;
      liveStroke.current.points.push(buildPoint(e, startedAt.current));
      redraw();
    },
    [brush, buildPoint, redraw],
  );

  const onPointerUp = useCallback(() => {
    if (liveStroke.current) commitStroke();
  }, [commitStroke]);

  // ── Zone fill ───────────────────────────────────────────────────────────────
  const hintTimer = useRef<number | undefined>(undefined);
  const onZoneTap = useCallback(
    (zoneId: string) => {
      const zone = page?.zones.find((z) => z.id === zoneId);
      if (!zone) return;
      requestShakeOnce();
      coloring.fillZone(zoneId, color);
      markLog.current.push('fill');
      if (zone.educationalHint) {
        setHint(zone.educationalHint);
        window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(null), 2000);
      }
    },
    [page, color, coloring, requestShakeOnce],
  );

  // "Nice!" stamp at ≥90% zone coverage (fires once per crossing).
  const coverage = page ? Object.keys(coloring.fills).length / Math.max(1, page.zones.length) : 0;
  const crossedNice = useRef(false);
  useEffect(() => {
    if (coverage >= 0.9 && !crossedNice.current) {
      crossedNice.current = true;
      setShowNice(true);
      const t = window.setTimeout(() => setShowNice(false), 1800);
      return () => window.clearTimeout(t);
    }
    if (coverage < 0.9) crossedNice.current = false;
  }, [coverage]);

  // ── Undo: one big button, dispatches to the last kind of mark ──────────────
  const undo = useCallback(() => {
    const last = markLog.current.pop();
    if (last === 'stroke' && inkKey && strokesRef.current.length > 0) {
      strokesRef.current = strokesRef.current.slice(0, -1);
      writeStrokes(inkKey, strokesRef.current);
      redraw();
      return;
    }
    if (last === 'fill') {
      coloring.undoFill();
      return;
    }
    // Log empty/desynced (e.g. after page flip) — try fills, then strokes.
    if (!coloring.undoFill() && inkKey && strokesRef.current.length > 0) {
      strokesRef.current = strokesRef.current.slice(0, -1);
      writeStrokes(inkKey, strokesRef.current);
      redraw();
    }
  }, [inkKey, coloring, redraw]);

  // Shake the tablet to undo the last mark (device-only; no-op on desktop).
  useShakeUndo(undo);

  // Page flips invalidate the mark log ordering for strokes on other pages.
  useEffect(() => {
    markLog.current = [];
  }, [page?.id]);

  const pickColor = useCallback((hex: string, name: string) => {
    setColor(hex);
    speakColorName(name);
  }, []);

  const bg = glow ? COLOZOO_GLOW_BG : COLOZOO_BG;
  const book = useMemo(
    () => COLOZOO_BOOKS.find((b) => b.id === coloring.bookId),
    [coloring.bookId],
  );

  // Book completion: every page in the book at 3★. Celebrate ONCE (confetti +
  // "Amazing!"), re-armed only if it leaves the complete state — never nags.
  const bookComplete = useMemo(
    () => !!book && book.pages.length > 0 && book.pages.every((p) => (coloring.stars[p.id] ?? 0) >= 3),
    [book, coloring.stars],
  );
  useEffect(() => {
    if (bookComplete && !wasComplete.current) {
      setShowComplete(true);
      fireConfetti();
    }
    wasComplete.current = bookComplete;
  }, [bookComplete]);

  const savePage = useCallback(() => {
    if (page) {
      void saveColozooPage({ page, fills: coloring.fills, inkCanvas: canvasRef.current, glow });
    }
  }, [page, coloring.fills, glow]);

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden transition-colors duration-500"
      style={{ background: bg, fontFamily: "'Nunito', ui-rounded, system-ui, sans-serif" }}
    >
      {/* ── Top bar: menu, book title, stars, page dots ── */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenSidebar}
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl shadow-sm"
          style={{ background: glow ? '#1b1226' : '#fff', color: glow ? '#fff' : '#333' }}
        >
          ☰
        </button>
        <button
          type="button"
          onClick={() => setShelfOpen((v) => !v)}
          className="flex h-11 items-center gap-2 rounded-2xl px-4 text-lg font-extrabold shadow-sm"
          style={{ background: glow ? '#1b1226' : '#fff', color: glow ? '#fff' : '#333' }}
        >
          <span className="text-xl">{book?.coverEmoji}</span>
          {book?.title}
          <span className="text-sm opacity-50">▾</span>
        </button>
        <div className="ml-auto flex items-center gap-1 text-2xl" aria-label={`${coloring.activeStars} stars`}>
          {[1, 2, 3].map((n) => (
            <span key={n} style={{ opacity: coloring.activeStars >= n ? 1 : 0.25 }}>⭐</span>
          ))}
        </div>
      </div>

      {/* Book shelf */}
      {shelfOpen && (
        <div className="absolute left-4 top-16 z-40 flex flex-col gap-2 rounded-3xl bg-white p-3 shadow-xl">
          {COLOZOO_BOOKS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                coloring.switchBook(b.id);
                setShelfOpen(false);
              }}
              className="flex items-center gap-3 rounded-2xl px-4 py-2 text-lg font-extrabold text-gray-700 hover:bg-orange-50"
              style={b.id === coloring.bookId ? { background: '#FFF0E6', color: COLOZOO_ACCENT } : undefined}
            >
              <span className="text-2xl">{b.coverEmoji}</span>
              {b.title}
            </button>
          ))}
        </div>
      )}

      {/* ── Coloring surface ── */}
      <div className="relative mx-auto my-3 w-full max-w-4xl flex-1 px-4">
        <div
          className="relative h-full w-full overflow-hidden rounded-3xl shadow-lg"
          style={{ background: glow ? '#120818' : '#fff' }}
        >
          {page && (
            <>
              {/* zones + optional scene background */}
              <svg
                viewBox={page.viewBox}
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                {page.backgroundSvg && (
                  <g dangerouslySetInnerHTML={{ __html: page.backgroundSvg }} />
                )}
                {page.zones.map((z) => (
                  <path
                    key={z.id}
                    d={z.path}
                    fill={coloring.fills[z.id] ?? 'transparent'}
                    aria-label={z.label}
                    style={{ cursor: fillMode ? 'pointer' : undefined, pointerEvents: fillMode ? 'auto' : 'none' }}
                    onPointerDown={fillMode ? () => onZoneTap(z.id) : undefined}
                  />
                ))}
              </svg>
              {/* child's freehand ink */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ touchAction: 'none', pointerEvents: fillMode ? 'none' : 'auto' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              {/* locked outlines, always on top */}
              <svg
                viewBox={page.viewBox}
                className="pointer-events-none absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
                style={glow ? { filter: 'invert(1)' } : undefined}
                dangerouslySetInnerHTML={{ __html: page.outlinesSvg }}
              />
            </>
          )}

          {/* educational hint — curious, never corrective */}
          {hint && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <div className="rounded-full bg-white/95 px-5 py-2 text-base font-extrabold text-gray-700 shadow-md">
                {hint}
              </div>
            </div>
          )}

          {/* "Nice!" stamp */}
          {showNice && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="-rotate-12 rounded-3xl px-10 py-4 text-6xl font-black text-white shadow-2xl"
                style={{ background: COLOZOO_ACCENT }}
              >
                Nice!
              </div>
            </div>
          )}

          {/* Empty-state tagline — a gentle brand nudge on an untouched page */}
          {page && coverage === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
              <span
                className="text-lg font-black tracking-wide"
                style={{ color: COLOZOO_ACCENT, opacity: 0.55 }}
              >
                Create Happiness
              </span>
            </div>
          )}
        </div>

        {/* big undo — bottom corner, kid-sized */}
        <button
          type="button"
          aria-label="Undo"
          onClick={undo}
          className="absolute bottom-4 left-8 flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-lg active:scale-90"
          style={{ background: glow ? '#1b1226' : '#fff' }}
        >
          ↩️
        </button>
      </div>

      {/* page dots: done / active / upcoming */}
      <div className="flex items-center justify-center gap-3 pb-2">
        <button type="button" aria-label="Previous page" onClick={coloring.prev} className="text-2xl opacity-60">‹</button>
        {book?.pages.map((p) => {
          const done = (coloring.stars[p.id] ?? 0) >= 3;
          const active = p.pageNumber === coloring.currentPage;
          return (
            <button
              key={p.id}
              type="button"
              aria-label={`Page ${p.pageNumber}`}
              onClick={() => coloring.goTo(p.pageNumber)}
              className="h-4 w-4 rounded-full transition-transform"
              style={{
                background: done ? '#43A047' : active ? COLOZOO_ACCENT : glow ? '#3a2f4a' : '#E0DCD0',
                transform: active ? 'scale(1.35)' : undefined,
              }}
            />
          );
        })}
        <button type="button" aria-label="Next page" onClick={coloring.next} className="text-2xl opacity-60">›</button>
      </div>

      {/* ── Bottom toolbar: fill bucket (primary), brushes, pots, glow ── */}
      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto rounded-3xl p-2 shadow-md"
          style={{ background: glow ? '#1b1226' : '#fff' }}
        >
          {/* fill bucket — primary action, brand-orange CTA */}
          <button
            type="button"
            aria-label="Fill bucket"
            aria-pressed={fillMode}
            onClick={() => setFillMode(true)}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl transition-transform active:scale-90"
            style={fillMode ? { background: COLOZOO_ACCENT, boxShadow: '0 4px 14px rgba(255,107,43,.4)' } : { background: glow ? '#2a2138' : '#F4F1E8' }}
          >
            🪣
          </button>
          <span className="h-10 w-px shrink-0" style={{ background: glow ? '#3a2f4a' : '#E8E4D8' }} />
          {COLOZOO_BRUSHES.map((b) => {
            const active = !fillMode && brush === b;
            return (
              <button
                key={b}
                type="button"
                title={penProfile(b).label}
                aria-label={penProfile(b).label}
                aria-pressed={active}
                onClick={() => {
                  setBrush(b);
                  setFillMode(false);
                }}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl transition-transform active:scale-90"
                style={active ? { background: COLOZOO_ACCENT, boxShadow: '0 4px 14px rgba(255,107,43,.4)' } : { background: glow ? '#2a2138' : '#F4F1E8' }}
              >
                {BRUSH_EMOJI[b]}
              </button>
            );
          })}
          <span className="h-10 w-px shrink-0" style={{ background: glow ? '#3a2f4a' : '#E8E4D8' }} />
          <button
            type="button"
            aria-label="Glow mode"
            aria-pressed={glow}
            onClick={() => setGlow((v) => !v)}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl transition-transform active:scale-90"
            style={glow ? { background: '#3D5AFE' } : { background: '#F4F1E8' }}
          >
            🌙
          </button>
        </div>

        {/* paint pots — physical, named */}
        <div className="flex items-center gap-2 overflow-x-auto rounded-3xl p-2 shadow-md"
          style={{ background: glow ? '#1b1226' : '#fff' }}
        >
          {palette.map((c) => {
            const active = color === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={active}
                onClick={() => pickColor(c.hex, c.name)}
                className="relative h-12 w-12 shrink-0 rounded-full border-4 transition-transform active:scale-90"
                style={{
                  background: c.hex,
                  borderColor: active ? COLOZOO_ACCENT : 'rgba(0,0,0,.08)',
                  transform: active ? 'scale(1.15)' : undefined,
                }}
              />
            );
          })}
          <span
            className="ml-2 shrink-0 whitespace-nowrap text-base font-extrabold"
            style={{ color: glow ? '#fff' : '#555' }}
          >
            {palette.find((c) => c.hex === color)?.name ?? ''}
          </span>
        </div>
      </div>

      {/* Book-complete celebration — every page at 3★ */}
      {showComplete && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Book complete"
        >
          <div
            className="w-full max-w-sm rounded-3xl px-6 py-8 text-center shadow-2xl"
            style={{ background: glow ? '#160A2A' : '#fff' }}
          >
            <div className="text-6xl" aria-hidden>🎉</div>
            <h2 className="mt-2 text-4xl font-black" style={{ color: COLOZOO_ACCENT }}>
              Amazing!
            </h2>
            <p className="mt-1 text-lg font-extrabold" style={{ color: glow ? '#fff' : '#444' }}>
              You finished every page of {book?.title}!
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={savePage}
                className="h-16 rounded-2xl text-xl font-black text-white transition-transform active:scale-95"
                style={{ background: COLOZOO_ACCENT }}
              >
                💾 Save &amp; share
              </button>
              <button
                type="button"
                onClick={() => setShowComplete(false)}
                className="h-14 rounded-2xl text-lg font-extrabold transition-transform active:scale-95"
                style={{ background: glow ? '#2A1B40' : '#F4F1E8', color: glow ? '#fff' : '#444' }}
              >
                Keep coloring
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
