import { useCallback, useEffect, useState } from 'react';
import {
  createPage,
  deletePage,
  ensurePages,
  listPages,
  reorderPages,
} from '../lib/documents';
import type { PageMeta } from '../lib/documents';
import type { PaperStyle } from '../types';

export interface UsePagesResult {
  /** Empty when disabled (non-notebook docs). */
  pages: PageMeta[];
  activePageId: string | null;
  activeIndex: number;
  goTo: (pageId: string) => void;
  next: () => void;
  prev: () => void;
  add: (opts?: { paper?: PaperStyle }) => void;
  /** Deletes the ACTIVE page (storage guarantees ≥1 remains). */
  removeActive: () => void;
  reorder: (orderedIds: string[]) => void;
}

/**
 * Page state for notebook documents. Wraps the documents.ts page store and
 * owns which page is active. Lives ABOVE Workspace (in App) so it survives the
 * per-page Workspace remounts it causes.
 *
 * `enabled: false` (mobile/canvas docs) renders this hook INERT — no page
 * index is created for single-array documents, and every mutator is a no-op.
 * The enabled gate on the mutators (not just the init effect) is what upholds
 * documents.ts's "Mobile/Canvas docs never touch any of this" invariant: a
 * stray add() on a disabled hook would otherwise mint a page index for a
 * single-array doc.
 */
export function usePages(docId: string | null, enabled: boolean): UsePagesResult {
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // (Re)initialize when the document changes.
  useEffect(() => {
    if (!enabled || !docId) {
      setPages([]);
      setActivePageId(null);
      return;
    }
    const initial = ensurePages(docId);
    setPages(initial);
    setActivePageId(initial[0].id);
  }, [docId, enabled]);

  const refresh = useCallback(() => {
    if (enabled && docId) setPages(listPages(docId));
  }, [docId, enabled]);

  const goTo = useCallback((pageId: string) => {
    setActivePageId(pageId);
  }, []);

  const activeIndex = pages.findIndex((p) => p.id === activePageId);

  const next = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < pages.length - 1) {
      setActivePageId(pages[activeIndex + 1].id);
    }
  }, [pages, activeIndex]);

  const prev = useCallback(() => {
    if (activeIndex > 0) setActivePageId(pages[activeIndex - 1].id);
  }, [pages, activeIndex]);

  const add = useCallback(
    (opts?: { paper?: PaperStyle }) => {
      if (!enabled || !docId) return;
      const page = createPage(docId, { ...opts, afterId: activePageId ?? undefined });
      refresh();
      setActivePageId(page.id);
    },
    [docId, enabled, activePageId, refresh],
  );

  const removeActive = useCallback(() => {
    if (!enabled || !docId || !activePageId) return;
    const nextId = deletePage(docId, activePageId);
    refresh();
    setActivePageId(nextId);
  }, [docId, enabled, activePageId, refresh]);

  const reorder = useCallback(
    (orderedIds: string[]) => {
      if (!enabled || !docId) return;
      reorderPages(docId, orderedIds);
      refresh();
    },
    [docId, enabled, refresh],
  );

  return { pages, activePageId, activeIndex, goTo, next, prev, add, removeActive, reorder };
}