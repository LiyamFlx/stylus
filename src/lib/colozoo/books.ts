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
    page('truck-mixer', 'Cement mixer', [
      { id: 'chassis', label: 'chassis', d: rect(8, 64, 82, 6, 2) },
      { id: 'drum', label: 'drum', d: ellipse(40, 46, 26, 18) },
      { id: 'cab', label: 'cab', d: rect(66, 40, 22, 24, 4) },
      { id: 'window', label: 'window', d: rect(70, 44, 12, 11, 2) },
      { id: 'wheel-back', label: 'wheel', d: circle(30, 78, 9) },
      { id: 'wheel-front', label: 'wheel', d: circle(74, 78, 9) },
    ]),
    page('truck-tow', 'Tow truck', [
      { id: 'body', label: 'body', d: rect(10, 46, 56, 22, 3) },
      { id: 'cab', label: 'cab', d: rect(10, 34, 22, 14, 3) },
      { id: 'hook', label: 'hook', d: poly([[62, 46], [90, 30], [93, 34], [66, 50]]) },
      { id: 'wheel-back', label: 'wheel', d: circle(26, 76, 9) },
      { id: 'wheel-front', label: 'wheel', d: circle(56, 76, 9) },
    ]),
    page('truck-van', 'Delivery van', [
      { id: 'body', label: 'body', d: rect(10, 34, 64, 36, 5) },
      { id: 'window', label: 'window', d: rect(56, 38, 14, 12, 2) },
      { id: 'door', label: 'door', d: rect(30, 40, 20, 28, 2) },
      { id: 'wheel-back', label: 'wheel', d: circle(26, 76, 9) },
      { id: 'wheel-front', label: 'wheel', d: circle(60, 76, 9) },
    ]),
    page('truck-pickup', 'Pickup', [
      { id: 'bed', label: 'bed', d: rect(10, 44, 42, 22, 3) },
      { id: 'cab', label: 'cab', d: rect(50, 34, 30, 32, 4) },
      { id: 'window', label: 'window', d: rect(56, 38, 18, 12, 2) },
      { id: 'wheel-back', label: 'wheel', d: circle(26, 74, 10) },
      { id: 'wheel-front', label: 'wheel', d: circle(66, 74, 10) },
    ]),
    page('truck-digger', 'Digger', [
      { id: 'body', label: 'body', d: rect(14, 46, 40, 22, 4) },
      { id: 'cab', label: 'cab', d: rect(18, 32, 22, 16, 3) },
      { id: 'arm', label: 'arm', d: poly([[52, 50], [82, 34], [90, 40], [86, 48], [58, 60]]) },
      { id: 'scoop', label: 'scoop', d: poly([[84, 46], [96, 44], [94, 58], [82, 56]]) },
      { id: 'track', label: 'track', d: rect(10, 68, 52, 12, 6) },
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
    page('animal-dog', 'Dog', [
      { id: 'ear-left', label: 'ear', d: ellipse(30, 40, 8, 16) },
      { id: 'ear-right', label: 'ear', d: ellipse(70, 40, 8, 16) },
      { id: 'head', label: 'head', d: circle(50, 44, 22) },
      { id: 'snout', label: 'snout', d: ellipse(50, 54, 12, 9) },
      { id: 'body', label: 'body', d: ellipse(50, 82, 24, 14) },
    ]),
    page('animal-rabbit', 'Rabbit', [
      { id: 'ear-left', label: 'ear', d: ellipse(42, 22, 6, 18) },
      { id: 'ear-right', label: 'ear', d: ellipse(58, 22, 6, 18) },
      { id: 'head', label: 'head', d: circle(50, 48, 18) },
      { id: 'body', label: 'body', d: ellipse(50, 80, 22, 16) },
      { id: 'tail', label: 'tail', d: circle(74, 82, 6) },
    ]),
    page('animal-elephant', 'Elephant', [
      { id: 'body', label: 'body', d: ellipse(44, 56, 30, 24) },
      { id: 'ear', label: 'ear', d: circle(58, 44, 16) },
      { id: 'head', label: 'head', d: circle(70, 50, 18) },
      { id: 'trunk', label: 'trunk', d: poly([[82, 46], [94, 56], [90, 82], [82, 82], [84, 60], [76, 54]]) },
      { id: 'leg', label: 'leg', d: rect(28, 74, 12, 16, 3) },
    ]),
    page('animal-turtle', 'Turtle', [
      { id: 'shell', label: 'shell', d: ellipse(48, 52, 30, 22) },
      { id: 'head', label: 'head', d: circle(82, 52, 9) },
      { id: 'leg-front', label: 'leg', d: ellipse(24, 72, 10, 7) },
      { id: 'leg-back', label: 'leg', d: ellipse(66, 74, 10, 7) },
      { id: 'tail', label: 'tail', d: poly([[18, 52], [8, 48], [10, 58]]) },
    ]),
    page('animal-frog', 'Frog', [
      { id: 'body', label: 'body', d: ellipse(50, 58, 30, 24) },
      { id: 'eye-left', label: 'eye', d: circle(38, 30, 10) },
      { id: 'eye-right', label: 'eye', d: circle(62, 30, 10) },
      { id: 'foot-left', label: 'foot', d: ellipse(24, 82, 12, 7) },
      { id: 'foot-right', label: 'foot', d: ellipse(76, 82, 12, 7) },
    ]),
  ],
};

