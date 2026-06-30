import { describe, it, expect } from 'vitest';
import { smoothPoint } from './stabilizer';

describe('smoothPoint', () => {
  it('returns the raw point when there is no previous point', () => {
    expect(smoothPoint({ x: 10, y: 20 }, null, 0.5)).toEqual({ x: 10, y: 20 });
  });

  it('pulls the point toward the previous one by the given strength', () => {
    // strength 0.5 → halfway between prev (0,0) and raw (10,20).
    expect(smoothPoint({ x: 10, y: 20 }, { x: 0, y: 0 }, 0.5)).toEqual({ x: 5, y: 10 });
  });

  it('strength 0 leaves the raw point unchanged', () => {
    expect(smoothPoint({ x: 10, y: 20 }, { x: 0, y: 0 }, 0)).toEqual({ x: 10, y: 20 });
  });

  it('clamps strength into [0,1)', () => {
    // strength >= 1 would freeze the cursor; it is clamped below 1 so the pen
    // always moves toward the target.
    const out = smoothPoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 5);
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(10);
  });
});
