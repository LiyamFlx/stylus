import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from './clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('copyText', () => {
  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the async API rejects', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    const exec = vi.fn().mockReturnValue(true);
    // jsdom doesn't implement execCommand; stub it on document.
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    expect(await copyText('hi')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('returns false when both paths fail', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    expect(await copyText('x')).toBe(false);
  });
});
