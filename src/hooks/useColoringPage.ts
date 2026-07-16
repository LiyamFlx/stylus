/**
 * ColoZoo document state hook — zone fills, page navigation, stars.
 *
 * Isolated feature hook (useLearningAudio pattern): owns ColoZoo persistence
 * end-to-end, touches nothing in the core stroke pipeline. Freehand ink for a
 * page persists separately via the existing useLocalStorage path keyed by
 * colozooInkKey — this hook only tracks whether any ink exists per page for
 * the 1-star "any paint applied" rule.
 *
 * Undo model (kid-simple): one stack of zone-fill actions for the ACTIVE page.
 * Stroke undo is the drawing layer's concern; the single big Undo button
 * dispatches to whichever kind of mark was made last (workspace decides).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { getBook } from '../lib/colozoo/books';
import type { ColoringPage, StarRating } from '../lib/colozoo/types';
import { starsForCoverage } from '../lib/colozoo/types';
import {
  readColozooState,
  writeColozooState,
  type ColozooDocState,
} from '../lib/colozoo/storage';

interface FillAction {
  pageId: string;
  zoneId: string;
  prevColor: string | undefined;
}

export interface ColoringPageApi {
  bookId: string;
  page: ColoringPage | null;
  pageCount: number;
  currentPage: number;
  /** zoneId → hex for the active page. */
  fills: Record<string, string>;
  /** Stars earned per pageId (monotonic). */
  stars: Record<string, StarRating>;
  /** Live rating for the active page given current fills. */
  activeStars: StarRating;
  /** True the moment every zone on the active page is colored. */
  pageComplete: boolean;
  fillZone: (zoneId: string, color: string) => void;
  /** Undo the last zone fill on the active page. Returns false if nothing to undo. */
  undoFill: () => boolean;
  goTo: (pageNumber: number) => void;
  next: () => void;
  prev: () => void;
  /** Report that freehand ink exists on the active page (1-star rule). */
  markInk: () => void;
  switchBook: (bookId: string) => void;
}

export function useColoringPage(docId: string, initialBookId: string): ColoringPageApi {
  const [state, setState] = useState<ColozooDocState>(() =>
    readColozooState(docId, initialBookId),
  );
  const undoStack = useRef<FillAction[]>([]);
  const inkPages = useRef(new Set<string>());
  // Bump to re-derive activeStars when ink lands (fills alone don't change).
  const [, setInkTick] = useState(0);

  const persist = useCallback(
    (next: ColozooDocState) => {
      setState(next);
      writeColozooState(docId, next);
    },
    [docId],
  );

  const book = getBook(state.bookId) ?? null;
  const pageCount = book?.pages.length ?? 0;
  const page = useMemo(
    () => book?.pages.find((p) => p.pageNumber === state.currentPage) ?? null,
    [book, state.currentPage],
  );

  const fills = (page && state.zoneColors[page.id]) || {};

  const computeStars = useCallback(
    (p: ColoringPage, pageFills: Record<string, string>): StarRating => {
      const colored = p.zones.filter((z) => pageFills[z.id]).length;
      return starsForCoverage(colored, p.zones.length, inkPages.current.has(p.id));
    },
    [],
  );

  const activeStars: StarRating = page ? computeStars(page, fills) : 0;
  const pageComplete = page ? page.zones.every((z) => fills[z.id]) : false;

  /** Stars are monotonic — celebrate progress, never take it back. */
  const settleStars = useCallback(
    (s: ColozooDocState, p: ColoringPage): ColozooDocState => {
      const rating = computeStars(p, s.zoneColors[p.id] ?? {});
      const prev = s.stars[p.id] ?? 0;
      if (rating <= prev) return s;
      return { ...s, stars: { ...s.stars, [p.id]: rating } };
    },
    [computeStars],
  );

  const fillZone = useCallback(
    (zoneId: string, color: string) => {
      if (!page) return;
      undoStack.current.push({ pageId: page.id, zoneId, prevColor: fills[zoneId] });
      const nextFills = { ...fills, [zoneId]: color };
      persist(
        settleStars(
          { ...state, zoneColors: { ...state.zoneColors, [page.id]: nextFills } },
          page,
        ),
      );
    },
    [page, fills, state, persist, settleStars],
  );

  const undoFill = useCallback((): boolean => {
    if (!page) return false;
    // Only undo fills on the page the child is looking at.
    const last = undoStack.current.length
      ? undoStack.current[undoStack.current.length - 1]
      : undefined;
    if (!last || last.pageId !== page.id) return false;
    undoStack.current.pop();
    const nextFills = { ...(state.zoneColors[page.id] ?? {}) };
    if (last.prevColor === undefined) delete nextFills[last.zoneId];
    else nextFills[last.zoneId] = last.prevColor;
    persist({ ...state, zoneColors: { ...state.zoneColors, [page.id]: nextFills } });
    return true;
  }, [page, state, persist]);

  const goTo = useCallback(
    (pageNumber: number) => {
      if (pageNumber < 1 || pageNumber > pageCount) return;
      persist({ ...state, currentPage: pageNumber });
    },
    [state, pageCount, persist],
  );

  const next = useCallback(() => goTo(state.currentPage + 1), [goTo, state.currentPage]);
  const prev = useCallback(() => goTo(state.currentPage - 1), [goTo, state.currentPage]);

  const markInk = useCallback(() => {
    if (!page || inkPages.current.has(page.id)) return;
    inkPages.current.add(page.id);
    setInkTick((t) => t + 1);
    persist(settleStars(state, page));
  }, [page, state, persist, settleStars]);

  const switchBook = useCallback(
    (bookId: string) => {
      if (!getBook(bookId)) return;
      // Keep zoneColors/stars — they're keyed by globally-unique pageId, so
      // switching back to a book restores its progress intact.
      persist({ ...state, bookId, currentPage: readColozooBookPage(state, bookId) });
      undoStack.current = [];
    },
    [state, persist],
  );

  return {
    bookId: state.bookId,
    page,
    pageCount,
    currentPage: state.currentPage,
    fills,
    stars: state.stars,
    activeStars,
    pageComplete,
    fillZone,
    undoFill,
    goTo,
    next,
    prev,
    markInk,
    switchBook,
  };
}

/** First not-yet-3-starred page of the target book, so switching books drops
 *  the child where there's still coloring to do (falls back to page 1). */
function readColozooBookPage(state: ColozooDocState, bookId: string): number {
  const book = getBook(bookId);
  if (!book) return 1;
  const open = book.pages.find((p) => (state.stars[p.id] ?? 0) < 3);
  return open?.pageNumber ?? 1;
}
