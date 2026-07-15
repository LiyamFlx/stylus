import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

/**
 * First-sign-in migration bookkeeping (ADR 002). The client's initial-sync
 * push (existing local documents → server, on first sign-in on a device
 * with local data) must run exactly once per account, not once per
 * sign-in — GET tells the client whether it's already happened; POST marks
 * it done. Server-side, not a localStorage flag, so it holds across
 * devices: signing into a fresh second device correctly sees "already
 * migrated" and pulls instead of re-pushing local (empty, on a fresh
 * device) state over the real server data.
 *
 * GET  -> { syncedAt: number | null }
 * POST -> { syncedAt: number }   marks migration complete, idempotent
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in to sync.' });
    return;
  }

  if (req.method === 'GET') {
    const rows = await sql`SELECT synced_at FROM sync_state WHERE user_id = ${userId}`;
    res.status(200).json({ syncedAt: rows.length > 0 ? Number(rows[0].synced_at) : null });
    return;
  }

  if (req.method === 'POST') {
    const now = Date.now();
    const rows = await sql`
      INSERT INTO sync_state (user_id, synced_at)
      VALUES (${userId}, ${now})
      ON CONFLICT (user_id) DO UPDATE SET synced_at = sync_state.synced_at
      RETURNING synced_at
    `;
    // ON CONFLICT keeps the EXISTING synced_at (idempotent — a second POST
    // from a race between tabs must not push the timestamp forward and
    // re-open a window where a third caller thinks migration is pending).
    res.status(200).json({ syncedAt: Number(rows[0].synced_at) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
