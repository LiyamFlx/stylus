/**
 * ColoZoo mode workspace — the whole kid-facing coloring UI, rebuilt to the
 * approved v3 mockup:
 *
 *   teal frame → header (wordmark · gear · share)
 *   left: action rail (brush badge, Undo/Redo/Eraser) + OPEN "Brush selection"
 *         card (4 product families, badges, size slider)
 *   center: the coloring page (real dot-marker artwork; every printed dot is a
 *         tappable fill zone) + stylus/sparkle/leaf decorations
 *   right: full-width named color bars bracketed Core / Colozoo Accent
 *   bottom: illustrated template bar, books evenly around a centered
 *         "SAVE MY ART!" pill
 *
 * Interaction (no mode toggle): TAP a dot → dab it with the active color.
 * DRAG anywhere → freehand ink with the active brush. Eraser: tap/drag dots
 * to un-dab them.
 *
 * Isolation contract unchanged: shares the stroke DATA format only; the core
 * drawing engine (Canvas/Toolbar/useDrawing/render.ts) is never touched.
 * Philosophy: a child's "wrong" color is never wrong — celebrate, never block.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { InkPoint, Stroke } from '../types';
import { penProfile, type ColozooBrush } from '../lib/penProfiles';
import { COLOZOO_BOOKS } from '../lib/colozoo/books';
import { BRUSH_FAMILIES } from '../lib/colozoo/brushFamilies';
import { speakColorName, ALL_COLOZOO_COLORS } from '../lib/colozoo/palettes';
import { COLOZOO_THEME } from '../lib/colozoo/theme';
import { colozooInkKey } from '../lib/colozoo/storage';
import { useColoringPage } from '../hooks/useColoringPage';
import { createId } from '../lib/id';
import { hexToHsb, hsbToHex } from '../lib/color';
import { fireConfetti } from '../lib/confetti';
import { saveColozooPage } from '../lib/colozoo/exportPage';
import { useShakeUndo, requestShakePermission } from '../hooks/useShakeUndo';
import { ColozooBrushCard } from './colozoo/ColozooBrushCard';
import { ColozooPalette } from './colozoo/ColozooPalette';
import { ColozooTemplateBar } from './colozoo/ColozooTemplateBar';
import {
  IconEraser,
  IconGear,
  IconRedo,
  IconShare,
  IconUndo,
  LeafMotif,
  Sparkle,
} from './colozoo/ColozooChrome';

interface ColozooWorkspaceProps {
  documentId: string;
  onOpenSidebar: () => void;
}

const FAMILY_ICON: Record<string, string> = {
  'magic-pens': '/colozoo/ui/brush-magic.png',
  'paint-brushes': '/colozoo/ui/brush-paint.png',
  'ceramic-markers': '/colozoo/ui/brush-ceramic.png',
  'fabric-paint': '/colozoo/ui/brush-fabric.png',
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
  const [family, setFamily] = useState<string>('magic-pens');
  const brush: ColozooBrush = useMemo(
    () => BRUSH_FAMILIES.find((f) => f.id === family)?.primary ?? 'czMarker',
    [family],
  );
  const [color, setColor] = useState(ALL_COLOZOO_COLORS[3].hex); // Primary Red
  const [brushSize, setBrushSize] = useState(10);
  const [glow, setGlow] = useState(false);
  const [eraser, setEraser] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [showNice, setShowNice] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  // Collapsed-chrome model: the canvas owns the screen; one panel at a time
  // opens over it (brush card / colors / books) and tap-away closes it.
  const [panel, setPanel] = useState<'brush' | 'colors' | 'books' | null>(null);
  const togglePanel = useCallback(
    (p: 'brush' | 'colors' | 'books') => setPanel((cur) => (cur === p ? null : p)),
    [],
  );

  // Load Nunito + Fredoka (wordmark/headings) once, on mode entry only.
  useEffect(() => {
    const id = 'colozoo-nunito';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;800;900&display=swap';
    document.head.appendChild(link);
  }, []);

  // ── Freehand ink layer ──────────────────────────────────────────────────────
  const page = coloring.page;
  // Blank canvas ink persists under a stable synthetic page id, so free-draw
  // survives reloads and exports just like a template page.
  const inkKey = colozooInkKey(documentId, page ? page.id : '__blank__');
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const strokesRedo = useRef<Stroke[]>([]);
  const liveStroke = useRef<Stroke | null>(null);
  const startedAt = useRef(0);
  // Ordered mark logs — Undo/Redo dispatch to strokes or fills by recency.
  const markLog = useRef<('stroke' | 'fill')[]>([]);
  const undoneLog = useRef<('stroke' | 'fill')[]>([]);
  const askedShake = useRef(false);
  const wasComplete = useRef(false);
  const requestShakeOnce = useCallback(() => {
    if (askedShake.current) return;
    askedShake.current = true;
    void requestShakePermission();
  }, []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, s: Stroke) => {
    const b = (s.penType ?? 'czCrayon') as ColozooBrush;
    const prof = penProfile(b);
    ctx.save();
    ctx.globalCompositeOperation = prof.blend ?? 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = prof.opacity;

    // Paintbrush frays with speed; every other brush traces the exact path.
    const pts = b === 'czPaintbrush' ? jitterPoints(s.points) : s.points;

    if (pts.length === 1) {
      const w = pts[0].width ?? prof.widthFor(pts[0].pressure, s.size);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Magic marker: hue rotates +2° per 100px along the stroke's length.
    const baseHsb = b === 'czMagicMarker' ? hexToHsb(s.color) : null;
    let lengthSoFar = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const q = pts[i];
      if (baseHsb) {
        lengthSoFar += Math.hypot(q.x - a.x, q.y - a.y);
        ctx.strokeStyle = hsbToHex({ ...baseHsb, h: baseHsb.h + (lengthSoFar / 100) * 2 });
      }
      ctx.beginPath();
      ctx.lineWidth = q.width ?? prof.widthFor(q.pressure, s.size);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    // Texture overlays on top of the base line.
    if (b === 'czPencil') stipple(ctx, pts, s.color, false);
    else if (b === 'czChalk') stipple(ctx, pts, s.color, true);
    else if (b === 'czCeramic') shimmer(ctx, pts, s.color);

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

  // Contain-fit the page box inside the center area. CSS aspect-ratio alone
  // distorts when both height and max-width clamp (portrait phones), so the
  // box gets explicit pixel dimensions from a measured fit.
  const areaRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  // Blank canvas uses a default 4:3 landscape frame; a loaded template uses its
  // own viewBox. Either way the box always has dimensions to fit.
  const BLANK_VIEWBOX = '0 0 800 600';
  const activeViewBox = page ? page.viewBox : BLANK_VIEWBOX;
  const pageDims = activeViewBox.split(/\s+/).map(Number);
  const pageW = pageDims[2];
  const pageH = pageDims[3];
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const fit = () => {
      const aw = area.clientWidth;
      const ah = area.clientHeight;
      if (!aw || !ah) return;
      const s = Math.min(aw / pageW, ah / pageH);
      setBoxSize({ w: Math.floor(pageW * s), h: Math.floor(pageH * s) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(area);
    return () => ro.disconnect();
  }, [pageW, pageH]);

  // (Re)load strokes when the page changes; size canvas to its box. The canvas
  // only mounts once the box has a measured size, so this effect must re-run
  // when that happens (hasBox) — otherwise the bitmap stays at 300×150 and
  // every stroke lands outside it.
  const hasBox = boxSize !== null;
  useEffect(() => {
    strokesRef.current = inkKey ? readStrokes(inkKey) : [];
    strokesRedo.current = [];
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
  }, [inkKey, redraw, hasBox]);

  const buildPoint = useCallback(
    (e: React.PointerEvent, t0: number): InkPoint => {
      const rect = boxRef.current!.getBoundingClientRect();
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const prof = penProfile(brush);
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure,
        width: prof.widthFor(pressure, brushSize),
        opacity: prof.opacity,
        t: performance.now() - t0,
      };
    },
    [brush, brushSize],
  );

  const commitStroke = useCallback(() => {
    const s = liveStroke.current;
    liveStroke.current = null;
    if (!s || !inkKey) return;
    strokesRef.current = [...strokesRef.current, s];
    strokesRedo.current = [];
    undoneLog.current = [];
    markLog.current.push('stroke');
    writeStrokes(inkKey, strokesRef.current);
    coloring.markInk();
    redraw();
  }, [inkKey, coloring, redraw]);

  // ── Unified tap-vs-drag pointer model ───────────────────────────────────────
  // TAP a dot → fill (or clear, with the eraser). DRAG → freehand stroke
  // (eraser drags clear every dot they cross instead).
  const hintTimer = useRef<number | undefined>(undefined);
  const pending = useRef<{ x: number; y: number; zoneId: string | null } | null>(null);

  /** Dot under a client point, in page-box coordinates (fat-finger friendly). */
  const zoneAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const box = boxRef.current;
      if (!box || !page) return null;
      const rect = box.getBoundingClientRect();
      const [, , W, H] = page.viewBox.split(/\s+/).map(Number);
      const px = ((clientX - rect.left) / rect.width) * W;
      const py = ((clientY - rect.top) / rect.height) * H;
      let best: { id: string; d: number } | null = null;
      for (const z of page.zones) {
        // zone paths are circles authored as "M<cx> <cy> m<-r> 0 a<r> ...".
        const m = /^M(-?[\d.]+) (-?[\d.]+) m(-?[\d.]+)/.exec(z.path);
        if (!m) continue;
        const cx = Number(m[1]);
        const cy = Number(m[2]);
        const r = -Number(m[3]);
        const d = Math.hypot(px - cx, py - cy);
        if (d <= r * 1.35 && (!best || d < best.d)) best = { id: z.id, d };
      }
      return best?.id ?? null;
    },
    [page],
  );

  const applyToZone = useCallback(
    (zoneId: string) => {
      if (eraser) {
        coloring.clearZone(zoneId);
        markLog.current.push('fill');
        return;
      }
      coloring.fillZone(zoneId, color);
      markLog.current.push('fill');
      undoneLog.current = [];
      const zone = page?.zones.find((z) => z.id === zoneId);
      if (zone?.educationalHint) {
        setHint(zone.educationalHint);
        window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(null), 2000);
      }
    },
    [eraser, coloring, color, page],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      requestShakeOnce();
      e.currentTarget.setPointerCapture(e.pointerId);
      // Blank canvas has no zones → zoneId is null → every gesture is a stroke.
      pending.current = { x: e.clientX, y: e.clientY, zoneId: page ? zoneAt(e.clientX, e.clientY) : null };
      startedAt.current = performance.now();
    },
    [page, zoneAt, requestShakeOnce],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Eraser drag: clear every dot crossed (template only).
      if (eraser && page) {
        if (pending.current || liveStroke.current) {
          const z = zoneAt(e.clientX, e.clientY);
          if (z && coloring.fills[z]) applyToZone(z);
        }
        return;
      }
      const p = pending.current;
      if (p) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;
        // Drag confirmed → this is a stroke, not a tap.
        pending.current = null;
        liveStroke.current = {
          id: createId('s_'),
          startedAt: Date.now(),
          color,
          size: brushSize,
          penType: brush,
          points: [buildPoint(e, startedAt.current)],
        };
        redraw();
        return;
      }
      if (liveStroke.current) {
        liveStroke.current.points.push(buildPoint(e, startedAt.current));
        redraw();
      }
    },
    [page, eraser, zoneAt, coloring.fills, applyToZone, color, brushSize, brush, buildPoint, redraw],
  );

  const onPointerUp = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    if (p) {
      if (p.zoneId) applyToZone(p.zoneId);
      else if (!eraser && brush === 'czDaub') {
        // Dauber taps stamp a dot anywhere, even off the printed circles.
        // (Handled as a 1-point stroke.)
      }
      return;
    }
    if (liveStroke.current) commitStroke();
  }, [applyToZone, eraser, brush, commitStroke]);

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

  // ── Undo / redo: dispatch to the last kind of mark ──────────────────────────
  const undo = useCallback(() => {
    const last = markLog.current.pop();
    if (last === 'stroke' && inkKey && strokesRef.current.length > 0) {
      strokesRedo.current.push(strokesRef.current[strokesRef.current.length - 1]);
      undoneLog.current.push('stroke');
      strokesRef.current = strokesRef.current.slice(0, -1);
      writeStrokes(inkKey, strokesRef.current);
      redraw();
      return;
    }
    if (last === 'fill') {
      if (coloring.undoFill()) undoneLog.current.push('fill');
      return;
    }
    // Log empty/desynced (e.g. after page flip) — try fills, then strokes.
    if (coloring.undoFill()) {
      undoneLog.current.push('fill');
    } else if (inkKey && strokesRef.current.length > 0) {
      strokesRedo.current.push(strokesRef.current[strokesRef.current.length - 1]);
      undoneLog.current.push('stroke');
      strokesRef.current = strokesRef.current.slice(0, -1);
      writeStrokes(inkKey, strokesRef.current);
      redraw();
    }
  }, [inkKey, coloring, redraw]);

  const redo = useCallback(() => {
    const last = undoneLog.current.pop();
    if (last === 'stroke' && inkKey && strokesRedo.current.length > 0) {
      const s = strokesRedo.current.pop()!;
      strokesRef.current = [...strokesRef.current, s];
      markLog.current.push('stroke');
      writeStrokes(inkKey, strokesRef.current);
      redraw();
      return;
    }
    if (coloring.redoFill()) markLog.current.push('fill');
  }, [inkKey, coloring, redraw]);

  // Shake the tablet to undo the last mark (device-only; no-op on desktop).
  useShakeUndo(undo);

  // Page flips invalidate the mark log ordering for strokes on other pages.
  useEffect(() => {
    markLog.current = [];
    undoneLog.current = [];
  }, [page?.id]);

  const pickColor = useCallback((hex: string, name: string) => {
    setColor(hex);
    setEraser(false);
    speakColorName(name);
  }, []);

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
    // On a blank canvas there is no template page — synthesize a minimal one
    // (default frame, no zones/outline) so the exporter still composites the
    // child's freehand drawing onto a cream background.
    const exportPage = page ?? {
      id: '__blank__',
      bookId: '__blank__',
      pageNumber: 1,
      title: 'My Drawing',
      viewBox: BLANK_VIEWBOX,
      zones: [],
      outlinesSvg: '',
    };
    void saveColozooPage({ page: exportPage, fills: coloring.fills, inkCanvas: canvasRef.current, glow });
  }, [page, coloring.fills, glow]);

  const stageBg = glow ? COLOZOO_THEME.glowBg : COLOZOO_THEME.stage;


  /** Minimal icon button — the collapsed chrome unit. */
  const MiniBtn = ({
    label,
    onClick,
    active,
    children,
  }: {
    label: string;
    onClick: () => void;
    active?: boolean;
    children: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-md transition-transform active:scale-90"
      style={{
        background: active ? COLOZOO_THEME.teal : glow ? '#1b1226' : '#fff',
        color: active ? '#fff' : glow ? '#eee' : '#5A6B70',
      }}
    >
      {children}
    </button>
  );

  const railButtons = (
    <>
      <MiniBtn label="Undo" onClick={undo}>
        <IconUndo />
      </MiniBtn>
      <MiniBtn label="Redo" onClick={redo}>
        <IconRedo />
      </MiniBtn>
      <MiniBtn label="Eraser" onClick={() => setEraser((v) => !v)} active={eraser}>
        <IconEraser />
      </MiniBtn>
    </>
  );

  /** Collapsed toggles: current brush family + current color + active book. */
  const brushToggle = (
    <MiniBtn label="Brushes" onClick={() => togglePanel('brush')} active={panel === 'brush'}>
      <img src={FAMILY_ICON[family]} alt="" className="h-7 w-7 object-contain" draggable={false} />
    </MiniBtn>
  );
  const colorToggle = (
    <MiniBtn label="Colors" onClick={() => togglePanel('colors')} active={panel === 'colors'}>
      <span
        className="h-6 w-6 rounded-full"
        style={{ background: color, boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,.15)' }}
      />
    </MiniBtn>
  );
  const bookToggle = (
    <button
      type="button"
      aria-label="Coloring books"
      title="Coloring books"
      onClick={() => togglePanel('books')}
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl px-2 shadow-md transition-transform active:scale-95"
      style={{ background: panel === 'books' ? COLOZOO_THEME.teal : glow ? '#1b1226' : '#fff' }}
    >
      <span className="flex h-8 w-10 items-center justify-center overflow-hidden rounded-lg bg-white" style={{ boxShadow: 'inset 0 0 0 1px #E2E8EA' }}>
        {book?.coverImg ? (
          <img src={book.coverImg} alt="" className="h-full w-full object-contain p-0.5" draggable={false} />
        ) : (
          <span className="text-lg">{book?.coverEmoji}</span>
        )}
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={panel === 'books' ? '#fff' : '#5A6B70'} strokeWidth="3" strokeLinecap="round" aria-hidden>
        <path d={panel === 'books' ? 'M4 15l8-8 8 8' : 'M4 9l8 8 8-8'} />
      </svg>
    </button>
  );

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: COLOZOO_THEME.teal, fontFamily: "'Nunito', ui-rounded, system-ui, sans-serif" }}
    >
      {/* ── Header: wordmark · stars · gear · share ── */}
      <div className="relative z-30 flex h-14 shrink-0 items-center gap-3 px-4">
        {/* Text wordmark, not the image asset — that PNG export is clipped
            (truncated letters + a stray artifact) at any render size. */}
        <span
          className="select-none text-2xl font-semibold text-white"
          style={{ fontFamily: "'Fredoka', ui-rounded, system-ui, sans-serif" }}
        >
          colozoo
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="mr-1 flex items-center gap-0.5 text-lg" aria-label={`${coloring.activeStars} stars`}>
            {[1, 2, 3].map((n) => (
              <span key={n} style={{ opacity: coloring.activeStars >= n ? 1 : 0.3 }}>⭐</span>
            ))}
          </div>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setGearOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition-transform active:scale-90"
            style={{ color: '#7C8A8E' }}
          >
            <IconGear />
          </button>
          <button
            type="button"
            aria-label="Save and share"
            onClick={savePage}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition-transform active:scale-90"
            style={{ color: '#7C8A8E' }}
          >
            <IconShare />
          </button>
        </div>
        {gearOpen && (
          <div className="absolute right-4 top-14 z-50 flex w-52 flex-col gap-1 rounded-2xl bg-white p-2 shadow-xl">
            <button
              type="button"
              onClick={() => setGlow((v) => !v)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-extrabold text-gray-700 hover:bg-gray-50"
            >
              Glow mode
              <span
                className="ml-2 flex h-6 w-11 items-center rounded-full p-0.5 transition-colors"
                style={{ background: glow ? COLOZOO_THEME.teal : '#D8E0E2' }}
              >
                <span
                  className="h-5 w-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: glow ? 'translateX(20px)' : undefined }}
                />
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGearOpen(false);
                onOpenSidebar();
              }}
              className="rounded-xl px-3 py-2.5 text-left text-sm font-extrabold text-gray-700 hover:bg-gray-50"
            >
              All my notebooks…
            </button>
          </div>
        )}
      </div>

      {/* ── Stage: the canvas owns the screen; chrome floats collapsed ── */}
      <div
        className="relative mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl transition-colors duration-500"
        style={{ background: stageBg }}
      >
        <LeafMotif className="absolute bottom-0 left-0 z-0 h-48 w-48" />
        <Sparkle className="absolute right-[16%] top-6 z-0" />
        <Sparkle className="absolute left-[30%] top-3 z-0" size={12} />

        <div className="relative z-10 flex min-h-0 flex-1 items-stretch">
          {/* Center: the page — full stage minus slim floating rails. The
              measured element sits INSIDE the padding so the fit math never
              includes the space reserved for floating chrome. */}
          <div className="min-h-0 min-w-0 flex-1 px-2 pb-14 pt-2 lg:px-16 lg:pb-14">
          <div ref={areaRef} className="relative flex h-full w-full items-center justify-center">
            {boxSize && (
              <div
                ref={boxRef}
                className="relative overflow-hidden rounded-2xl shadow-lg"
                style={{
                  width: boxSize.w,
                  height: boxSize.h,
                  // Inviting cream paper on the blank canvas, white under a
                  // loaded template (so its printed line-art reads cleanly).
                  background: glow ? '#120818' : page ? '#fff' : '#FFF8E7',
                  touchAction: 'none',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* zone fills — only when a template is loaded */}
                {page && (
                  <svg viewBox={page.viewBox} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    {page.zones.map((z) =>
                      coloring.fills[z.id] ? (
                        <path key={z.id} d={z.path} fill={coloring.fills[z.id]} aria-label={z.label} />
                      ) : null,
                    )}
                  </svg>
                )}
                {/* child's freehand ink — always */}
                <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                {/* locked outline, always on top — only when a template is loaded */}
                {page && (page.outlineImg ? (
                  <img
                    src={page.outlineImg}
                    alt={page.title ?? ''}
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full select-none"
                    style={glow ? { filter: 'invert(1)' } : undefined}
                  />
                ) : (
                  <svg
                    viewBox={page.viewBox}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    preserveAspectRatio="none"
                    style={glow ? { filter: 'invert(1)' } : undefined}
                    dangerouslySetInnerHTML={{ __html: page.outlinesSvg }}
                  />
                ))}

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
                      style={{ background: COLOZOO_THEME.teal }}
                    >
                      Nice!
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* tap-away closes any open panel (covers the canvas only) */}
        {panel && (
          <div className="absolute inset-0 z-20" onClick={() => setPanel(null)} aria-hidden />
        )}

        {/* ── Floating collapsed chrome ── */}
        {/* left rail (≥lg): brush toggle + undo/redo/eraser */}
        <div className="absolute left-2 top-3 z-30 hidden flex-col items-center gap-2 lg:flex">
          {brushToggle}
          {railButtons}
        </div>
        {/* right rail (≥lg): color chip */}
        <div className="absolute right-2 top-3 z-30 hidden flex-col items-center gap-2 lg:flex">
          {colorToggle}
        </div>

        {/* bottom bar: book chip · page dots · SAVE — one slim row */}
        <div className="absolute inset-x-0 bottom-2 z-30 flex items-center justify-center gap-1.5 px-1 sm:gap-2 sm:px-2">
          <div className="flex items-center gap-1.5 sm:gap-2 lg:hidden">
            {brushToggle}
            {colorToggle}
            {railButtons}
          </div>
          {bookToggle}
          {/* page navigation is template-only — a blank canvas has no pages */}
          {!coloring.blank && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <button type="button" aria-label="Previous page" onClick={coloring.prev} className="px-0.5 text-lg opacity-60">‹</button>
            {book?.pages.map((p) => {
              const done = (coloring.stars[p.id] ?? 0) >= 3;
              const active = p.pageNumber === coloring.currentPage;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Page ${p.pageNumber}: ${p.title ?? ''}`}
                  onClick={() => coloring.goTo(p.pageNumber)}
                  className="h-2.5 w-2.5 rounded-full transition-transform"
                  style={{
                    background: done ? '#43A047' : active ? COLOZOO_THEME.teal : glow ? '#3a2f4a' : '#fff',
                    boxShadow: active ? `0 0 0 3px ${COLOZOO_THEME.mint}` : 'inset 0 0 0 1px rgba(0,0,0,.1)',
                    transform: active ? 'scale(1.35)' : undefined,
                  }}
                />
              );
            })}
            <button type="button" aria-label="Next page" onClick={coloring.next} className="px-0.5 text-lg opacity-60">›</button>
          </div>
          )}
          {/* phone: the header share button covers save — keep the row tight */}
          <button
            type="button"
            onClick={savePage}
            className="hidden h-11 shrink-0 rounded-full px-5 text-sm font-black tracking-wide text-white shadow-md transition-transform active:scale-95 sm:block"
            style={{ background: COLOZOO_THEME.pill }}
          >
            ✨ SAVE MY ART! ✨
          </button>
        </div>

        {/* ── Panels (one at a time, over the canvas) ── */}
        {/* desktop popovers */}
        {panel === 'brush' && (
          <div className="absolute left-16 top-3 z-40 hidden lg:block">
            <ColozooBrushCard
              activeFamily={family}
              onPickFamily={(f) => {
                setFamily(f);
                setEraser(false);
              }}
              brushSize={brushSize}
              onBrushSize={setBrushSize}
              glow={glow}
            />
          </div>
        )}
        {panel === 'colors' && (
          <div className="absolute bottom-16 right-2 top-3 z-40 hidden w-60 overflow-y-auto lg:block">
            <ColozooPalette
              color={color}
              onPick={(hex, name) => {
                pickColor(hex, name);
                setPanel(null);
              }}
              glow={glow}
              compact
            />
          </div>
        )}
        {panel === 'books' && (
          <div className="absolute inset-x-2 bottom-16 z-40 hidden lg:block">
            <ColozooTemplateBar
              books={COLOZOO_BOOKS}
              activeBookId={coloring.bookId}
              onPickBook={(id) => {
                coloring.switchBook(id);
                setPanel(null);
              }}
              onSave={savePage}
              glow={glow}
              showSave={false}
              onBlank={() => {
                coloring.startBlank();
                setPanel(null);
              }}
              blankActive={coloring.blank}
            />
          </div>
        )}
      </div>

      {/* phone/tablet bottom sheets — same panels, sheet presentation */}
      {panel && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" onClick={() => setPanel(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative max-h-[70%] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200" />
            {panel === 'brush' && (
              <div className="flex justify-center">
                <ColozooBrushCard
                  activeFamily={family}
                  onPickFamily={(f) => {
                    setFamily(f);
                    setEraser(false);
                    setPanel(null);
                  }}
                  brushSize={brushSize}
                  onBrushSize={setBrushSize}
                />
              </div>
            )}
            {panel === 'colors' && (
              <ColozooPalette
                color={color}
                onPick={(hex, name) => {
                  pickColor(hex, name);
                  setPanel(null);
                }}
                compact
              />
            )}
            {panel === 'books' && (
              <ColozooTemplateBar
                books={COLOZOO_BOOKS}
                activeBookId={coloring.bookId}
                onPickBook={(id) => {
                  coloring.switchBook(id);
                  setPanel(null);
                }}
                onSave={savePage}
                showSave={false}
                onBlank={() => {
                  coloring.startBlank();
                  setPanel(null);
                }}
                blankActive={coloring.blank}
              />
            )}
          </div>
        </div>
      )}

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
            <h2 className="mt-2 text-4xl font-black" style={{ color: COLOZOO_THEME.teal }}>
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
                style={{ background: COLOZOO_THEME.pill }}
              >
                💾 Save &amp; share
              </button>
              <button
                type="button"
                onClick={() => setShowComplete(false)}
                className="h-14 rounded-2xl text-lg font-extrabold transition-transform active:scale-95"
                style={{ background: glow ? '#2A1B40' : '#EAF4F4', color: glow ? '#fff' : '#444' }}
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
