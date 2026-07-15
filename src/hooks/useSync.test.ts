import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSync } from './useSync';
import { queuePush, drainQueue } from '../lib/syncQueue';

const mockGetToken = vi.fn<() => Promise<string | null>>();
const mockUseOptionalUser = vi.fn();
vi.mock('./useOptionalUser', () => ({
  useOptionalUser: () => mockUseOptionalUser(),
}));

const mockPushDocument = vi.fn();
const mockPushPage = vi.fn();
const mockGetSyncStatus = vi.fn();
const mockMarkSyncComplete = vi.fn();
vi.mock('../lib/syncApi', () => ({
  pushDocument: (...args: unknown[]) => mockPushDocument(...args),
  pushPage: (...args: unknown[]) => mockPushPage(...args),
  getSyncStatus: (...args: unknown[]) => mockGetSyncStatus(...args),
  markSyncComplete: (...args: unknown[]) => mockMarkSyncComplete(...args),
}));

const mockPushAllLocalData = vi.fn();
vi.mock('../lib/syncMigration', () => ({
  pushAllLocalDataToServer: (...args: unknown[]) => mockPushAllLocalData(...args),
}));

function signedOut() {
  mockUseOptionalUser.mockReturnValue({
    isSignedIn: false,
    isLoaded: true,
    userId: null,
    getToken: mockGetToken,
  });
}

function signedIn() {
  mockUseOptionalUser.mockReturnValue({
    isSignedIn: true,
    isLoaded: true,
    userId: 'user_1',
    getToken: mockGetToken,
  });
}

describe('useSync', () => {
  beforeEach(() => {
    drainQueue();
    vi.useFakeTimers();
    mockGetToken.mockReset().mockResolvedValue('tok');
    mockPushDocument.mockReset().mockResolvedValue({ ok: true, updatedAt: 1 });
    mockPushPage.mockReset().mockResolvedValue({ ok: true, updatedAt: 1 });
    mockGetSyncStatus.mockReset().mockResolvedValue(1); // already migrated by default
    mockMarkSyncComplete.mockReset().mockResolvedValue(true);
    mockPushAllLocalData.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('is disabled and does not push anything while signed out', async () => {
    signedOut();
    const { result } = renderHook(() => useSync());
    expect(result.current.status).toBe('disabled');

    queuePush({ kind: 'document', id: 'd1', updatedAt: 1, meta: {} });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(mockPushDocument).not.toHaveBeenCalled();
  });

  it('drains a queued push once signed in', async () => {
    signedIn();
    await act(async () => {
      renderHook(() => useSync());
      queuePush({ kind: 'document', id: 'd1', updatedAt: 5, meta: { name: 'x' } });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockPushDocument).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ id: 'd1', updatedAt: 5 }),
    );
  });

  it('re-queues and retries a push that fails, never surfacing an error', async () => {
    signedIn();
    // Both attempts before the real retry interval (the mount-time drain and
    // the queue-change-triggered drain can race and both see the same
    // queued item) fail; only the retry-interval-triggered attempt succeeds.
    mockPushDocument.mockResolvedValue({ ok: false, updatedAt: null });

    await act(async () => {
      renderHook(() => useSync());
      queuePush({ kind: 'document', id: 'd1', updatedAt: 5, meta: {} });
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsBeforeRetry = mockPushDocument.mock.calls.length;
    expect(callsBeforeRetry).toBeGreaterThan(0);

    mockPushDocument.mockResolvedValue({ ok: true, updatedAt: 5 });

    // Retry interval fires — the failed push is tried again, this time
    // succeeding. At no point does the hook throw or expose an error state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(mockPushDocument.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('routes page pushes to pushPage, not pushDocument', async () => {
    signedIn();
    await act(async () => {
      renderHook(() => useSync());
      queuePush({
        kind: 'page',
        id: 'p1',
        documentId: 'd1',
        updatedAt: 1,
        meta: {},
        strokes: [],
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockPushPage).toHaveBeenCalledTimes(1);
    expect(mockPushDocument).not.toHaveBeenCalled();
  });

  describe('first-sign-in migration', () => {
    it('runs the bulk push when the server has no prior sync record', async () => {
      signedIn();
      mockGetSyncStatus.mockResolvedValue(null); // never synced
      await act(async () => {
        renderHook(() => useSync());
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockPushAllLocalData).toHaveBeenCalledWith('tok');
      expect(mockMarkSyncComplete).toHaveBeenCalledWith('tok');
    });

    it('skips the bulk push when already migrated (any device)', async () => {
      signedIn();
      mockGetSyncStatus.mockResolvedValue(1_700_000_000_000); // synced previously
      await act(async () => {
        renderHook(() => useSync());
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockPushAllLocalData).not.toHaveBeenCalled();
      expect(mockMarkSyncComplete).not.toHaveBeenCalled();
    });

    it('does not re-run migration on a re-render while still signed in', async () => {
      signedIn();
      mockGetSyncStatus.mockResolvedValue(null);
      let rerender!: () => void;
      await act(async () => {
        rerender = renderHook(() => useSync()).rerender;
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockGetSyncStatus).toHaveBeenCalledTimes(1);

      rerender();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockGetSyncStatus).toHaveBeenCalledTimes(1); // not called again
    });
  });
});
