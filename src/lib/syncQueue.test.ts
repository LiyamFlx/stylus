import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queuePush,
  drainQueue,
  requeueIfNotSuperseded,
  hasPending,
  subscribeQueue,
} from './syncQueue';

describe('syncQueue', () => {
  beforeEach(() => {
    drainQueue(); // reset module-level state between tests
  });

  it('starts empty', () => {
    expect(hasPending()).toBe(false);
    expect(drainQueue()).toEqual([]);
  });

  it('queues a push and drains it', () => {
    queuePush({ kind: 'document', id: 'd1', updatedAt: 1, meta: {} });
    expect(hasPending()).toBe(true);
    const items = drainQueue();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('d1');
    expect(hasPending()).toBe(false);
  });

  it('collapses a burst of pushes to the same id into the latest one', () => {
    queuePush({ kind: 'document', id: 'd1', updatedAt: 1, meta: { v: 1 } });
    queuePush({ kind: 'document', id: 'd1', updatedAt: 2, meta: { v: 2 } });
    queuePush({ kind: 'document', id: 'd1', updatedAt: 3, meta: { v: 3 } });
    const items = drainQueue();
    expect(items).toHaveLength(1);
    expect(items[0].updatedAt).toBe(3);
  });

  it('keeps distinct ids separate', () => {
    queuePush({ kind: 'document', id: 'd1', updatedAt: 1, meta: {} });
    queuePush({ kind: 'document', id: 'd2', updatedAt: 1, meta: {} });
    expect(drainQueue()).toHaveLength(2);
  });

  it('notifies subscribers on queue', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQueue(listener);
    queuePush({ kind: 'document', id: 'd1', updatedAt: 1, meta: {} });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    queuePush({ kind: 'document', id: 'd2', updatedAt: 1, meta: {} });
    expect(listener).toHaveBeenCalledTimes(1); // not called after unsubscribe
  });

  describe('requeueIfNotSuperseded', () => {
    it('re-queues a failed push when nothing newer has arrived', () => {
      const push = { kind: 'document' as const, id: 'd1', updatedAt: 1, meta: {} };
      requeueIfNotSuperseded(push);
      expect(hasPending()).toBe(true);
      expect(drainQueue()[0]).toEqual(push);
    });

    it('does not clobber a newer push already queued for the same id', () => {
      const stale = { kind: 'document' as const, id: 'd1', updatedAt: 1, meta: { v: 'stale' } };
      queuePush({ kind: 'document', id: 'd1', updatedAt: 2, meta: { v: 'fresh' } });
      requeueIfNotSuperseded(stale);
      const items = drainQueue();
      expect(items).toHaveLength(1);
      expect(items[0].updatedAt).toBe(2); // the fresh one won, not the stale retry
    });
  });
});
