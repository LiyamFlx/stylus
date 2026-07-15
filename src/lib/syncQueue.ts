/**
 * Sync push queue (ADR 002). Module-level, not component state — a page
 * flip remounts Workspace (and would remount any hook state living there)
 * every time the user turns a notebook page, but a pending sync push must
 * survive that. The queue is the single thing that outlives per-page
 * component lifecycles; useSync (mounted once in App) drains it.
 *
 * Deliberately NOT persisted to localStorage: if the tab closes with a
 * push still queued, the next local edit's own save re-triggers a push for
 * that same document/page anyway (queueDocumentPush/queuePagePush replace
 * rather than append), so nothing is lost — the local write (already
 * durable) is always the source of truth being pushed FROM, not the queue
 * itself.
 */

export type SyncPushKind = 'document' | 'page';

export interface DocumentPush {
  kind: 'document';
  id: string;
  updatedAt: number;
  meta: unknown;
  strokes?: unknown;
}

export interface PagePush {
  kind: 'page';
  id: string;
  documentId: string;
  updatedAt: number;
  meta: unknown;
  strokes: unknown;
}

export type SyncPush = DocumentPush | PagePush;

type QueueListener = () => void;

// Keyed by push id so a burst of edits to the same doc/page collapses into
// one queued push carrying the latest state — never a growing backlog of
// stale intermediate versions for something still being actively edited.
const queue = new Map<string, SyncPush>();
const listeners = new Set<QueueListener>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function queuePush(push: SyncPush): void {
  queue.set(push.id, push);
  notify();
}

export function drainQueue(): SyncPush[] {
  const items = [...queue.values()];
  queue.clear();
  return items;
}

/**
 * Re-queue a push that failed to send — used by useSync's retry path. Only
 * re-queues if nothing newer for the same id has been queued since (a newer
 * local edit already superseded the failed one).
 *
 * Deliberately does NOT call notify(): the queue-change listener drains
 * immediately on notify, and a persistently-failing push would otherwise
 * requeue → notify → drain → fail → requeue → notify → ... in a tight
 * synchronous loop with no backoff, hammering the network and (found via a
 * test that reproduced it) exhausting the heap under a fake-timer test
 * environment where the "immediately" has no real wall-clock cost to break
 * the cycle. A requeued push is picked up on the next real interval tick
 * instead — see RETRY_INTERVAL_MS in useSync.ts — which is the actual
 * backoff this needs.
 */
export function requeueIfNotSuperseded(push: SyncPush): void {
  if (!queue.has(push.id)) {
    queue.set(push.id, push);
  }
}

export function hasPending(): boolean {
  return queue.size > 0;
}

export function subscribeQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
