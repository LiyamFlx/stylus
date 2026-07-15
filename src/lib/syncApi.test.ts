import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pushDocument,
  pushPage,
  pullDocuments,
  pullPages,
  getSyncStatus,
  markSyncComplete,
} from './syncApi';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response;
}

describe('syncApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('pushDocument', () => {
    it('sends an authenticated POST and returns the server result', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, updatedAt: 42 }));
      const result = await pushDocument('tok', {
        kind: 'document',
        id: 'd1',
        updatedAt: 42,
        meta: { name: 'Note' },
      });
      expect(result).toEqual({ ok: true, updatedAt: 42 });
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('/api/sync/documents');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    });

    it('reports failure on a non-2xx response, never throws', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'nope' }, false, 500));
      const result = await pushDocument('tok', {
        kind: 'document',
        id: 'd1',
        updatedAt: 1,
        meta: {},
      });
      expect(result).toEqual({ ok: false, updatedAt: null });
    });

    it('reports failure on a network error, never throws', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('offline'));
      const result = await pushDocument('tok', {
        kind: 'document',
        id: 'd1',
        updatedAt: 1,
        meta: {},
      });
      expect(result).toEqual({ ok: false, updatedAt: null });
    });
  });

  describe('pushPage', () => {
    it('sends an authenticated POST with documentId', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, updatedAt: 5 }));
      const result = await pushPage('tok', {
        kind: 'page',
        id: 'p1',
        documentId: 'd1',
        updatedAt: 5,
        meta: {},
        strokes: [],
      });
      expect(result).toEqual({ ok: true, updatedAt: 5 });
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/sync/pages');
    });
  });

  describe('pullDocuments', () => {
    it('returns the document list on success', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ documents: [{ id: 'd1', updatedAt: 1, meta: {}, strokes: null }] }),
      );
      const result = await pullDocuments('tok');
      expect(result).toHaveLength(1);
      expect(result?.[0].id).toBe('d1');
    });

    it('returns null on failure', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 401));
      expect(await pullDocuments('tok')).toBeNull();
    });
  });

  describe('pullPages', () => {
    it('scopes the request to the given documentId', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ pages: [] }));
      await pullPages('tok', 'd1');
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/sync/pages?documentId=d1');
    });
  });

  describe('sync status', () => {
    it('getSyncStatus returns the timestamp or null', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ syncedAt: 123 }));
      expect(await getSyncStatus('tok')).toBe(123);
    });

    it('markSyncComplete returns whether the call succeeded', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ syncedAt: 123 }));
      expect(await markSyncComplete('tok')).toBe(true);

      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 500));
      expect(await markSyncComplete('tok')).toBe(false);
    });
  });
});
