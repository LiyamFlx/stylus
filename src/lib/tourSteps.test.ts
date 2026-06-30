import { describe, it, expect } from 'vitest';
import { TOUR_STEPS } from './tourSteps';

describe('TOUR_STEPS', () => {
  it('starts with a centered welcome and ends with a centered finish', () => {
    expect(TOUR_STEPS[0].target).toBeUndefined();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeUndefined();
  });

  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spotlight steps target the real data-tour hooks', () => {
    const targets = TOUR_STEPS.filter((s) => s.target).map((s) => s.target);
    expect(targets).toEqual(['pen', 'select', 'convert', 'menu']);
  });

  it('every step has non-empty title and body', () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });
});
