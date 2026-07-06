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
 * `enabled: false` (mobile/canvas docs) renders this hook inert — no page
 * index is created for single-array documents.
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
    if (docId) setPages(listPages(docId));
  }, [docId]);

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
      if (!docId) return;
      const page = createPage(docId, { ...opts, afterId: activePageId ?? undefined });
      refresh();
      setActivePageId(page.id);
    },
    [docId, activePageId, refresh],
  );

  const removeActive = useCallback(() => {
    if (!docId || !activePageId) return;
    const nextId = deletePage(docId, activePageId);
    refresh();
    setActivePageId(nextId);
  }, [docId, activePageId, refresh]);

  const reorder = useCallback(
    (orderedIds: string[]) => {
      if (!docId) return;
      reorderPages(docId, orderedIds);
      refresh();
    },
    [docId, refresh],
  );

  return { pages, activePageId, activeIndex, goTo, next, prev, add, removeActive, reorder };
}
