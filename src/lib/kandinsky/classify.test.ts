import { describe, it, expect } from 'vitest';
import { classifyShape } from './classify';
import type { InkPoint } from '../../types';

function pt(x: number, y: number): InkPoint {
  return { x, y, pressure: 0.5, t: 0 };
}

// Sample a closed polygon's edges into many points (like a real stroke).
function polygon(corners: [number, number][], perEdge = 8): InkPoint[] {
  const pts: InkPoint[] = [];
  const all = [...corners, corners[0]]; // close it
  for (let i = 0; i < all.length - 1; i++) {
    const [x1, y1] = all[i];
    const [x2, y2] = all[i + 1];
    for (let s = 0; s < perEdge; s++) {
      const f = s / perEdge;
      pts.push(pt(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f));
    }
  }
  pts.push(pt(all[0][0], all[0][1]));
  return pts;
}

function circle(cx: number, cy: number, r: number, n = 40): InkPoint[] {
  const pts: InkPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

describe('classifyShape', () => {
  it('classifies a straight diagonal as a line', () => {
    const pts: InkPoint[] = [];
    for (let i = 0; i <= 40; i++) pts.push(pt(i * 5, i * 5));
    expect(classifyShape(pts).type).toBe('line');
  });

  it('classifies a round closed loop as a circle', () => {
    expect(classifyShape(circle(200, 200, 80)).type).toBe('circle');
  });

  it('classifies a 3-corner closed loop as a triangle', () => {
    const tri = polygon([[100, 300], [300, 300], [200, 100]]);
    expect(classifyShape(tri).type).toBe('triangle');
  });

  it('classifies a 4-corner closed loop as a square', () => {
    const sq = polygon([[100, 100], [300, 100], [300, 300], [100, 300]]);
    expect(classifyShape(sq).type).toBe('square');
  });

  it('reports minX and centerY from the bounding geometry', () => {
    const sq = polygon([[100, 100], [300, 100], [300, 300], [100, 300]]);
    const r = classifyShape(sq);
    expect(r.minX).toBeCloseTo(100, 0);
    expect(r.centerY).toBeGreaterThan(150);
    expect(r.centerY).toBeLessThan(250);
  });

  it('treats <3 points as a line without throwing', () => {
    expect(classifyShape([pt(0, 0)]).type).toBe('line');
    expect(classifyShape([]).type).toBe('line');
  });
});
