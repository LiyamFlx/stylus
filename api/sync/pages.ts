import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db';
import { requireUserId } from '../_lib/auth';

/**
 * Notebook page sync (ADR 002). Mirrors api/sync/documents.ts's shape and
 * last-write-wins upsert, scoped to one notebook document's pages instead
 * of the whole doc list — matches the client's own split (Workspace.tsx
 * remounts per active page, each with its own storage key).
 *
 * GET  ?documentId=... -> { pages: [...] }
 * POST { id, documentId, updatedAt, meta, strokes } -> { ok, updatedAt }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in to sync.' });
    return;
  }

  if (req.method === 'GET') {
    const documentId = req.query.documentId;
    if (typeof documentId !== 'string') {
      res.status(400).json({ error: 'documentId is required.' });
      return;
    }
    const rows = await sql`
      SELECT id, document_id, updated_at, meta, strokes
      FROM pages
      WHERE document_id = ${documentId} AND user_id = ${userId}
    `;
    res.status(200).json({
      pages: rows.map((r) => ({
        id: r.id as string,
        documentId: r.document_id as string,
        updatedAt: Number(r.updated_at),
        meta: r.meta,
        strokes: r.strokes,
      })),
    });
    return;
  }

  if (req.method === 'POST') {
    const { id, documentId, updatedAt, meta, strokes } = (req.body ?? {}) as {
      id?: string;
      documentId?: string;
      updatedAt?: number;
      meta?: unknown;
      strokes?: unknown;
    };
    if (!id || !documentId || typeof updatedAt !== 'number' || meta === undefined || strokes === undefined) {
      res.status(400).json({ error: 'id, documentId, updatedAt, meta, and strokes are required.' });
      return;
    }

    // Same last-write-wins-in-the-upsert pattern as documents.ts. The parent
    // document row must already exist (FK constraint) — the client pushes
    // a doc's meta before its pages, same order createPage/deletePage
    // already assume locally (pagesKey depends on the doc existing).
    const rows = await sql`
      INSERT INTO pages (id, document_id, user_id, updated_at, meta, strokes)
      VALUES (${id}, ${documentId}, ${userId}, ${updatedAt}, ${JSON.stringify(meta)}, ${JSON.stringify(strokes)})
      ON CONFLICT (id) DO UPDATE SET
        updated_at = EXCLUDED.updated_at,
        meta = EXCLUDED.meta,
        strokes = EXCLUDED.strokes
      WHERE pages.updated_at < EXCLUDED.updated_at
        AND pages.user_id = ${userId}
      RETURNING updated_at
    `;

    if (rows.length > 0) {
      res.status(200).json({ ok: true, updatedAt: Number(rows[0].updated_at) });
      return;
    }

    const current = await sql`
      SELECT updated_at FROM pages WHERE id = ${id} AND user_id = ${userId}
    `;
    res.status(200).json({
      ok: false,
      updatedAt: current.length > 0 ? Number(current[0].updated_at) : null,
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
