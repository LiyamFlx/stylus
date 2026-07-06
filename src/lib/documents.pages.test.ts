import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDocument,
  createPage,
  deleteDocument,
  deletePage,
  ensurePages,
  listDocuments,
  listPages,
  pageAuxKey,
  pageInkKey,
  pagesKey,
  readPageAux,
  reorderPages,
  setPagePaper,
  writePageAux,
} from './documents';

const NOW = 1_000_000;

/** Convenience: a notebook doc with n pages, returns [docId, pageIds]. */
function notebook(n: number): [string, string[]] {
  const doc = createDocument('Notes', NOW, 'notebook');
  ensurePages(doc.id);
  for (let i = 1; i < n; i++) createPage(doc.id);
  return [doc.id, listPages(doc.id).map((p) => p.id)];
}

describe('pages', () => {
  beforeEach(() => localStorage.clear());

  describe('ensurePages', () => {
    it('creates a first page and is idempotent', () => {
      const doc = createDocument('Notes', NOW, 'notebook');
      const a = ensurePages(doc.id);
      const b = ensurePages(doc.id);
      expect(a).toHaveLength(1);
      expect(b[0].id).toBe(a[0].id);
      expect(a[0].index).toBe(0);
    });

    it('syncs DocMeta.pageCount', () => {
      const doc = createDocument('Notes', NOW, 'notebook');
      ensurePages(doc.id);
      expect(listDocuments().find((d) => d.id === doc.id)?.pageCount).toBe(1);
    });
  });

  describe('createPage', () => {
    it('appends at the end with contiguous indexes and updates pageCount', () => {
      const [docId] = notebook(3);
      const pages = listPages(docId);
      expect(pages.map((p) => p.index)).toEqual([0, 1, 2]);
      expect(listDocuments().find((d) => d.id === docId)?.pageCount).toBe(3);
    });

    it('inserts after a given page and reindexes', () => {
      const [docId, ids] = notebook(2);
      const mid = createPage(docId, { afterId: ids[0] });
      const pages = listPages(docId);
      expect(pages.map((p) => p.id)).toEqual([ids[0], mid.id, ids[1]]);
      expect(pages.map((p) => p.index)).toEqual([0, 1, 2]);
      expect(mid.index).toBe(1);
    });

    it('honors a per-page paper override', () => {
      const [docId] = notebook(1);
      const p = createPage(docId, { paper: 'blank' });
      expect(listPages(docId).find((x) => x.id === p.id)?.paper).toBe('blank');
    });
  });

  describe('deletePage', () => {
    it('removes the page AND both payload keys', () => {
      const [docId, ids] = notebook(2);
      localStorage.setItem(pageInkKey(docId, ids[0]), 'ink');
      writePageAux(docId, ids[0], { texts: [] });
      deletePage(docId, ids[0]);
      expect(localStorage.getItem(pageInkKey(docId, ids[0]))).toBeNull();
      expect(localStorage.getItem(pageAuxKey(docId, ids[0]))).toBeNull();
      expect(listPages(docId).map((p) => p.id)).toEqual([ids[1]]);
      expect(listDocuments().find((d) => d.id === docId)?.pageCount).toBe(1);
    });

    it('returns the neighbor now occupying the deleted slot', () => {
      const [docId, ids] = notebook(3);
      expect(deletePage(docId, ids[1])).toBe(ids[2]); // middle → next slides in
      expect(deletePage(docId, ids[2])).toBe(ids[0]); // last → previous
    });

    it('never leaves zero pages — deleting the last creates a replacement', () => {
      const [docId, ids] = notebook(1);
      const nextId = deletePage(docId, ids[0]);
      const pages = listPages(docId);
      expect(pages).toHaveLength(1);
      expect(pages[0].id).toBe(nextId);
      expect(pages[0].id).not.toBe(ids[0]);
    });

    it('reindexes after a middle deletion', () => {
      const [docId, ids] = notebook(3);
      deletePage(docId, ids[1]);
      expect(listPages(docId).map((p) => p.index)).toEqual([0, 1]);
    });
  });

  describe('reorderPages', () => {
    it('reorders and reindexes', () => {
      const [docId, ids] = notebook(3);
      reorderPages(docId, [ids[2], ids[0], ids[1]]);
      const pages = listPages(docId);
      expect(pages.map((p) => p.id)).toEqual([ids[2], ids[0], ids[1]]);
      expect(pages.map((p) => p.index)).toEqual([0, 1, 2]);
    });

    it('rejects a stale order wholesale (wrong length or unknown id)', () => {
      const [docId, ids] = notebook(2);
      reorderPages(docId, [ids[0]]); // wrong length
      reorderPages(docId, [ids[0], 'p_ghost']); // unknown id
      expect(listPages(docId).map((p) => p.id)).toEqual(ids);
    });
  });

  describe('page aux', () => {
    it('defaults to empty texts and round-trips', () => {
      const [docId, ids] = notebook(1);
      expect(readPageAux(docId, ids[0])).toEqual({ texts: [], images: [] });
      const texts = [{ id: 't1', x: 1, y: 2, text: 'hi', color: '#fff', size: 20 }];
      writePageAux(docId, ids[0], { texts });
      expect(readPageAux(docId, ids[0]).texts).toEqual(texts);
    });

    it('survives corrupt aux payloads', () => {
      const [docId, ids] = notebook(1);
      localStorage.setItem(pageAuxKey(docId, ids[0]), '{"texts": 42}');
      expect(readPageAux(docId, ids[0])).toEqual({ texts: [], images: [] });
    });
  });

  describe('setPagePaper', () => {
    it('overrides one page without touching siblings', () => {
      const [docId, ids] = notebook(2);
      setPagePaper(docId, ids[1], 'dots');
      const pages = listPages(docId);
      expect(pages[0].paper).not.toBe('dots');
      expect(pages[1].paper).toBe('dots');
    });
  });

  describe('deleteDocument page sweep', () => {
    it('removes every page payload, the page index, and pageCount source', () => {
      const [docId, ids] = notebook(2);
      localStorage.setItem(pageInkKey(docId, ids[0]), 'ink0');
      localStorage.setItem(pageInkKey(docId, ids[1]), 'ink1');
      writePageAux(docId, ids[0], { texts: [] });
      deleteDocument(docId);
      expect(localStorage.getItem(pagesKey(docId))).toBeNull();
      expect(localStorage.getItem(pageInkKey(docId, ids[0]))).toBeNull();
      expect(localStorage.getItem(pageInkKey(docId, ids[1]))).toBeNull();
      expect(localStorage.getItem(pageAuxKey(docId, ids[0]))).toBeNull();
    });
  });
});
