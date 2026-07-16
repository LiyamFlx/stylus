import { describe, it, expect } from 'vitest';
import { isShake, SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS } from './useShakeUndo';

describe('isShake (threshold + cooldown)', () => {
  it('fires only when acceleration passes the threshold', () => {
    expect(isShake(SHAKE_THRESHOLD - 1, 5000)).toBe(false);
    expect(isShake(SHAKE_THRESHOLD, 5000)).toBe(true);
    expect(isShake(SHAKE_THRESHOLD + 10, 5000)).toBe(true);
  });

  it('ignores a hard shake that lands inside the cooldown window', () => {
    expect(isShake(SHAKE_THRESHOLD + 10, SHAKE_COOLDOWN_MS - 1)).toBe(false);
    expect(isShake(SHAKE_THRESHOLD + 10, SHAKE_COOLDOWN_MS)).toBe(true);
  });

  it('a gentle wobble at rest (~gravity) never counts', () => {
    expect(isShake(9.8, 10000)).toBe(false);
  });
});
