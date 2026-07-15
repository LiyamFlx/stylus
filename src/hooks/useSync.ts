import { useEffect, useRef, useState } from 'react';
import { useOptionalUser } from './useOptionalUser';
import { drainQueue, requeueIfNotSuperseded, subscribeQueue, hasPending } from '../lib/syncQueue';
import type { SyncPush } from '../lib/syncQueue';
import { pushDocument, pushPage, getSyncStatus, markSyncComplete } from '../lib/syncApi';
import { pushAllLocalDataToServer } from '../lib/syncMigration';

export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'offline-pending';

/** Coarse retry cadence for anything left in the queue after a failed push
 *  (network blip, momentarily-expired token, etc). Not tied to the 400ms
 *  local-save debounce — that governs LOCAL persistence and must stay fast;
 *  this only governs how eagerly a already-durable-locally, not-yet-synced
 *  change gets retried against the server. */
const RETRY_INTERVAL_MS = 15_000;

/**
 * Mounted once in App (ADR 002 / roadmap instruction), not per-Workspace —
 * a page flip remounts Workspace on every notebook page turn, but the sync
 * queue and its drain loop must survive that, so this hook and the
 * module-level queue it reads both live above the per-page component tree.
 *
 * Sign-in is opt-in and this hook is a pure no-op whenever the user is
 * signed out or Clerk isn't configured: no interval runs, no fetch fires,
 * queued pushes just accumulate harmlessly (and get superseded by newer
 * local edits) until there's a session to send them with.
 */
export function useSync(): { status: SyncStatus } {
  const { isSignedIn, isLoaded, getToken } = useOptionalUser();
  const [status, setStatus] = useState<SyncStatus>('disabled');
  const migratedRef = useRef(false);

  // First-sign-in migration: push all existing local data once per account
  // (server-side flag, ADR 002). Runs before the ongoing drain loop starts
  // so a fresh sign-in's bulk push isn't racing individual queued pushes
  // from local edits made in the same session.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || migratedRef.current) return;
    migratedRef.current = true;

    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const syncedAt = await getSyncStatus(token);
      if (syncedAt !== null) return; // already migrated, on this or another device
      await pushAllLocalDataToServer(token);
      if (!cancelled) await markSyncComplete(token);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  // Ongoing drain loop: fires whenever the queue changes, plus a coarse
  // retry interval to catch anything a failed push left behind. Every push
  // failure — network error, non-2xx, whatever — is silent-and-retry: it
  // re-queues (unless superseded by a newer local edit) and tries again on
  // the next tick, never surfaces an error to the user. Local persistence
  // already succeeded before anything was queued (useLocalStorage's
  // writeNow → onSaved ordering), so a slow/failing sync never means lost
  // work, only "not yet backed up."
  useEffect(() => {
    if (!isSignedIn) {
      setStatus('disabled');
      return;
    }

    let cancelled = false;

    const drain = async () => {
      if (cancelled) return;
      const items = drainQueue();
      if (items.length === 0) {
        setStatus((s) => (s === 'syncing' ? 'idle' : s));
        return;
      }
      setStatus('syncing');
      const token = await getToken();
      if (!token) {
        // No token available right now (expired session, momentary hiccup)
        // — put everything back and try again next tick.
        items.forEach(requeueIfNotSuperseded);
        setStatus('offline-pending');
        return;
      }
      for (const item of items) {
        if (cancelled) return;
        const result: { ok: boolean } =
          item.kind === 'document' ? await pushDocument(token, item) : await pushPage(token, item);
        if (!result.ok) requeueIfNotSuperseded(item as SyncPush);
      }
      if (!cancelled) setStatus(hasPending() ? 'offline-pending' : 'idle');
    };

    setStatus(hasPending() ? 'offline-pending' : 'idle');
    const unsubscribe = subscribeQueue(() => void drain());
    const interval = setInterval(() => void drain(), RETRY_INTERVAL_MS);
    void drain(); // catch anything already queued before this mounted

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(interval);
    };
  }, [isSignedIn, getToken]);

  return { status };
}
