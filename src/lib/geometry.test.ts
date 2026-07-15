import { describe, it, expect } from 'vitest';
import {
  applyMoveOffsetToShapes,
  applyRotateOffset,
  applyRotateOffsetToShapes,
  applyScaleOffset,
  applyScaleOffsetToShapes,
  clampScale,
  combinedBounds,
  distanceToSegment,
  eraserRadius,
  hitsSelectionHandle,
  hitsStroke,
  A4_BOUNDS,
  boundsIntersect,
  clampPanToBounds,
  pinchDelta,
  inkBounds,
  MAX_SCALE,
  mergeBounds,
  MIN_SCALE,
  MIN_STROKE_WIDTH,
  pointInPolygon,
  ROTATE_HANDLE_OFFSET,
  screenToWorld,
  shapeBounds,
  shapeInLasso,
  shapesBounds,
  snapShapeEndpoint,
  splitStrokeAtErase,
  strokeBounds,
  strokeInLasso,
  textBounds,
  textItemBounds,
  worldToScreen,
} from './geometry';
import { stroke } from '../test/fixtures';
import type { Shape } from '../types';

function shape(over: Partial<Shape> = {}): Shape {
  return {
    id: 'test-shape',
    type: 'rect',
    color: '#fafafa',
    size: 4,
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 50,
    ...over,
  };
}

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

