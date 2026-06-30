import { describe, it, expect } from 'vitest';
import { duplicateStrokes, recolorStrokes } from '../lib/selectionOps';
import type { Stroke } from '../types';

function stroke(id: string, color = '#fff'): Stroke {
  return {
    id,
    color,
    size: 4,
    points: [
      { x: 10, y: 10, pressure: 0.5, t: 0 },
      { x: 20, y: 30, pressure: 0.5, t: 1 },
    ],
  };
}

describe('duplicateStrokes', () => {
  it('clones selected strokes with new ids, offset by (dx,dy)', () => {
    const all = [stroke('a'), stroke('b'), stroke('c')];
    const { next, newIds } = duplicateStrokes(all, new Set(['a', 'c']), 16, 16);
    expect(next).toHaveLength(5); // 3 originals + 2 clones
    expect(newIds.size).toBe(2);
    const clones = next.filter((s) => newIds.has(s.id));
    expect(clones.every((s) => s.id !== 'a' && s.id !== 'c')).toBe(true);
    const cloneOfA = clones[0];
    expect(cloneOfA.points[0].x).toBe(26);
    expect(cloneOfA.points[0].y).toBe(26);
    expect(next.find((s) => s.id === 'a')!.points[0].x).toBe(10);
  });

  it('returns the list unchanged when nothing is selected', () => {
    const all = [stroke('a')];
    const { next, newIds } = duplicateStrokes(all, new Set(), 16, 16);
    expect(next).toBe(all);
    expect(newIds.size).toBe(0);
  });
});

describe('recolorStrokes', () => {
  it('sets color on selected strokes only', () => {
    const all = [stroke('a', '#fff'), stroke('b', '#fff')];
    const next = recolorStrokes(all, new Set(['b']), '#ef4444');
    expect(next.find((s) => s.id === 'a')!.color).toBe('#fff');
    expect(next.find((s) => s.id === 'b')!.color).toBe('#ef4444');
  });

  it('returns the same array reference when nothing is selected', () => {
    const all = [stroke('a')];
    expect(recolorStrokes(all, new Set(), '#000')).toBe(all);
  });
});
