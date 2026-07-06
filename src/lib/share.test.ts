import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareFile } from './share';

const blob = new Blob(['x'], { type: 'image/png' });

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error test cleanup
  delete navigator.share;
  // @ts-expect-error test cleanup
  delete navigator.canShare;
});

describe('shareFile', () => {
  it('returns false when the API is missing (caller downloads)', async () => {
    expect(await shareFile(blob, 'a.png')).toBe(false);
  });

  it('returns false when canShare rejects files', async () => {
    Object.assign(navigator, {
      share: vi.fn(),
      canShare: () => false,
    });
    expect(await shareFile(blob, 'a.png')).toBe(false);
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it('shares and returns true', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    expect(await shareFile(blob, 'a.png')).toBe(true);
    expect(share).toHaveBeenCalledOnce();
    const arg = share.mock.calls[0][0];
    expect(arg.files[0].name).toBe('a.png');
  });

  it('treats a user-dismissed sheet (AbortError) as handled — no download dump', async () => {
    Object.assign(navigator, {
      share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')),
      canShare: () => true,
    });
    expect(await shareFile(blob, 'a.png')).toBe(true);
  });

  it('falls back on real share failures', async () => {
    Object.assign(navigator, {
      share: vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError')),
      canShare: () => true,
    });
    expect(await shareFile(blob, 'a.png')).toBe(false);
  });
});
