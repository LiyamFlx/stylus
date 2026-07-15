/**
 * First-sign-in migration (ADR 002 "Migration" section). Pushes every
 * existing local document — and, for notebook docs, every page — to the
 * server as the initial authoritative sync. Runs exactly once per account
 * (gated server-side by api/sync/status.ts, not a local flag, so it holds
 * across devices per the ADR).
 *
 * Read-only against local state: this never mutates localStorage. It only
 * reads what documents.ts already exposes and hands it to the same push
 * functions the ongoing sync path uses (lib/syncApi.ts) — migration is not
 * a special code path with its own upload logic, just a one-time bulk
 * enqueue of everything that exists at the moment of first sign-in.
 */

import { listDocuments, listPages, readAux, readPageAux, inkKey, pageInkKey } from './documents';
import { loadStrokes } from '../hooks/useLocalStorage';
import { pushDocument, pushPage } from './syncApi';

export async function pushAllLocalDataToServer(token: string): Promise<void> {
  const docs = listDocuments();

  for (const doc of docs) {
    if (doc.mode === 'notebook') {
      // Notebook docs: doc-level meta only (no doc.strokes — ink lives per
      // page), then every page with its own strokes, matching the split in
      // db/migrations/001_sync_schema.sql.
      await pushDocument(token, {
        kind: 'document',
        id: doc.id,
        updatedAt: doc.updatedAt,
        meta: doc,
      });

      const pages = listPages(doc.id);
      for (const page of pages) {
        const strokes = loadStrokes(pageInkKey(doc.id, page.id));
        const aux = readPageAux(doc.id, page.id);
        await pushPage(token, {
          kind: 'page',
          id: page.id,
          documentId: doc.id,
          updatedAt: doc.updatedAt,
          meta: { ...page, aux },
          strokes,
        });
      }
    } else {
      // Canvas/Mobile docs: single stroke array, pushed on the document row
      // itself (documents.strokes) — no pages table involvement.
      const strokes = loadStrokes(inkKey(doc.id));
      const aux = readAux(doc.id);
      await pushDocument(token, {
        kind: 'document',
        id: doc.id,
        updatedAt: doc.updatedAt,
        meta: { ...doc, aux },
        strokes,
      });
    }
  }
}
