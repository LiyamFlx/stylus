/**
 * Colozoo persistence — a small, self-contained localStorage layer that lives
 * ALONGSIDE the core document store, never inside it.
 *
 * Layout (per document id):
 *   stylus.doc.v1.<id>.colozoo                    → ColozooDocState (JSON)
 *   stylus.doc.v1.<id>.colozoo.page.<pageId>.ink  → Stroke[] for that page
 *
 * The state blob holds which book/page is open, each page's zone fills, and
 * each page's best star rating. Freehand ink is split out per page (mirroring
 * how the core store splits hot stroke arrays off the lightweight index) so
 * writing a stroke never rewrites the whole fill map.
 *
 * This module has NO dependency on documents.ts — documents.ts calls
 * `purgeColozooKeys` on delete, a one-way edge, so there's no import cycle.
 */

import type { Stroke } from '../../types';

export interface ColozooDocState {
  version: 1;
  /** Which book is open (id into books.ts COLOZOO_BOOKS). */
  bookId: string;
  /** Index of the open page within that book. */
  pageIndex: number;
  /** Per page-id → (zone-id → fill colour hex). */
  fills: Record<string, Record<string, string>>;
  /** Per page-id → best star rating reached (monotonic; 0–3). */
  stars: Record<string, number>;
}

/** Namespace prefix for everything Colozoo stores for a document. Both the
 *  state key and every per-page ink key start with this, so a single
 *  prefix sweep purges the lot. */
const colozooPrefix = (docId: string) => `stylus.doc.v1.${docId}.colozoo`;

export const colozooStateKey = (docId: string) => colozooPrefix(docId);

export const colozooInkKey = (docId: string, pageId: string) =>
  `${colozooPrefix(docId)}.page.${pageId}.ink`;

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort — a full quota drops the last colour, never crashes the app
  }
}

/** A fresh, empty state pointing at the given book's first page. */
export function emptyColozooState(bookId: string): ColozooDocState {
  return { version: 1, bookId, pageIndex: 0, fills: {}, stars: {} };
}

/** Read a document's Colozoo state, or null if it has none yet. */
export function readColozooState(docId: string): ColozooDocState | null {
  const s = safeRead<Partial<ColozooDocState>>(colozooStateKey(docId));
  if (!s || s.version !== 1 || typeof s.bookId !== 'string') return null;
  return {
    version: 1,
    bookId: s.bookId,
    pageIndex: typeof s.pageIndex === 'number' ? s.pageIndex : 0,
    fills: s.fills && typeof s.fills === 'object' ? s.fills : {},
    stars: s.stars && typeof s.stars === 'object' ? s.stars : {},
  };
}

export function writeColozooState(docId: string, state: ColozooDocState): void {
  safeWrite(colozooStateKey(docId), state);
}

/** Read a page's freehand ink (empty array if none). */
export function readColozooInk(docId: string, pageId: string): Stroke[] {
  const v = safeRead<Stroke[]>(colozooInkKey(docId, pageId));
  return Array.isArray(v) ? v : [];
}

export function writeColozooInk(docId: string, pageId: string, strokes: Stroke[]): void {
  safeWrite(colozooInkKey(docId, pageId), strokes);
}

/**
 * Remove every Colozoo key for a document — its state blob AND all per-page
 * ink blobs — via a single prefix sweep. Called from
 * documents.deleteDocument so a deleted coloring book leaves no orphaned
 * blobs behind (a quota leak identical to an orphaned page payload).
 *
 * Iterating a snapshot of the keys (not the live index) keeps removal safe as
 * the store shrinks underneath us.
 */
export function purgeColozooKeys(docId: string): void {
  try {
    const prefix = colozooPrefix(docId);
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // best-effort — a failed purge is only a storage leak, never a crash
  }
}
