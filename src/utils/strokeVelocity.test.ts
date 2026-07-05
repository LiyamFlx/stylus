import { describe, it, expect } from 'vitest';
import {
  pointVelocity,
  smoothVelocity,
  brakingIntensity,
  VELOCITY_THRESHOLDS,
} from './strokeVelocity';
import type { InkPoint } from '../types';

function pt(x: number, y: number, t: number): InkPoint {
  return { x, y, t, pressure: 0.5, width: 4, opacity: 1 };
}

describe('pointVelocity', () => {
  it('is distance / dt in world-units per ms', () => {
    // 3-4-5 triangle → distance 5 over 10ms → 0.5 u/ms.
    expect(pointVelocity(pt(0, 0, 0), pt(3, 4, 10))).toBeCloseTo(0.5);
  });

  it('returns 0 for non-positive dt (duplicate / out-of-order samples)', () => {
    expect(pointVelocity(pt(0, 0, 5), pt(3, 4, 5))).toBe(0);
    expect(pointVelocity(pt(0, 0, 10), pt(3, 4, 5))).toBe(0);
  });
});

describe('smoothVelocity', () => {
  it('seeds with the raw value when there is no prior', () => {
    expect(smoothVelocity(1.2, null)).toBe(1.2);
  });

  it('is an EMA between raw and previous', () => {
    // alpha 0.3: 0.3*2 + 0.7*1 = 1.3
    expect(smoothVelocity(2, 1, 0.3)).toBeCloseTo(1.3);
  });
});

describe('brakingIntensity', () => {
  const { comfortable, tooFast } = VELOCITY_THRESHOLDS;

  it('is 0 at or below the comfortable threshold', () => {
    expect(brakingIntensity(0)).toBe(0);
    expect(brakingIntensity(comfortable)).toBe(0);
  });

  it('is 1 at or above the too-fast threshold', () => {
    expect(brakingIntensity(tooFast)).toBe(1);
    expect(brakingIntensity(tooFast + 5)).toBe(1);
  });

  it('ramps linearly between the thresholds', () => {
    const mid = (comfortable + tooFast) / 2;
    expect(brakingIntensity(mid)).toBeCloseTo(0.5);
  });
});
