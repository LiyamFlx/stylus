/**
 * ColoZoo mode — content types (Phase 1).
 *
 * Design philosophy baked into the data model: a child's "wrong" color is
 * never wrong. `defaultColor` is a suggestion the UI may show, never enforce.
 * `educationalHint` is curious, never corrective ("Wheels are usually black —
 * but yours can be any color!").
 *
 * Paint order (three layers, strictly):
 *   backgroundSvg → zone fills → child's freehand ink (canvas) → outlinesSvg
 * Outlines are ALWAYS on top with pointer-events: none — the "ink on top of
 * outline" problem is solved by layer order, not compositing tricks.
 */

/** One flood-fillable region of a coloring page. */
export interface ColorZone {
  /** Unique within the page; the key in the persisted zoneColors map. */
  id: string;
  /** SVG path data (`d` attribute) in the page's viewBox coordinates. */
  path: string;
  /** Pre-filled suggestion — can be ignored, never enforced. */
  defaultColor?: string;
  /** Accessibility label: "truck body", "left wheel". */
  label?: string;
  /** Friendly 2-second tooltip on tap. Never corrective. */
  educationalHint?: string;
}

/** One coloring page. Static asset — authored, never user-created. */
export interface ColoringPage {
  id: string;
  bookId: string;
  /** 1-based position in the book. */
  pageNumber: number;
  /** viewBox for all three SVG layers, e.g. "0 0 800 600". */
  viewBox: string;
  zones: ColorZone[];
  /** Locked outline layer markup (inner SVG, no <svg> wrapper). Rendered on
   *  top at 100% opacity, pointer-events: none. */
  outlinesSvg: string;
  /** Raster outline layer (URL) — used INSTEAD of outlinesSvg for dot-marker
   *  pages so the export compositor can draw it natively. */
  outlineImg?: string;
  /** Kid-readable page name ("Fire Truck"). */
  title?: string;
  /** Optional sky/ground/scene markup rendered beneath everything. */
  backgroundSvg?: string;
}

/** A coloring book: cover emoji + title on the shelf, pages inside. */
export interface ColozooBook {
  id: string;
  title: string;
  /** Shelf cover — emoji, per the brand ("🚒 Trucks"), not abstract icons. */
  coverEmoji: string;
  /** Illustrated cover thumbnail (URL) for the template bar; emoji fallback. */
  coverImg?: string;
  pages: ColoringPage[];
}

/** Star rating for a page: 1 = any paint, 2 = >60% zones, 3 = all zones. */
export type StarRating = 0 | 1 | 2 | 3;

export function starsForCoverage(zonesColored: number, zoneTotal: number, hasAnyPaint: boolean): StarRating {
  if (zoneTotal > 0 && zonesColored >= zoneTotal) return 3;
  if (zoneTotal > 0 && zonesColored / zoneTotal > 0.6) return 2;
  if (hasAnyPaint || zonesColored > 0) return 1;
  return 0;
}
