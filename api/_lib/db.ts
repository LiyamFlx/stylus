import { neon } from '@neondatabase/serverless';

/**
 * Shared Postgres client for sync API routes (ADR 002). Neon's serverless
 * driver is a plain fetch-based HTTP client, not a persistent connection —
 * correct for Vercel's per-invocation serverless functions, where a pooled
 * TCP connection would leak or exhaust the database's connection limit
 * across cold starts.
 *
 * `POSTGRES_URL` is provisioned by the Vercel Postgres/Neon Marketplace
 * integration — never a hardcoded secret, same convention as the AI Gateway
 * OIDC token in api/refine.ts.
 */
export const sql = neon(process.env.POSTGRES_URL!);
