/**
 * Colozoo coloring books — pure DATA (no rendering, no state).
 *
 * Pages are authored as a list of {@link ColorZone}s; the black outline is
 * DERIVED from those zones by {@link outlineFromZones}, so the line-art always
 * traces exactly the fillable regions. Adding a page is therefore data-only:
 * describe the zones with the little `rect`/`circle`/`ellipse`/`poly` path
 * helpers and `page()` stitches the outline for you.
 */

import type { ColoringPage, ColorZone, ColozooBook } from './types';

// ── SVG path helpers ─────────────────────────────────────────────────────
// Each returns an SVG path `d` string in the page's viewBox space. Kept tiny
// and dependency-free so authoring a page reads like describing a shape.

const n = (v: number) => Math.round(v * 100) / 100;

/** Rounded (or, with r=0, sharp) rectangle. */
function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M${n(x + rr)} ${n(y)}` +
    `h${n(w - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} ${n(rr)}` +
    `v${n(h - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 ${n(-rr)} ${n(rr)}` +
    `h${n(-(w - 2 * rr))}a${n(rr)} ${n(rr)} 0 0 1 ${n(-rr)} ${n(-rr)}` +
    `v${n(-(h - 2 * rr))}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} ${n(-rr)}Z`
  );
}

/** Full circle. */
function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

/** Axis-aligned ellipse. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
}

/** Closed polygon through the given points. */
function poly(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return (
    `M${n(first[0])} ${n(first[1])}` +
    rest.map(([x, y]) => `L${n(x)} ${n(y)}`).join('') +
    'Z'
  );
}

/**
 * Derive a page's outline from its zones: the outline is simply every zone's
 * border, concatenated. Because it's computed from the same path data the
 * child fills, the line-art can never drift out of register with the
 * tappable regions.
 */
export function outlineFromZones(zones: ReadonlyArray<ColorZone>): string {
  return zones.map((z) => z.d).join(' ');
}

/** Build a page, deriving its outline from the zones. */
function page(id: string, name: string, zones: ColorZone[]): ColoringPage {
  return { id, name, viewBox: '0 0 100 100', zones, outline: outlineFromZones(zones) };
}

// ── Trucks ───────────────────────────────────────────────────────────────

const TRUCKS: ColozooBook = {
  id: 'trucks',
  name: 'Trucks',
  emoji: '🚚',
  pages: [
    page('truck-dump', 'Dump truck', [
      { id: 'chassis', label: 'chassis', d: rect(8, 66, 80, 6, 2) },
      { id: 'bed', label: 'bed', d: poly([[10, 66], [58, 66], [63, 42], [22, 42]]) },
      { id: 'cab', label: 'cab', d: rect(60, 40, 27, 26, 4) },
      { id: 'window', label: 'window', d: rect(64, 44, 15, 12, 2) },
      { id: 'wheel-back', label: 'wheel', d: circle(30, 80, 10) },
      { id: 'wheel-front', label: 'wheel', d: circle(72, 80, 10) },
    ]),
    page('truck-fire', 'Fire truck', [
      { id: 'body', label: 'body', d: rect(8, 48, 84, 26, 3) },
      { id: 'cab', label: 'cab', d: rect(66, 40, 24, 20, 3) },
      { id: 'window', label: 'window', d: rect(70, 44, 13, 10, 2) },
      { id: 'ladder', label: 'ladder', d: poly([[12, 46], [58, 30], [61, 34], [15, 50]]) },
      { id: 'light', label: 'light', d: circle(20, 44, 4) },
      { id: 'wheel-back', label: 'wheel', d: circle(28, 80, 9) },
      { id: 'wheel-front', label: 'wheel', d: circle(74, 80, 9) },
    ]),
    page('truck-tractor', 'Tractor', [
      { id: 'body', label: 'body', d: rect(20, 44, 50, 26, 3) },
      { id: 'cab', label: 'cab', d: rect(20, 30, 26, 18, 3) },
      { id: 'window', label: 'window', d: rect(24, 33, 18, 12, 2) },
      { id: 'exhaust', label: 'pipe', d: rect(60, 28, 5, 16, 1) },
      { id: 'wheel-big', label: 'big wheel', d: circle(30, 72, 16) },
      { id: 'wheel-small', label: 'small wheel', d: circle(76, 80, 9) },
    ]),
  ],
};

// ── Animals ──────────────────────────────────────────────────────────────

const ANIMALS: ColozooBook = {
  id: 'animals',
  name: 'Animals',
  emoji: '🐾',
  pages: [
    page('animal-cat', 'Cat', [
      { id: 'ear-left', label: 'ear', d: poly([[30, 28], [38, 8], [47, 30]]) },
      { id: 'ear-right', label: 'ear', d: poly([[53, 30], [62, 8], [70, 28]]) },
      { id: 'head', label: 'head', d: circle(50, 42, 24) },
      { id: 'body', label: 'body', d: ellipse(50, 80, 22, 16) },
      { id: 'tail', label: 'tail', d: poly([[70, 84], [88, 68], [92, 73], [76, 90]]) },
    ]),
    page('animal-fish', 'Fish', [
      { id: 'body', label: 'body', d: ellipse(46, 50, 30, 20) },
      { id: 'tail', label: 'tail', d: poly([[74, 50], [94, 34], [94, 66]]) },
      { id: 'fin-top', label: 'fin', d: poly([[34, 32], [52, 22], [50, 36]]) },
      { id: 'fin-bottom', label: 'fin', d: poly([[34, 68], [52, 78], [50, 64]]) },
      { id: 'eye', label: 'eye', d: circle(30, 44, 4) },
    ]),
    page('animal-bird', 'Bird', [
      { id: 'tail', label: 'tail', d: poly([[20, 54], [4, 44], [8, 66]]) },
      { id: 'body', label: 'body', d: ellipse(46, 54, 26, 22) },
      { id: 'wing', label: 'wing', d: ellipse(44, 54, 14, 10) },
      { id: 'head', label: 'head', d: circle(70, 36, 16) },
      { id: 'beak', label: 'beak', d: poly([[84, 34], [97, 38], [84, 43]]) },
      { id: 'eye', label: 'eye', d: circle(74, 32, 3) },
    ]),
  ],
};

/** All bundled books, in shelf order. */
export const COLOZOO_BOOKS: readonly ColozooBook[] = [TRUCKS, ANIMALS];

/** Look up a book by id, falling back to the first book so a stale/missing id
 *  never leaves the workspace with nothing to show. */
export function bookById(id: string | undefined): ColozooBook {
  return COLOZOO_BOOKS.find((b) => b.id === id) ?? COLOZOO_BOOKS[0];
}
