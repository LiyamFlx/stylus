/**
 * ColoZoo book library — real dot-marker coloring pages.
 *
 * Content pipeline: the physical Colozoo dot-marker sheets (PDF) are processed
 * offline into `public/colozoo/pages/<id>.png` (transparent line-art outline)
 * plus `books.gen.json` (per-page dot circles as [x, y, r] in 0–1000 per-mille
 * of the page box). This module expands that compact data into the existing
 * ColoringPage model: every dot is a tappable circular ColorZone; the printed
 * outline rides on top as a locked image layer (`outlineImg`).
 *
 * Adding/refreshing content = regenerating the JSON + PNGs. No code changes.
 */

import type { ColorZone, ColoringPage, ColozooBook } from './types';
import gen from './books.gen.json';

interface GenPage {
  id: string;
  title: string;
  w: number;
  h: number;
  /** dots as [x, y, r] in per-mille of the page box (r relative to width). */
  d: number[][];
}
interface GenBook {
  id: string;
  title: string;
  pages: GenPage[];
}

/** Shelf fallback emoji per book (covers are images; emoji is the fallback). */
const COVER_EMOJI: Record<string, string> = {
  shapes: '⭐',
  toys: '⚽',
  clothes: '👕',
  food: '🍎',
  garden: '🌷',
  vehicles: '🚒',
  ocean: '🐠',
};

/** Circle as a closed SVG path (flood-fillable), in viewBox coords. */
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx} ${cy} m${-r} 0 a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;

function toPage(bookId: string, pageNumber: number, p: GenPage): ColoringPage {
  const W = p.w;
  const H = p.h;
  const zones: ColorZone[] = p.d.map((d, i) => {
    const cx = (d[0] / 1000) * W;
    const cy = (d[1] / 1000) * H;
    const r = (d[2] / 1000) * W;
    return {
      id: `d${i}`,
      path: circle(Math.round(cx), Math.round(cy), Math.round(r)),
      label: `${p.title} dot ${i + 1}`,
    };
  });
  return {
    id: p.id,
    bookId,
    pageNumber,
    viewBox: `0 0 ${W} ${H}`,
    zones,
    // Outline is a raster asset; kept out of outlinesSvg so the export
    // compositor can draw it natively (SVG-as-image can't load external refs).
    outlinesSvg: '',
    outlineImg: `/colozoo/pages/${p.id}.png`,
    title: p.title,
  };
}

export const COLOZOO_BOOKS: ColozooBook[] = (gen.books as GenBook[]).map((b) => ({
  id: b.id,
  title: b.title,
  coverEmoji: COVER_EMOJI[b.id] ?? '📖',
  coverImg: `/colozoo/ui/cover-${b.id}.png`,
  pages: b.pages.map((p, i) => toPage(b.id, i + 1, p)),
}));

export function getBook(id: string): ColozooBook | undefined {
  return COLOZOO_BOOKS.find((b) => b.id === id);
}
