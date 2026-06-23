import { describe, it, expect } from 'vitest';
import {
  distanceToSegment,
  eraserRadius,
  hitsStroke,
  inkBounds,
  MIN_STROKE_WIDTH,
} from './geometry';
import { stroke } from '../test/fixtures';

describe('distanceToSegment', () => {
  it('returns the perpendicular distance when the foot lands inside the segment', () => {
    // Segment along the x-axis from (0,0) to (10,0); point directly above (5,0).
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
  });

  it('clamps to endpoint A when the projection falls before the segment', () => {
    expect(distanceToSegment(-4, 0, 0, 0, 10, 0)).toBe(4);
  });

  it('clamps to endpoint B when the projection falls past the segment', () => {
    expect(distanceToSegment(13, 0, 0, 0, 10, 0)).toBe(3);
  });

  it('treats a zero-length segment as distance to that single point', () => {
    // A == B; degenerate segment must not divide by zero.
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('is zero for a point lying on the segment', () => {
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
  });
});

describe('eraserRadius', () => {
  it('scales with size (3x) above the floor', () => {
    expect(eraserRadius(8)).toBe(24);
  });

  it('applies a usable floor of 12 for small sizes', () => {
    expect(eraserRadius(2)).toBe(12);
    expect(eraserRadius(4)).toBe(12);
  });
});

describe('hitsStroke', () => {
  it('returns false for an empty stroke', () => {
    expect(hitsStroke(stroke([]), 0, 0, 12)).toBe(false);
  });

  it('hit-tests a single-point stroke as a dot within threshold', () => {
    const dot = stroke([[10, 10]], { size: 4 }); // threshold = radius + 2
    expect(hitsStroke(dot, 10, 10, 0)).toBe(true); // exactly on the point
    expect(hitsStroke(dot, 12, 10, 0)).toBe(true); // 2px away == threshold
    expect(hitsStroke(dot, 13, 10, 0)).toBe(false); // 3px away > threshold
  });

  it('detects a hit on a multi-segment stroke', () => {
    const line = stroke([
      [0, 0],
      [10, 0],
      [20, 0],
    ], { size: 0 }); // threshold == radius for easy reasoning
    expect(hitsStroke(line, 15, 2, 3)).toBe(true); // 2px from the second segment
  });

  it('returns false when the eraser misses every segment', () => {
    const line = stroke([
      [0, 0],
      [10, 0],
    ], { size: 0 });
    expect(hitsStroke(line, 5, 20, 3)).toBe(false);
  });

  it('factors the stroke half-width into the hit threshold', () => {
    // size 8 → half-width 4; with radius 1 a point 4.5px away still hits.
    const line = stroke([
      [0, 0],
      [10, 0],
    ], { size: 8 });
    expect(hitsStroke(line, 5, 4.5, 1)).toBe(true);
    expect(hitsStroke(line, 5, 6, 1)).toBe(false); // 6 > 4 + 1
  });
});

describe('inkBounds', () => {
  it('returns null for no strokes', () => {
    expect(inkBounds([])).toBeNull();
  });

  it('returns null for strokes that contain no points', () => {
    expect(inkBounds([stroke([])])).toBeNull();
  });

  it('pads the bounding box by half the stroke width', () => {
    // size 10 > MIN_STROKE_WIDTH, so half = 5 on every side.
    const s = stroke([[100, 100]], { size: 10 });
    expect(inkBounds([s])).toEqual({
      minX: 95,
      minY: 95,
      maxX: 105,
      maxY: 105,
    });
  });

  it('uses MIN_STROKE_WIDTH as the padding floor for thin strokes', () => {
    const half = MIN_STROKE_WIDTH / 2; // 3
    const s = stroke([[50, 50]], { size: 1 });
    expect(inkBounds([s])).toEqual({
      minX: 50 - half,
      minY: 50 - half,
      maxX: 50 + half,
      maxY: 50 + half,
    });
  });

  it('spans the union of all points across all strokes', () => {
    // size 6 == MIN_STROKE_WIDTH, so every point is padded by half == 3.
    const a = stroke([[0, 0]], { size: 6 });
    const b = stroke([[40, 20]], { size: 6 });
    expect(inkBounds([a, b])).toEqual({
      minX: -3,
      minY: -3,
      maxX: 43,
      maxY: 23,
    });
  });
});