// ── Ocean ────────────────────────────────────────────────────────────────

const OCEAN: ColozooBook = {
  id: 'ocean',
  name: 'Ocean',
  emoji: '🐠',
  pages: [
    page('ocean-fish', 'Clownfish', [
      { id: 'body', label: 'body', d: ellipse(46, 50, 28, 18) },
      { id: 'stripe', label: 'stripe', d: rect(40, 34, 8, 32, 3) },
      { id: 'tail', label: 'tail', d: poly([[72, 50], [92, 36], [92, 64]]) },
      { id: 'eye', label: 'eye', d: circle(30, 46, 4) },
    ]),
    page('ocean-octopus', 'Octopus', [
      { id: 'head', label: 'head', d: ellipse(50, 40, 24, 22) },
      { id: 'arm-1', label: 'arm', d: poly([[30, 54], [22, 82], [30, 84], [38, 58]]) },
      { id: 'arm-2', label: 'arm', d: poly([[44, 60], [42, 86], [50, 86], [52, 60]]) },
      { id: 'arm-3', label: 'arm', d: poly([[58, 58], [62, 84], [70, 82], [62, 56]]) },
      { id: 'eye-left', label: 'eye', d: circle(42, 38, 4) },
      { id: 'eye-right', label: 'eye', d: circle(58, 38, 4) },
    ]),
    page('ocean-crab', 'Crab', [
      { id: 'body', label: 'body', d: ellipse(50, 54, 26, 16) },
      { id: 'claw-left', label: 'claw', d: circle(22, 46, 8) },
      { id: 'claw-right', label: 'claw', d: circle(78, 46, 8) },
      { id: 'eye-left', label: 'eye', d: circle(44, 40, 4) },
      { id: 'eye-right', label: 'eye', d: circle(56, 40, 4) },
    ]),
    page('ocean-whale', 'Whale', [
      { id: 'body', label: 'body', d: ellipse(44, 54, 32, 22) },
      { id: 'tail', label: 'tail', d: poly([[74, 54], [94, 40], [88, 54], [94, 68]]) },
      { id: 'spout', label: 'spout', d: ellipse(34, 26, 5, 12) },
      { id: 'eye', label: 'eye', d: circle(26, 52, 3) },
    ]),
    page('ocean-star', 'Starfish', [
      { id: 'star', label: 'star', d: poly([[50, 12], [61, 42], [92, 42], [66, 62], [76, 90], [50, 72], [24, 90], [34, 62], [8, 42], [39, 42]]) },
      { id: 'center', label: 'middle', d: circle(50, 52, 10) },
    ]),
    page('ocean-seahorse', 'Seahorse', [
      { id: 'body', label: 'body', d: poly([[46, 20], [58, 26], [56, 50], [44, 62], [50, 78], [40, 84], [34, 66], [42, 50], [40, 30]]) },
      { id: 'head', label: 'head', d: circle(50, 22, 10) },
      { id: 'fin', label: 'fin', d: ellipse(60, 44, 7, 12) },
    ]),
    page('ocean-jelly', 'Jellyfish', [
      { id: 'bell', label: 'bell', d: poly([[22, 44], [30, 24], [50, 16], [70, 24], [78, 44]]) },
      { id: 'tentacle-1', label: 'tentacle', d: poly([[30, 44], [26, 78], [34, 78], [38, 44]]) },
      { id: 'tentacle-2', label: 'tentacle', d: poly([[46, 44], [44, 82], [52, 82], [54, 44]]) },
      { id: 'tentacle-3', label: 'tentacle', d: poly([[62, 44], [66, 78], [74, 76], [70, 44]]) },
    ]),
    page('ocean-shell', 'Seashell', [
      { id: 'shell', label: 'shell', d: poly([[50, 16], [82, 78], [18, 78]]) },
      { id: 'ridge-left', label: 'ridge', d: poly([[50, 20], [40, 76], [50, 76]]) },
      { id: 'ridge-right', label: 'ridge', d: poly([[50, 20], [60, 76], [50, 76]]) },
    ]),
  ],
};

