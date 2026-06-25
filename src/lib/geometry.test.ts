import { describe, it, expect } from 'vitest';
import {
  clampScale,
  distanceToSegment,
  eraserRadius,
  hitsStroke,
  inkBounds,
  MAX_SCALE,
  MIN_SCALE,
  MIN_STROKE_WIDTH,
  pointInPolygon,
  screenToWorld,
  strokeInLasso,
  worldToScreen,
} from './geometry';
import { stroke } from '../test/fixtures';

describe('view transforms', () => {
  it('screenToWorld is the inverse of the world view at default', () => {
    expect(screenToWorld(100, 50, { scale: 1, panX: 0, panY: 0 })).toEqual({ x: 100, y: 50 });
  });

  it('screenToWorld accounts for pan and zoom', () => {
    // At scale 2 with pan (10, 20): world = screen/2 + pan.
    expect(screenToWorld(40, 60, { scale: 2, panX: 10, panY: 20 })).toEqual({ x: 30, y: 50 });
  });

  it('worldToScreen round-trips with screenToWorld', () => {
    const view = { scale: 1.5, panX: 12, panY: -8 };
    const w = screenToWorld(123, 456, view);
    const s = worldToScreen(w.x, w.y, view);
    expect(s.x).toBeCloseTo(123);
    expect(s.y).toBeCloseTo(456);
  });

  it('clampScale keeps scale within bounds', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });
});

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

// ─── pointInPolygon ──────────────────────────────────────────────────────────

describe('pointInPolygon', () => {
  // Simple axis-aligned square: (0,0)→(10,0)→(10,10)→(0,10)
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('returns true for a point clearly inside a convex polygon', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it('returns false for a point clearly outside', () => {
    expect(pointInPolygon(20, 20, square)).toBe(false);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
  });

  it('returns false for an empty path', () => {
    expect(pointInPolygon(0, 0, [])).toBe(false);
  });

  it('returns false for a degenerate 1-point path', () => {
    expect(pointInPolygon(0, 0, [{ x: 0, y: 0 }])).toBe(false);
  });

  it('returns false for a 2-point (line) path', () => {
    expect(pointInPolygon(0, 0, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(false);
  });

  it('works on a concave (L-shaped) polygon', () => {
    // L-shape: outer 10×10 square with 5×5 top-right corner removed.
    const lShape = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(2, 8, lShape)).toBe(true);   // inside the L
    expect(pointInPolygon(8, 2, lShape)).toBe(false);  // in the cut-out corner
  });

  it('correctly classifies a point at the centroid of a triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(pointInPolygon(5, 3, triangle)).toBe(true);
    expect(pointInPolygon(0, 5, triangle)).toBe(false);
  });
});

// ─── strokeInLasso ───────────────────────────────────────────────────────────

describe('strokeInLasso', () => {
  const box = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ];

  it('returns false when lasso has fewer than 3 points', () => {
    const s = stroke([[10, 10]]);
    expect(strokeInLasso(s, [])).toBe(false);
    expect(strokeInLasso(s, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(false);
  });

  it('returns true when at least one stroke point is inside the lasso', () => {
    const s = stroke([[10, 10], [50, 50]]); // second point is outside
    expect(strokeInLasso(s, box)).toBe(true);
  });

  it('returns false when all stroke points are outside the lasso', () => {
    const s = stroke([[30, 30], [40, 40]]);
    expect(strokeInLasso(s, box)).toBe(false);
  });

  it('returns false for an empty stroke', () => {
    expect(strokeInLasso(stroke([]), box)).toBe(false);
  });
});
