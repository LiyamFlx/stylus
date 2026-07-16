import { describe, it, expect } from 'vitest';
import { starsForCoverage } from './types';

describe('starsForCoverage (celebrate-only rating)', () => {
  it('gives 0 stars when nothing is painted (or there are no zones)', () => {
    expect(starsForCoverage(0, 6)).toBe(0);
    expect(starsForCoverage(0, 0)).toBe(0);
    // Defensive: no zones can never earn stars even if a count leaks through.
    expect(starsForCoverage(3, 0)).toBe(0);
  });

  it('gives 1 star for any paint at all', () => {
    expect(starsForCoverage(1, 6)).toBe(1);
    expect(starsForCoverage(3, 6)).toBe(1); // exactly 50%
  });

  it('treats EXACTLY 60% as still 1 star — the boundary is strict (> 60%)', () => {
    expect(starsForCoverage(6, 10)).toBe(1); // 60% exactly → not yet 2★
    expect(starsForCoverage(7, 10)).toBe(2); // 70% → 2★
  });

  it('gives 2 stars for more than 60% but not all zones', () => {
    expect(starsForCoverage(4, 6)).toBe(2); // 66%
    expect(starsForCoverage(5, 6)).toBe(2); // 83%
  });

  it('gives 3 stars only when every zone is coloured', () => {
    expect(starsForCoverage(6, 6)).toBe(3);
    // Clamp: an over-count still caps at 3, never higher.
    expect(starsForCoverage(9, 6)).toBe(3);
  });
});
