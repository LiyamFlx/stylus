import type { VercelRequest } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

/**
 * Verifies the caller's Clerk session token and returns their user id.
 * Every sync route needs this — protecting only the sync path, not the
 * drawing path (ADR 002 / roadmap instruction): OCR, AI refine, and the
 * entire local editing experience remain unauthenticated and unaffected.
 *
 * Returns null (never throws) on a missing/invalid token — callers respond
 * 401 themselves so each route controls its own error shape, matching how
 * api/refine.ts and api/recognize.ts each own their own error responses
 * rather than sharing a thrown-exception convention.
 */
export async function requireUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    const claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    return claims.sub;
  } catch {
    return null;
  }
}
