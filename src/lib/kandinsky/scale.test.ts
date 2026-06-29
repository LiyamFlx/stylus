import { describe, it, expect } from 'vitest';
import { pitchForY } from './scale';

describe('pitchForY', () => {
  it('maps the top of the canvas to the highest note', () => {
    expect(pitchForY(0, 600)).toBe('A5');
  });

  it('maps the bottom of the canvas to the lowest note', () => {
    expect(pitchForY(600, 600)).toBe('C3');
  });

  it('is monotonic: higher on screen (smaller Y) is never a lower note index', () => {
    const order = ['C3','D3','E3','G3','A3','C4','D4','E4','G4','A4','C5','D5','E5','G5','A5'];
    let prev = -1;
    for (let y = 600; y >= 0; y -= 20) {
      const idx = order.indexOf(pitchForY(y, 600));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it('clamps out-of-range Y and guards zero height', () => {
    expect(pitchForY(-50, 600)).toBe('A5');
    expect(pitchForY(9999, 600)).toBe('C3');
    expect(pitchForY(100, 0)).toBe('C3');
  });
});