describe('splitStrokeAtErase', () => {
  it('returns null for an empty stroke', () => {
    expect(splitStrokeAtErase(stroke([]), 0, 0, 12)).toBeNull();
  });

  it('returns null when the eraser misses entirely', () => {
    const line = stroke([[0, 0], [10, 0], [20, 0]], { size: 0 });
    expect(splitStrokeAtErase(line, 5, 20, 3)).toBeNull();
  });

  it('erases a single-point stroke fully within threshold', () => {
    const dot = stroke([[10, 10]], { size: 4 });
    expect(splitStrokeAtErase(dot, 10, 10, 0)).toEqual([]);
    expect(splitStrokeAtErase(dot, 13, 10, 0)).toBeNull();
  });

  it('splits a straight stroke into two fragments at a middle contact point', () => {
    const line = stroke(
      [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]],
      { size: 0 },
    );
    // Eraser centered on the middle point (20,0), radius 0 → only that point erased.
    const fragments = splitStrokeAtErase(line, 20, 0, 0);
    expect(fragments).not.toBeNull();
    expect(fragments).toHaveLength(2);
    expect(fragments![0].map((p) => p.x)).toEqual([0, 10]);
    expect(fragments![1].map((p) => p.x)).toEqual([30, 40]);
  });

  it('drops leftover single-point fragments (not independently drawable)', () => {
    const line = stroke([[0, 0], [10, 0], [20, 0]], { size: 0 });
    // Erase the middle point only; both remaining runs have length 1, so
    // neither survives as a fragment.
    const fragments = splitStrokeAtErase(line, 10, 0, 0);
    expect(fragments).toEqual([]);
  });

  it('erases the whole stroke when every point is within threshold', () => {
    const line = stroke([[0, 0], [1, 0], [2, 0]], { size: 0 });
    expect(splitStrokeAtErase(line, 1, 0, 5)).toEqual([]);
  });

  it('cuts a segment the eraser crosses even if both endpoints survive', () => {
    // Eraser passes through the midpoint of a long segment without touching
    // either endpoint — a fast stroke can "hop over" a point.
    const line = stroke([[0, 0], [100, 0]], { size: 0 });
    const fragments = splitStrokeAtErase(line, 50, 0, 3);
    expect(fragments).toEqual([]); // both endpoints alone, each length 1 → dropped
  });

  it('leaves an untouched stroke unchanged (no split)', () => {
    const line = stroke([[0, 0], [10, 0], [20, 0]], { size: 0 });
    expect(splitStrokeAtErase(line, 500, 500, 3)).toBeNull();
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

describe('mergeBounds', () => {
  it('returns the smallest rect containing both inputs', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 5, minY: -5, maxX: 20, maxY: 8 };
    expect(mergeBounds(a, b)).toEqual({ minX: 0, minY: -5, maxX: 20, maxY: 10 });
  });
});

const textItem = (overrides: Partial<Parameters<typeof textItemBounds>[0]> = {}) => ({
  id: 't',
  x: 0,
  y: 0,
  text: 'hi',
  color: '#fff',
  size: 20,
  ...overrides,
});

describe('textItemBounds', () => {
  it('grows width with the longest line and height with line count', () => {
    const one = textItemBounds(textItem({ text: 'hi' }));
    const longer = textItemBounds(textItem({ text: 'hello there' }));
    expect(longer.maxX - longer.minX).toBeGreaterThan(one.maxX - one.minX);

    const twoLines = textItemBounds(textItem({ text: 'hi\nthere' }));
    expect(twoLines.maxY - twoLines.minY).toBeGreaterThan(one.maxY - one.minY);
  });

  it('is anchored at the item\'s x/y', () => {
    const b = textItemBounds(textItem({ x: 50, y: 30 }));
    expect(b.minX).toBe(50);
    expect(b.minY).toBe(30);
  });
});

describe('textBounds', () => {
  it('returns null for no items', () => {
    expect(textBounds([])).toBeNull();
  });

  it('spans the union of all items', () => {
    const a = textItem({ x: 0, y: 0, text: 'a' });
    const b = textItem({ x: 100, y: 100, text: 'b' });
    const bounds = textBounds([a, b]);
    expect(bounds?.minX).toBe(0);
    expect(bounds?.minY).toBe(0);
    expect(bounds!.maxX).toBeGreaterThan(100);
    expect(bounds!.maxY).toBeGreaterThan(100);
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

// ─── strokeBounds / boundsIntersect (Phase 0 — culling primitives) ───────────

describe('strokeBounds', () => {
  it('returns null for a pointless stroke', () => {
    expect(strokeBounds(stroke([]))).toBeNull();
  });

  it('pads by half the stroke width, floored at MIN_STROKE_WIDTH', () => {
    const s = stroke([[10, 10], [20, 10]], { size: 10 });
    expect(strokeBounds(s)).toEqual({ minX: 5, minY: 5, maxX: 25, maxY: 15 });
  });

  it('agrees with inkBounds for a single stroke', () => {
    const s = stroke([[0, 0], [30, 40]], { size: 8 });
    expect(strokeBounds(s)).toEqual(inkBounds([s]));
  });
});

describe('boundsIntersect', () => {
  const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('detects overlap and containment', () => {
    expect(boundsIntersect(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
    expect(boundsIntersect(a, { minX: 2, minY: 2, maxX: 4, maxY: 4 })).toBe(true);
    expect(boundsIntersect({ minX: 2, minY: 2, maxX: 4, maxY: 4 }, a)).toBe(true);
  });

  it('counts touching edges as intersecting (edge-of-viewport strokes must draw)', () => {
    expect(boundsIntersect(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(true);
  });

  it('rejects disjoint rects on each axis', () => {
    expect(boundsIntersect(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
    expect(boundsIntersect(a, { minX: 0, minY: 11, maxX: 10, maxY: 20 })).toBe(false);
  });
});

// ─── clampPanToBounds (Phase 1 — notebook fixed-page pan) ────────────────────

describe('clampPanToBounds', () => {
  const vp = { w: 800, h: 600 };

  it('returns the same object when no clamping is needed', () => {
    const view = { scale: 1, panX: 0, panY: 0 };
    expect(clampPanToBounds(view, A4_BOUNDS, vp.w, vp.h)).toBe(view);
  });

  it('clamps a pan that pushes the page fully off the right edge', () => {
    // panX far negative → page drifts right out of view.
    const view = { scale: 1, panX: -10_000, panY: 0 };
    const out = clampPanToBounds(view, A4_BOUNDS, vp.w, vp.h);
    // Left page edge on screen: (minX - panX) * scale ≤ vp.w - 48.
    expect((A4_BOUNDS.minX - out.panX) * out.scale).toBeLessThanOrEqual(vp.w - 48);
  });

  it('clamps a pan that pushes the page fully off the left edge', () => {
    const view = { scale: 1, panX: 10_000, panY: 0 };
    const out = clampPanToBounds(view, A4_BOUNDS, vp.w, vp.h);
    // Right page edge on screen: (maxX - panX) * scale ≥ 48.
    expect((A4_BOUNDS.maxX - out.panX) * out.scale).toBeGreaterThanOrEqual(48);
  });

  it('clamps vertically the same way', () => {
    const out = clampPanToBounds({ scale: 1, panX: 0, panY: 10_000 }, A4_BOUNDS, vp.w, vp.h);
    expect((A4_BOUNDS.maxY - out.panY) * out.scale).toBeGreaterThanOrEqual(48);
  });

  it('respects zoom: at 2x the same world pan maps differently', () => {
    const out = clampPanToBounds({ scale: 2, panX: 10_000, panY: 0 }, A4_BOUNDS, vp.w, vp.h);
    expect((A4_BOUNDS.maxX - out.panX) * 2).toBeGreaterThanOrEqual(48);
  });

  it('never returns NaN for a degenerate window (extreme zoom-out)', () => {
    const out = clampPanToBounds({ scale: 0.01, panX: 0, panY: 0 }, A4_BOUNDS, vp.w, vp.h);
    expect(Number.isFinite(out.panX)).toBe(true);
    expect(Number.isFinite(out.panY)).toBe(true);
  });
});

// ─── clampScale range + pinchDelta (Phase 3 item 2) ──────────────────────────

describe('clampScale with an explicit range', () => {
  it('defaults preserve legacy bounds', () => {
    expect(clampScale(100)).toBeLessThanOrEqual(4);
    expect(clampScale(0.0001)).toBeGreaterThan(0.01);
  });
  it('a mode range widens or narrows the clamp', () => {
    expect(clampScale(6, { min: 0.1, max: 8 })).toBe(6);
    expect(clampScale(6, { min: 0.5, max: 4 })).toBe(4);
    expect(clampScale(0.2, { min: 0.1, max: 8 })).toBe(0.2);
  });
});

describe('pinchDelta', () => {
  it('spreading fingers doubles the factor', () => {
    const prev = { ax: 100, ay: 100, bx: 200, by: 100 };
    const next = { ax: 50, ay: 100, bx: 250, by: 100 };
    const d = pinchDelta(prev, next);
    expect(d.factor).toBeCloseTo(2);
    expect(d.midX).toBe(150); // midpoint unchanged
    expect(d.panDx).toBe(0);
  });

  it('a parallel two-finger drag is pure pan (factor 1)', () => {
    const prev = { ax: 100, ay: 100, bx: 200, by: 100 };
    const next = { ax: 130, ay: 140, bx: 230, by: 140 };
    const d = pinchDelta(prev, next);
    expect(d.factor).toBeCloseTo(1);
    expect(d.panDx).toBe(30);
    expect(d.panDy).toBe(40);
  });

  it('degenerate zero-distance previous sample yields factor 1, not NaN', () => {
    const prev = { ax: 100, ay: 100, bx: 100, by: 100 };
    const next = { ax: 90, ay: 100, bx: 110, by: 100 };
    expect(pinchDelta(prev, next).factor).toBe(1);
  });
});

describe('hitsSelectionHandle', () => {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it('detects each corner handle at its padded position', () => {
    // pad defaults to 8, matching drawSelectionRect's default.
    expect(hitsSelectionHandle(bounds, -8, -8)).toBe('nw');
    expect(hitsSelectionHandle(bounds, 108, -8)).toBe('ne');
    expect(hitsSelectionHandle(bounds, -8, 108)).toBe('sw');
    expect(hitsSelectionHandle(bounds, 108, 108)).toBe('se');
  });

  it('detects the rotate handle above top-center, offset by ROTATE_HANDLE_OFFSET', () => {
    const centerX = 50;
    const rotateY = -8 - ROTATE_HANDLE_OFFSET;
    expect(hitsSelectionHandle(bounds, centerX, rotateY)).toBe('rotate');
  });

  it('returns null well inside the body (not a handle)', () => {
    expect(hitsSelectionHandle(bounds, 50, 50)).toBeNull();
  });

  it('returns null well outside every handle', () => {
    expect(hitsSelectionHandle(bounds, 500, 500)).toBeNull();
  });

  it('respects a custom pad', () => {
    expect(hitsSelectionHandle(bounds, -20, -20, 20)).toBe('nw');
    // With the default pad (8) that same point is nowhere near the nw handle.
    expect(hitsSelectionHandle(bounds, -20, -20, 8)).toBeNull();
  });
});

describe('applyScaleOffset', () => {
  it('scales points away from the pivot by the given factor', () => {
    const s = stroke([[10, 10], [20, 20]], { id: 'a', size: 4 });
    const ids = new Set(['a']);
    const scaled = applyScaleOffset([s], ids, 0, 0, 2);
    expect(scaled[0].points[0]).toMatchObject({ x: 20, y: 20 });
    expect(scaled[0].points[1]).toMatchObject({ x: 40, y: 40 });
  });

  it('leaves a point exactly at the pivot unchanged regardless of scale', () => {
    const s = stroke([[5, 5]], { id: 'a' });
    const scaled = applyScaleOffset([s], new Set(['a']), 5, 5, 3);
    expect(scaled[0].points[0]).toMatchObject({ x: 5, y: 5 });
  });

  it('scales the stroke size and per-point width proportionally', () => {
    const s = stroke([[10, 0]], { id: 'a', size: 4 });
    s.points[0].width = 6;
    const scaled = applyScaleOffset([s], new Set(['a']), 0, 0, 2);
    expect(scaled[0].size).toBe(8);
    expect(scaled[0].points[0].width).toBe(12);
  });

  it('leaves an undefined point width undefined (no NaN-ing a legacy point)', () => {
    const s = stroke([[10, 0]], { id: 'a', size: 4 });
    const scaled = applyScaleOffset([s], new Set(['a']), 0, 0, 2);
    expect(scaled[0].points[0].width).toBeUndefined();
  });

  it('does not touch strokes outside the id set', () => {
    const a = stroke([[10, 10]], { id: 'a' });
    const b = stroke([[20, 20]], { id: 'b' });
    const scaled = applyScaleOffset([a, b], new Set(['a']), 0, 0, 2);
    expect(scaled[1]).toBe(b); // same reference — untouched
  });
});

describe('applyRotateOffset', () => {
  it('rotates a point 90° (π/2) around the pivot', () => {
    // (10, 0) rotated +90° around the origin lands at (0, 10) under this
    // function's convention (dx*cos - dy*sin, dx*sin + dy*cos).
    const s = stroke([[10, 0]], { id: 'a' });
    const rotated = applyRotateOffset([s], new Set(['a']), 0, 0, Math.PI / 2);
    expect(rotated[0].points[0].x).toBeCloseTo(0);
    expect(rotated[0].points[0].y).toBeCloseTo(10);
  });

  it('a full 2π rotation returns points to (approximately) their start', () => {
    const s = stroke([[10, 5]], { id: 'a' });
    const rotated = applyRotateOffset([s], new Set(['a']), 0, 0, Math.PI * 2);
    expect(rotated[0].points[0].x).toBeCloseTo(10);
    expect(rotated[0].points[0].y).toBeCloseTo(5);
  });

  it('leaves a point exactly at the pivot unchanged regardless of angle', () => {
    const s = stroke([[3, 3]], { id: 'a' });
    const rotated = applyRotateOffset([s], new Set(['a']), 3, 3, Math.PI / 3);
    expect(rotated[0].points[0].x).toBeCloseTo(3);
    expect(rotated[0].points[0].y).toBeCloseTo(3);
  });

  it('does not change stroke size or point width — rotation is not scale', () => {
    const s = stroke([[10, 0]], { id: 'a', size: 4 });
    s.points[0].width = 6;
    const rotated = applyRotateOffset([s], new Set(['a']), 0, 0, Math.PI / 4);
    expect(rotated[0].size).toBe(4);
    expect(rotated[0].points[0].width).toBe(6);
  });

  it('does not touch strokes outside the id set', () => {
    const a = stroke([[10, 10]], { id: 'a' });
    const b = stroke([[20, 20]], { id: 'b' });
    const rotated = applyRotateOffset([a, b], new Set(['a']), 0, 0, Math.PI);
    expect(rotated[1]).toBe(b);
  });
});

describe('shapeBounds', () => {
  it('normalizes unordered corners (dragged up-and-left) into a min/max box', () => {
    const s = shape({ x1: 100, y1: 50, x2: 0, y2: 0, size: 4 });
    const b = shapeBounds(s);
    expect(b.minX).toBeLessThan(b.maxX);
    expect(b.minY).toBeLessThan(b.maxY);
  });

  it('pads by half the (floor-clamped) stroke width', () => {
    const s = shape({ x1: 0, y1: 0, x2: 100, y2: 50, size: 20 });
    const b = shapeBounds(s);
    expect(b.minX).toBe(-10);
    expect(b.maxX).toBe(110);
  });

  it('is unaffected by rotation: 0 (the common case, verified explicitly)', () => {
    const s = shape({ rotation: 0 });
    const b = shapeBounds(s);
    expect(b).toEqual(shapeBounds({ ...s, rotation: undefined }));
  });

  it('a 90° rotated wide rect has a taller, narrower AABB than unrotated', () => {
    const wide = shape({ x1: 0, y1: 0, x2: 100, y2: 20, size: 0 });
    const unrotated = shapeBounds(wide);
    const rotated = shapeBounds({ ...wide, rotation: Math.PI / 2 });
    // Rotating 90° swaps effective width/height around the center.
    expect(rotated.maxX - rotated.minX).toBeCloseTo(unrotated.maxY - unrotated.minY, 5);
    expect(rotated.maxY - rotated.minY).toBeCloseTo(unrotated.maxX - unrotated.minX, 5);
  });
});

describe('shapesBounds', () => {
  it('returns null for an empty array', () => {
    expect(shapesBounds([])).toBeNull();
  });

  it('unions multiple shapes', () => {
    // size 0 still pads by MIN_STROKE_WIDTH / 2 = 3, same floor strokeBounds
    // applies — the union is the outer 3px-padded box of both shapes.
    const a = shape({ id: 'a', x1: 0, y1: 0, x2: 10, y2: 10, size: 0 });
    const b = shape({ id: 'b', x1: 90, y1: 90, x2: 100, y2: 100, size: 0 });
    const bounds = shapesBounds([a, b]);
    expect(bounds).toEqual({ minX: -3, minY: -3, maxX: 103, maxY: 103 });
  });
});

describe('combinedBounds', () => {
  it('unions stroke and shape bounds', () => {
    const s = stroke([[0, 0]], { size: 0 });
    const sh = shape({ x1: 90, y1: 90, x2: 100, y2: 100, size: 0 });
    const b = combinedBounds([s], [sh]);
    expect(b!.maxX).toBeGreaterThanOrEqual(100);
    expect(b!.minX).toBeLessThanOrEqual(0);
  });

  it('returns just the stroke bounds when there are no shapes', () => {
    const s = stroke([[5, 5]], { size: 0 });
    expect(combinedBounds([s], [])).toEqual(inkBounds([s]));
  });

  it('returns just the shape bounds when there are no strokes', () => {
    const sh = shape();
    expect(combinedBounds([], [sh])).toEqual(shapesBounds([sh]));
  });

  it('returns null when both are empty', () => {
    expect(combinedBounds([], [])).toBeNull();
  });
});

describe('shapeInLasso', () => {
  it('hits when a shape corner is inside the lasso', () => {
    const s = shape({ x1: 0, y1: 0, x2: 10, y2: 10, size: 0 });
    const lasso = [
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5, y: 5 },
      { x: -5, y: 5 },
    ];
    expect(shapeInLasso(s, lasso)).toBe(true);
  });

  it('hits when the lasso is drawn entirely inside a large shape', () => {
    const big = shape({ x1: 0, y1: 0, x2: 1000, y2: 1000, size: 0 });
    const tinyLassoInsideIt = [
      { x: 400, y: 400 },
      { x: 410, y: 400 },
      { x: 410, y: 410 },
      { x: 400, y: 410 },
    ];
    expect(shapeInLasso(big, tinyLassoInsideIt)).toBe(true);
  });

  it('misses when the lasso is nowhere near the shape', () => {
    const s = shape({ x1: 0, y1: 0, x2: 10, y2: 10, size: 0 });
    const farLasso = [
      { x: 500, y: 500 },
      { x: 510, y: 500 },
      { x: 510, y: 510 },
    ];
    expect(shapeInLasso(s, farLasso)).toBe(false);
  });

  it('requires at least 3 lasso points', () => {
    const s = shape();
    expect(shapeInLasso(s, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe('applyMoveOffsetToShapes', () => {
  it('translates both corners of selected shapes', () => {
    const s = shape({ id: 'a', x1: 0, y1: 0, x2: 10, y2: 10 });
    const moved = applyMoveOffsetToShapes([s], new Set(['a']), 5, -3);
    expect(moved[0]).toMatchObject({ x1: 5, y1: -3, x2: 15, y2: 7 });
  });

  it('does not touch shapes outside the id set', () => {
    const a = shape({ id: 'a' });
    const b = shape({ id: 'b' });
    const moved = applyMoveOffsetToShapes([a, b], new Set(['a']), 1, 1);
    expect(moved[1]).toBe(b);
  });
});

describe('applyScaleOffsetToShapes', () => {
  it('scales both corners away from the pivot', () => {
    const s = shape({ id: 'a', x1: 10, y1: 10, x2: 20, y2: 20, size: 4 });
    const scaled = applyScaleOffsetToShapes([s], new Set(['a']), 0, 0, 2);
    expect(scaled[0]).toMatchObject({ x1: 20, y1: 20, x2: 40, y2: 40, size: 8 });
  });
});

describe('applyRotateOffsetToShapes', () => {
  it('rotates a line/arrow endpoint-to-endpoint about the pivot, leaving rotation unset', () => {
    const line = shape({ id: 'a', type: 'line', x1: 10, y1: 0, x2: 20, y2: 0 });
    const rotated = applyRotateOffsetToShapes([line], new Set(['a']), 0, 0, Math.PI / 2);
    expect(rotated[0].x1).toBeCloseTo(0);
    expect(rotated[0].y1).toBeCloseTo(10);
    expect(rotated[0].rotation ?? 0).toBe(0);
  });

  it('rect/ellipse: relocates the center about the pivot, keeps the box UNROTATED, and only increments `rotation`', () => {
    // A 10x10 rect centered at (5,5), selection pivot at the origin.
    const rect = shape({ id: 'a', type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 });
    const rotated = applyRotateOffsetToShapes([rect], new Set(['a']), 0, 0, Math.PI / 2);
    // Center (5,5) rotated 90° about the origin lands at (-5, 5).
    const newCx = (rotated[0].x1 + rotated[0].x2) / 2;
    const newCy = (rotated[0].y1 + rotated[0].y2) / 2;
    expect(newCx).toBeCloseTo(-5);
    expect(newCy).toBeCloseTo(5);
    // Width/height preserved — the box itself did not get skewed by the rotation.
    expect(rotated[0].x2 - rotated[0].x1).toBeCloseTo(10);
    expect(rotated[0].y2 - rotated[0].y1).toBeCloseTo(10);
    expect(rotated[0].rotation).toBeCloseTo(Math.PI / 2);
  });

  it('rotating a rect twice accumulates the rotation field, not double-transformed corners', () => {
    const rect = shape({ id: 'a', type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, rotation: Math.PI / 4 });
    const rotated = applyRotateOffsetToShapes([rect], new Set(['a']), 5, 5, Math.PI / 4);
    expect(rotated[0].rotation).toBeCloseTo(Math.PI / 2);
    // Rotating about its own center (5,5) — the box stays centered there.
    expect((rotated[0].x1 + rotated[0].x2) / 2).toBeCloseTo(5);
    expect((rotated[0].y1 + rotated[0].y2) / 2).toBeCloseTo(5);
  });

  it('does not touch shapes outside the id set', () => {
    const a = shape({ id: 'a' });
    const b = shape({ id: 'b' });
    const rotated = applyRotateOffsetToShapes([a, b], new Set(['a']), 0, 0, Math.PI);
    expect(rotated[1]).toBe(b);
  });
});

describe('snapShapeEndpoint', () => {
  it('returns the endpoint unchanged when shift is not held', () => {
    expect(snapShapeEndpoint('rect', 0, 0, 37, 12, false)).toEqual({ x: 37, y: 12 });
  });

  describe('line/arrow: snap angle to the nearest 45°', () => {
    it('snaps a near-horizontal drag to exactly horizontal', () => {
      const snapped = snapShapeEndpoint('line', 0, 0, 100, 8, true);
      expect(snapped.y).toBeCloseTo(0);
      expect(snapped.x).toBeGreaterThan(0);
    });

    it('snaps a near-45° drag to exactly 45°', () => {
      const snapped = snapShapeEndpoint('arrow', 0, 0, 90, 100, true);
      expect(snapped.x).toBeCloseTo(snapped.y, 1);
    });

    it('preserves the drawn distance, only changes the angle', () => {
      const dist = Math.hypot(100, 8);
      const snapped = snapShapeEndpoint('line', 0, 0, 100, 8, true);
      expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(dist);
    });

    it('a zero-length drag is left unchanged (nothing to snap)', () => {
      expect(snapShapeEndpoint('line', 5, 5, 5, 5, true)).toEqual({ x: 5, y: 5 });
    });

    it('respects a non-zero start point (snaps relative to x1/y1, not the origin)', () => {
      const snapped = snapShapeEndpoint('line', 50, 50, 150, 58, true);
      expect(snapped.y).toBeCloseTo(50);
    });
  });

  describe('rect/ellipse: snap to a square/circle', () => {
    it('forces the smaller axis to match the larger, preserving each axis sign', () => {
      const snapped = snapShapeEndpoint('rect', 0, 0, 100, 30, true);
      expect(Math.abs(snapped.x - 0)).toBeCloseTo(Math.abs(snapped.y - 0));
      expect(snapped.x).toBeGreaterThan(0); // dragged right, stays right
      expect(snapped.y).toBeGreaterThan(0); // dragged down, stays down (not flipped)
    });

    it('preserves a negative drag direction (dragged up-and-left)', () => {
      const snapped = snapShapeEndpoint('ellipse', 0, 0, -100, -30, true);
      expect(snapped.x).toBeLessThan(0);
      expect(snapped.y).toBeLessThan(0);
      expect(Math.abs(snapped.x)).toBeCloseTo(Math.abs(snapped.y));
    });

    it('uses the larger of the two axis magnitudes as the square side', () => {
      const snapped = snapShapeEndpoint('rect', 0, 0, 20, 80, true);
      expect(Math.abs(snapped.y)).toBeCloseTo(80);
      expect(Math.abs(snapped.x)).toBeCloseTo(80);
    });
  });
});
