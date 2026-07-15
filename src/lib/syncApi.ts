/**
 * Client for the sync API routes (ADR 002). Mirrors lib/ai.ts's shape (a
 * thin fetch wrapper, real errors surfaced not swallowed) — but callers here
 * treat every failure as "retry later," never as something to show the
 * user, per the roadmap's silent-and-retry sync boundary. That policy lives
 * in useSync.ts, not here; this module only reports success/failure.
 */

import type { DocumentPush, PagePush } from './syncQueue';

export interface RemoteDocument {
  id: string;
  updatedAt: number;
  meta: unknown;
  strokes: unknown;
}

export interface RemotePage {
  id: string;
  documentId: string;
  updatedAt: number;
  meta: unknown;
  strokes: unknown;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** True on any non-2xx or network failure — callers re-queue rather than
 *  inspect the reason, matching "sync failure is always silent-and-retry." */
export async function pushDocument(
  token: string,
  push: DocumentPush,
): Promise<{ ok: boolean; updatedAt: number | null }> {
  try {
    const res = await fetch('/api/sync/documents', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        id: push.id,
        updatedAt: push.updatedAt,
        meta: push.meta,
        strokes: push.strokes,
      }),
    });
    if (!res.ok) return { ok: false, updatedAt: null };
    const data = (await res.json()) as { ok: boolean; updatedAt: number | null };
    return data;
  } catch {
    return { ok: false, updatedAt: null };
  }
}

export async function pushPage(
  token: string,
  push: PagePush,
): Promise<{ ok: boolean; updatedAt: number | null }> {
  try {
    const res = await fetch('/api/sync/pages', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        id: push.id,
        documentId: push.documentId,
        updatedAt: push.updatedAt,
        meta: push.meta,
        strokes: push.strokes,
      }),
    });
    if (!res.ok) return { ok: false, updatedAt: null };
    const data = (await res.json()) as { ok: boolean; updatedAt: number | null };
    return data;
  } catch {
    return { ok: false, updatedAt: null };
  }
}

export async function pullDocuments(token: string): Promise<RemoteDocument[] | null> {
  try {
    const res = await fetch('/api/sync/documents', { headers: authHeaders(token) });
    if (!res.ok) return null;
    const data = (await res.json()) as { documents: RemoteDocument[] };
    return data.documents;
  } catch {
    return null;
  }
}

export async function pullPages(token: string, documentId: string): Promise<RemotePage[] | null> {
  try {
    const res = await fetch(`/api/sync/pages?documentId=${encodeURIComponent(documentId)}`, {
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pages: RemotePage[] };
    return data.pages;
  } catch {
    return null;
  }
}

export async function getSyncStatus(token: string): Promise<number | null> {
  try {
    const res = await fetch('/api/sync/status', { headers: authHeaders(token) });
    if (!res.ok) return null;
    const data = (await res.json()) as { syncedAt: number | null };
    return data.syncedAt;
  } catch {
    return null;
  }
}

export async function markSyncComplete(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/status', {
      method: 'POST',
      headers: authHeaders(token),
    });
    return res.ok;
  } catch {
    return false;
  }
}