// ── Bugs ─────────────────────────────────────────────────────────────────

const BUGS: ColozooBook = {
  id: 'bugs',
  name: 'Bugs',
  emoji: '🐞',
  pages: [
    page('bug-ladybug', 'Ladybug', [
      { id: 'body', label: 'body', d: circle(50, 54, 28) },
      { id: 'head', label: 'head', d: ellipse(50, 30, 12, 8) },
      { id: 'spot-1', label: 'spot', d: circle(38, 52, 6) },
      { id: 'spot-2', label: 'spot', d: circle(62, 52, 6) },
      { id: 'spot-3', label: 'spot', d: circle(50, 70, 6) },
    ]),
    page('bug-butterfly', 'Butterfly', [
      { id: 'wing-tl', label: 'wing', d: ellipse(34, 38, 16, 18) },
      { id: 'wing-tr', label: 'wing', d: ellipse(66, 38, 16, 18) },
      { id: 'wing-bl', label: 'wing', d: ellipse(36, 66, 13, 14) },
      { id: 'wing-br', label: 'wing', d: ellipse(64, 66, 13, 14) },
      { id: 'body', label: 'body', d: ellipse(50, 52, 5, 26) },
    ]),
    page('bug-bee', 'Bee', [
      { id: 'body', label: 'body', d: ellipse(50, 54, 26, 18) },
      { id: 'stripe-1', label: 'stripe', d: rect(42, 38, 7, 32, 2) },
      { id: 'stripe-2', label: 'stripe', d: rect(56, 38, 7, 32, 2) },
      { id: 'wing-left', label: 'wing', d: ellipse(38, 34, 12, 8) },
      { id: 'wing-right', label: 'wing', d: ellipse(62, 34, 12, 8) },
    ]),
    page('bug-ant', 'Ant', [
      { id: 'head', label: 'head', d: circle(26, 50, 12) },
      { id: 'thorax', label: 'body', d: circle(50, 52, 11) },
      { id: 'abdomen', label: 'body', d: ellipse(76, 52, 16, 12) },
      { id: 'leg', label: 'legs', d: poly([[40, 62], [34, 80], [40, 80], [46, 64]]) },
    ]),
    page('bug-snail', 'Snail', [
      { id: 'shell', label: 'shell', d: circle(58, 50, 24) },
      { id: 'swirl', label: 'swirl', d: circle(58, 50, 12) },
      { id: 'body', label: 'body', d: poly([[12, 72], [40, 66], [46, 74], [16, 80]]) },
      { id: 'horn', label: 'horn', d: poly([[16, 66], [12, 50], [18, 50], [22, 66]]) },
    ]),
    page('bug-spider', 'Spider', [
      { id: 'body', label: 'body', d: ellipse(50, 54, 18, 20) },
      { id: 'head', label: 'head', d: circle(50, 34, 9) },
      { id: 'leg-left', label: 'legs', d: poly([[34, 46], [10, 40], [10, 44], [34, 52]]) },
      { id: 'leg-right', label: 'legs', d: poly([[66, 46], [90, 40], [90, 44], [66, 52]]) },
    ]),
  ],
};

