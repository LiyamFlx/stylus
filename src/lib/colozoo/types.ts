/**
 * Colozoo (kids' coloring-book mode) domain types.
 *
 * A coloring page is an OUTLINE (the black line-art a child colours inside)
 * plus a set of fillable {@link ColorZone}s. The outline is DERIVED from the
 * zones (see books.ts `outlineFromZones`) so the line-art and the tappable
 * fill regions can never drift out of alignment — there is exactly one source
 * of geometry.
 *
 * Design rule (feature isolation): Colozoo shares the stroke DATA format
 * (Stroke/InkPoint, penProfiles) with the rest of the app, but nothing here
 * imports from — or is imported by — the core drawing engine.
 */

/** One tappable, fillable region of a coloring page. */
export interface ColorZone {
  /** Stable id, unique within its page. Keys the page's fill map. */
  id: string;
  /** SVG path data (`d`) describing the region, in the page's viewBox space. */
  d: string;
  /**
   * Friendly hint for what this region is ("cab", "wheel", "ear"). Never shown
   * as a correction — purely optional flavour for future read-aloud/help.
   */
  label?: string;
}

/** A single coloring page: outline line-art + its fillable zones. */
export interface ColoringPage {
  id: string;
  /** Kid-facing title, e.g. "Dump truck". */
  name: string;
  /** SVG viewBox, e.g. "0 0 100 100". Zones and outline share this space. */
  viewBox: string;
  /** The fillable regions, in paint order (first = drawn first / underneath). */
  zones: ColorZone[];
  /**
   * The black line-art, DERIVED from `zones` at construction time via
   * `outlineFromZones`. Stored (not recomputed) so a page is a plain data
   * object, but it is never authored by hand — the derivation guarantees the
   * outline traces exactly the zone borders.
   */
  outline: string;
}

/** A themed set of coloring pages ("Trucks", "Animals", …). */
export interface ColozooBook {
  id: string;
  /** Kid-facing title. */
  name: string;
  /** A single emoji used as the book's cover glyph. */
  emoji: string;
  pages: ColoringPage[];
}

/**
 * Stars earned for how much of a page is coloured — the ONLY feedback Colozoo
 * ever gives, and it only ever celebrates (never corrects, never subtracts a
 * "wrong" colour). Monotonic in practice: callers keep the best rating a page
 * ever reached (see useColoringPage), so stars can rise but never fall.
 *
 *   0 zones coloured            → 0 ★  (nothing painted yet)
 *   at least one zone           → 1 ★  ("any paint")
 *   more than 60% of zones      → 2 ★
 *   every zone coloured         → 3 ★
 *
 * Note the boundary is strict: EXACTLY 60% is still 1★ — you have to pass 60%
 * to earn the second star.
 */
export function starsForCoverage(coloredCount: number, totalZones: number): 0 | 1 | 2 | 3 {
  if (totalZones <= 0) return 0;
  if (coloredCount <= 0) return 0;
  if (coloredCount >= totalZones) return 3;
  const fraction = coloredCount / totalZones;
  if (fraction > 0.6) return 2;
  return 1;
}
