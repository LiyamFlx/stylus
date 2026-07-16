/**
 * ColoZoo persistence — zone fills, stars, and book progress, per document.
 *
 * Follows the documents.ts key conventions (`stylus.doc.v1.<id>.*`) so
 * deleteDocument-style sweeps have one predictable namespace. Freehand ink is
 * NOT stored here — it rides the existing useLocalStorage stroke path under a
 * per-coloring-page storage key (see colozooInkKey).
 *
 * Shape: one blob per document (not per page) — zone fill maps are tiny
 * (zoneId → hex string), so a whole book's fills fit comfortably in one key
 * and read/write stays a single localStorage roundtrip.
 */

import type { StarRating } from './types';
import { warnStorageWriteFailed } from '../storageWriteWarning';

export interface ColozooDocState {
  version: 1;
  /** Which book this document is coloring. */
  bookId: string;
  /** 1-based page the child was last on. */
  currentPage: number;
  /** pageId → zoneId → hex color. */
  zoneColors: Record<string, Record<string, string>>;
  /** pageId → stars earned (monotonic — stars are never taken away). */
  stars: Record<string, StarRating>;
}

export const colozooKey = (docId: string) => `stylus.doc.v1.${docId}.colozoo`;

/** Freehand ink storage key for one coloring page — plugs into the existing
 *  useLocalStorage/useDrawing persistence path unchanged. */
export const colozooInkKey = (docId: string, pageId: string) =>
  `stylus.doc.v1.${docId}.colozoo.${pageId}.ink`;

export function defaultColozooState(bookId: string): ColozooDocState {
  return { version: 1, bookId, currentPage: 1, zoneColors: {}, stars: {} };
}

export function readColozooState(docId: string, fallbackBookId: string): ColozooDocState {
  try {
    const raw = localStorage.getItem(colozooKey(docId));
    if (!raw) return defaultColozooState(fallbackBookId);
    const v = JSON.parse(raw) as Partial<ColozooDocState>;
    if (v.version !== 1 || typeof v.bookId !== 'string') {
      return defaultColozooState(fallbackBookId);
    }
    return {
      version: 1,
      bookId: v.bookId,
      currentPage: typeof v.currentPage === 'number' && v.currentPage >= 1 ? v.currentPage : 1,
      zoneColors: v.zoneColors && typeof v.zoneColors === 'object' ? v.zoneColors : {},
      stars: v.stars && typeof v.stars === 'object' ? (v.stars as Record<string, StarRating>) : {},
    };
  } catch {
    return defaultColozooState(fallbackBookId);
  }
}

export function writeColozooState(docId: string, state: ColozooDocState): void {
  try {
    localStorage.setItem(colozooKey(docId), JSON.stringify(state));
  } catch (err) {
    console.warn('[stylus] colozoo save failed', err);
    warnStorageWriteFailed();
  }
}

/** Sweep every ColoZoo key for a document — call from doc deletion paths.
 *  Ink keys are enumerated by prefix scan since page ids are static assets. */
export function purgeColozooKeys(docId: string): void {
  try {
    localStorage.removeItem(colozooKey(docId));
    const prefix = `stylus.doc.v1.${docId}.colozoo.`;
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    // best-effort
  }
}
