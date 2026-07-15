import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db';
import { requireUserId } from '../_lib/auth';

/**
 * Document sync (ADR 002). One row per canvas/mobile-mode doc (whole doc,
 * including its ink) or per notebook-mode doc's metadata (its pages' ink
 * lives in api/sync/pages.ts instead — see db/migrations/001_sync_schema.sql).
 *
 * GET  -> { documents: [...] }               pull everything for this user
 * POST { id, updatedAt, meta, strokes? } -> { ok, updatedAt }
 *      push one doc. Last-write-wins is enforced by the upsert's WHERE
 *      clause, not here: an older updatedAt than what's stored is a no-op,
 *      and the response's updatedAt tells the client which value actually
 *      won so it can reconcile its local copy if its push was rejected.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in to sync.' });
    return;
  }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, updated_at, meta, strokes
      FROM documents
      WHERE user_id = ${userId}
    `;
    res.status(200).json({
      documents: rows.map((r) => ({
        id: r.id as string,
        updatedAt: Number(r.updated_at),
        meta: r.meta,
        strokes: r.strokes ?? null,
      })),
    });
    return;
  }

  if (req.method === 'POST') {
    const { id, updatedAt, meta, strokes } = (req.body ?? {}) as {
      id?: string;
      updatedAt?: number;
      meta?: unknown;
      strokes?: unknown;
    };
    if (!id || typeof updatedAt !== 'number' || meta === undefined) {
      res.status(400).json({ error: 'id, updatedAt, and meta are required.' });
      return;
    }

    // Last-write-wins, enforced in the upsert itself (ADR 002): the WHERE on
    // the DO UPDATE clause means a push with a stale updatedAt is silently
    // rejected at the database level — no read-then-compare race in the API
    // route, no application-level "is mine newer" logic to get wrong.
    const rows = await sql`
      INSERT INTO documents (id, user_id, updated_at, meta, strokes)
      VALUES (${id}, ${userId}, ${updatedAt}, ${JSON.stringify(meta)}, ${
        strokes !== undefined ? JSON.stringify(strokes) : null
      })
      ON CONFLICT (id) DO UPDATE SET
        updated_at = EXCLUDED.updated_at,
        meta = EXCLUDED.meta,
        strokes = EXCLUDED.strokes
      WHERE documents.updated_at < EXCLUDED.updated_at
        AND documents.user_id = ${userId}
      RETURNING updated_at
    `;

    if (rows.length > 0) {
      res.status(200).json({ ok: true, updatedAt: Number(rows[0].updated_at) });
      return;
    }

    // No row returned = either the WHERE rejected a stale push, or the
    // insert path didn't fire because a conflicting row exists under a
    // different user (shouldn't happen — ids are client-generated per
    // createId(), collision across users is not a case this handles).
    // Read back the current value so the client knows what actually won.
    const current = await sql`
      SELECT updated_at FROM documents WHERE id = ${id} AND user_id = ${userId}
    `;
    res.status(200).json({
      ok: false,
      updatedAt: current.length > 0 ? Number(current[0].updated_at) : null,
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
