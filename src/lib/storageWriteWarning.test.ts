import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The module holds a single `lastWarnedAt` cooldown timestamp at module
// scope (deliberately — see its doc comment). Each test needs a fresh
// instance of that state, so re-import via resetModules rather than reusing
// the shared singleton across tests.
async function freshModule() {
  vi.resetModules();
  const { warnStorageWriteFailed } = await import('./storageWriteWarning');
  const { toast } = await import('./toast');
  return { warnStorageWriteFailed, toast };
}

describe('warnStorageWriteFailed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an error toast on the first call', async () => {
    const { warnStorageWriteFailed, toast } = await freshModule();
    const spy = vi.spyOn(toast, 'error');
    warnStorageWriteFailed();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/couldn.t save/i);
  });

  it('suppresses repeat calls within the cooldown window', async () => {
    const { warnStorageWriteFailed, toast } = await freshModule();
    const spy = vi.spyOn(toast, 'error');
    warnStorageWriteFailed();
    warnStorageWriteFailed();
    warnStorageWriteFailed();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('fires again after the cooldown elapses', async () => {
    const { warnStorageWriteFailed, toast } = await freshModule();
    const spy = vi.spyOn(toast, 'error');
    warnStorageWriteFailed();
    vi.advanceTimersByTime(15_001);
    warnStorageWriteFailed();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