// ── Castle ───────────────────────────────────────────────────────────────

const CASTLE: ColozooBook = {
  id: 'castle',
  name: 'Castle',
  emoji: '🏰',
  pages: [
    page('castle-keep', 'Castle', [
      { id: 'wall', label: 'wall', d: rect(20, 44, 60, 44) },
      { id: 'tower-left', label: 'tower', d: rect(12, 34, 16, 54) },
      { id: 'tower-right', label: 'tower', d: rect(72, 34, 16, 54) },
      { id: 'gate', label: 'gate', d: poly([[42, 88], [42, 66], [50, 60], [58, 66], [58, 88]]) },
      { id: 'roof-left', label: 'roof', d: poly([[10, 34], [20, 20], [30, 34]]) },
      { id: 'roof-right', label: 'roof', d: poly([[70, 34], [80, 20], [90, 34]]) },
    ]),
    page('castle-tower', 'Tower', [
      { id: 'tower', label: 'tower', d: rect(34, 34, 32, 54) },
      { id: 'roof', label: 'roof', d: poly([[28, 34], [50, 10], [72, 34]]) },
      { id: 'window', label: 'window', d: poly([[44, 60], [44, 50], [50, 45], [56, 50], [56, 60]]) },
      { id: 'flag', label: 'flag', d: poly([[50, 10], [70, 14], [50, 20]]) },
    ]),
    page('castle-flag', 'Flag', [
      { id: 'pole', label: 'pole', d: rect(30, 14, 5, 74, 1) },
      { id: 'flag', label: 'flag', d: poly([[35, 18], [82, 26], [35, 44]]) },
      { id: 'ground', label: 'hill', d: ellipse(50, 88, 40, 10) },
    ]),
    page('castle-shield', 'Shield', [
      { id: 'shield', label: 'shield', d: poly([[24, 22], [76, 22], [76, 54], [50, 84], [24, 54]]) },
      { id: 'band', label: 'band', d: rect(24, 46, 52, 10) },
      { id: 'star', label: 'star', d: poly([[50, 26], [55, 38], [68, 38], [57, 46], [61, 58], [50, 50], [39, 58], [43, 46], [32, 38], [45, 38]]) },
    ]),
    page('castle-crown', 'Crown', [
      { id: 'crown', label: 'crown', d: poly([[18, 70], [18, 36], [34, 52], [50, 30], [66, 52], [82, 36], [82, 70]]) },
      { id: 'band', label: 'band', d: rect(18, 70, 64, 12, 2) },
      { id: 'jewel-left', label: 'jewel', d: circle(34, 76, 4) },
      { id: 'jewel-mid', label: 'jewel', d: circle(50, 76, 4) },
      { id: 'jewel-right', label: 'jewel', d: circle(66, 76, 4) },
    ]),
    page('castle-dragon', 'Dragon', [
      { id: 'body', label: 'body', d: ellipse(46, 56, 30, 20) },
      { id: 'head', label: 'head', d: circle(76, 44, 14) },
      { id: 'wing', label: 'wing', d: poly([[40, 42], [30, 18], [58, 38]]) },
      { id: 'tail', label: 'tail', d: poly([[16, 56], [4, 46], [8, 66]]) },
      { id: 'leg', label: 'leg', d: rect(38, 70, 10, 16, 2) },
    ]),
  ],
};

/** All bundled books, in shelf order. */
export const COLOZOO_BOOKS: readonly ColozooBook[] = [TRUCKS, ANIMALS, OCEAN, BUGS, CASTLE];

/** Look up a book by id, falling back to the first book so a stale/missing id
 *  never leaves the workspace with nothing to show. */
export function bookById(id: string | undefined): ColozooBook {
  return COLOZOO_BOOKS.find((b) => b.id === id) ?? COLOZOO_BOOKS[0];
}
