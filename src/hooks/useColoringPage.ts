/**
 * useColoringPage — all Colozoo page state for one coloring-book document.
 *
 * Owns: the open book + page, each page's zone fills, each page's (monotonic)
 * star rating, and the page's freehand ink. Every mutation is write-through to
 * localStorage (via lib/colozoo/storage), so there's no debounce to lose on a
 * fast tab-away — a child's colour is saved the instant they make it.
 *
 * Undo is a single "last mark wins" stack: fills and strokes are logged in the
 * order they happen, and one undo reverses whichever came last. The log is
 * in-memory and per page (undo doesn't need to survive a reload). Consistent
 * with the celebrate-only design, undo NEVER lowers a page's star rating.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Stroke } from '../types';
import { bookById, COLOZOO_BOOKS } from '../lib/colozoo/books';
import { starsForCoverage } from '../lib/colozoo/types';
import type { ColozooBook, ColoringPage } from '../lib/colozoo/types';
import {
  emptyColozooState,
  readColozooInk,
  readColozooState,
  writeColozooInk,
  writeColozooState,
  type ColozooDocState,
} from '../lib/colozoo/storage';

/** One reversible mark — a zone fill (with its prior colour) or a stroke. */
type Mark =
  | { type: 'fill'; zoneId: string; prev?: string }
  | { type: 'stroke'; id: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface ColoringPageApi {
  book: ColozooBook;
  page: ColoringPage;
  pageIndex: number;
  pageCount: number;
  books: readonly ColozooBook[];
  /** Current page's zone-id → fill colour. */
  fills: Record<string, string>;
  /** Current page's best star rating (0–3, monotonic). */
  stars: number;
  /** Per-page best star ratings for the whole book (for the shelf/nav dots). */
  bookStars: number[];
  /** Current page's freehand ink strokes. */
  ink: Stroke[];
  /** Fraction of zones filled on the current page (0–1). */
  coverage: number;
  /** True once every page in the book is at 3★ — the completion trigger. */
  bookComplete: boolean;
  fillZone(zoneId: string, color: string): void;
  addStroke(stroke: Stroke): void;
  /** Undo the last mark (fill or stroke), whichever came last. */
  undo(): void;
  goToPage(index: number): void;
  nextPage(): void;
  prevPage(): void;
  switchBook(bookId: string): void;
}

export function useColoringPage(docId: string): ColoringPageApi {
  const [state, setState] = useState<ColozooDocState>(
    () => readColozooState(docId) ?? emptyColozooState(COLOZOO_BOOKS[0].id),
  );

  const book = bookById(state.bookId);
  const pageIndex = clamp(state.pageIndex, 0, book.pages.length - 1);
  const page = book.pages[pageIndex];
  const pageId = page.id;

  const [ink, setInk] = useState<Stroke[]>(() => readColozooInk(docId, pageId));
  const undoLog = useRef<Mark[]>([]);

  // Single write-through point for state, so every mutator persists.
  const commitState = useCallback(
    (next: ColozooDocState) => {
      writeColozooState(docId, next);
      setState(next);
    },
    [docId],
  );

  const loadPage = useCallback(
    (nextState: ColozooDocState) => {
      const b = bookById(nextState.bookId);
      const idx = clamp(nextState.pageIndex, 0, b.pages.length - 1);
      commitState({ ...nextState, pageIndex: idx });
      setInk(readColozooInk(docId, b.pages[idx].id));
      undoLog.current = [];
    },
    [commitState, docId],
  );

  const fills = state.fills[pageId] ?? {};
  const stars = state.stars[pageId] ?? 0;
  const coverage = page.zones.length === 0 ? 0 : Object.keys(fills).length / page.zones.length;

  const bookStars = useMemo(
    () => book.pages.map((p) => state.stars[p.id] ?? 0),
    [book, state.stars],
  );
  const bookComplete = bookStars.length > 0 && bookStars.every((s) => s >= 3);

  const fillZone = useCallback(
    (zoneId: string, color: string) => {
      const prev = state.fills[pageId]?.[zoneId];
      // No-op if the colour is unchanged — don't log an undo that does nothing.
      if (prev === color) return;
      undoLog.current.push({ type: 'fill', zoneId, prev });

      const nextPageFills = { ...(state.fills[pageId] ?? {}), [zoneId]: color };
      const earned = starsForCoverage(Object.keys(nextPageFills).length, page.zones.length);
      commitState({
        ...state,
        fills: { ...state.fills, [pageId]: nextPageFills },
        // Monotonic: a page's stars can rise but never fall.
        stars: { ...state.stars, [pageId]: Math.max(state.stars[pageId] ?? 0, earned) },
      });
    },
    [state, pageId, page.zones.length, commitState],
  );

  const addStroke = useCallback(
    (stroke: Stroke) => {
      setInk((prev) => {
        const next = [...prev, stroke];
        writeColozooInk(docId, pageId, next);
        return next;
      });
      undoLog.current.push({ type: 'stroke', id: stroke.id });
    },
    [docId, pageId],
  );

  const undo = useCallback(() => {
    const mark = undoLog.current.pop();
    if (!mark) return;
    if (mark.type === 'stroke') {
      setInk((prev) => {
        const next = prev.filter((s) => s.id !== mark.id);
        writeColozooInk(docId, pageId, next);
        return next;
      });
      return;
    }
    // Restore the zone's previous colour (or clear it). Stars are NOT lowered —
    // celebrate-only: a star, once earned, stays earned.
    const pageFills = { ...(state.fills[pageId] ?? {}) };
    if (mark.prev === undefined) delete pageFills[mark.zoneId];
    else pageFills[mark.zoneId] = mark.prev;
    commitState({ ...state, fills: { ...state.fills, [pageId]: pageFills } });
  }, [docId, pageId, state, commitState]);

  const goToPage = useCallback(
    (index: number) => loadPage({ ...state, pageIndex: index }),
    [loadPage, state],
  );
  const nextPage = useCallback(
    () => loadPage({ ...state, pageIndex: pageIndex + 1 }),
    [loadPage, state, pageIndex],
  );
  const prevPage = useCallback(
    () => loadPage({ ...state, pageIndex: pageIndex - 1 }),
    [loadPage, state, pageIndex],
  );
  const switchBook = useCallback(
    (bookId: string) => loadPage({ ...state, bookId, pageIndex: 0 }),
    [loadPage, state],
  );

  return {
    book,
    page,
    pageIndex,
    pageCount: book.pages.length,
    books: COLOZOO_BOOKS,
    fills,
    stars,
    bookStars,
    ink,
    coverage,
    bookComplete,
    fillZone,
    addStroke,
    undo,
    goToPage,
    nextPage,
    prevPage,
    switchBook,
  };
}
