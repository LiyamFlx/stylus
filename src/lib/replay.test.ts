import { describe, it, expect } from 'vitest';
import { buildTimeline, frameAt, timelineLength } from './replay';
import type { Stroke } from '../types';

// Replay needs realistic per-point t (0,10,20…) and unique ids — build
// directly instead of using the shared fixture (which zeroes t).
let nextId = 0;
const s = (n: number, startedAt?: number): Stroke => ({
  id: `r${nextId++}`,
  color: '#fff',
  size: 4,
  ...(startedAt !== undefined ? { startedAt } : {}),
  points: Array.from({ length: n }, (_, i) => ({
    x: i * 5, y: 0, pressure: 0.5, t: i * 10,
  })),
});

describe('buildTimeline', () => {
  it('orders by startedAt and preserves (capped) gaps', () => {
    const a = s(11, 1_000);   // duration 100 -> ends at absolute 1_100
    const b = s(11, 1_400);   // 300ms gap after a
    const c = s(11, 60_000);  // huge pause -> capped
    const tl = buildTimeline([c, a, b]); // shuffled input
    expect(tl.map((e) => e.stroke.id)).toEqual([a.id, b.id, c.id]);
    expect(tl[0].start).toBe(0);
    expect(tl[1].start).toBe(100 + 300);
    expect(tl[2].start - (tl[1].start + tl[1].duration)).toBe(1_500); // MAX_GAP
  });

  it('legacy strokes (no startedAt) keep array order with synthetic gaps', () => {
    const a = s(11), b = s(11), c = s(11);
    const tl = buildTimeline([a, b, c]);
    expect(tl.map((e) => e.stroke.id)).toEqual([a.id, b.id, c.id]);
    expect(tl[1].start).toBe(tl[0].duration + 250);
  });

  it('floors degenerate durations', () => {
    const dot = s(1, 500); // single point, t=0
    expect(buildTimeline([dot])[0].duration).toBeGreaterThanOrEqual(120);
  });
});

describe('frameAt', () => {
  const a = s(11, 1_000);
  const b = s(11, 2_000);
  const tl = buildTimeline([a, b]);

  it('start: nothing drawn yet, first stroke partial with its first point', () => {
    const f = frameAt(tl, 0);
    expect(f.complete).toHaveLength(0);
    expect(f.partial?.points.length).toBe(1);
  });

  it('mid-first-stroke: partial grows point by point', () => {
    const f = frameAt(tl, 50);
    expect(f.complete).toHaveLength(0);
    expect(f.partial?.points.length).toBe(6); // t <= 50 -> 0,10..50
  });

  it('between strokes: first complete, nothing partial', () => {
    const f = frameAt(tl, tl[1].start - 1);
    expect(f.complete.map((x) => x.id)).toEqual([a.id]);
    expect(f.partial).toBeNull();
  });

  it('end: everything complete', () => {
    const f = frameAt(tl, timelineLength(tl));
    expect(f.complete).toHaveLength(2);
    expect(f.partial).toBeNull();
  });
});
