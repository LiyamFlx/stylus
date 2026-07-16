import { describe, it, expect } from 'vitest';
import type { Stroke, InkPoint } from '../../types';
import type { ColozooBrush } from '../penProfiles';
import { drawColozooStroke } from './drawStroke';

/** A 2D-context stand-in that records the operation stream so we can assert on
 *  what got drawn without a real canvas. */
function recordingCtx() {
  const ops: string[] = [];
  const strokeStyles: string[] = [];
  const points: Array<[number, number]> = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    globalAlpha: 1,
    fillStyle: '',
    set strokeStyle(v: string) {
      strokeStyles.push(v);
    },
    get strokeStyle() {
      return strokeStyles[strokeStyles.length - 1] ?? '';
    },
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    beginPath: () => ops.push('beginPath'),
    moveTo: (x: number, y: number) => {
      ops.push(`moveTo:${x.toFixed(3)},${y.toFixed(3)}`);
      points.push([x, y]);
    },
    lineTo: (x: number, y: number) => ops.push(`lineTo:${x.toFixed(3)},${y.toFixed(3)}`),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      ops.push(`q:${cx.toFixed(3)},${cy.toFixed(3)},${x.toFixed(3)},${y.toFixed(3)}`),
    arc: (x: number, y: number, r: number) => ops.push(`arc:${x.toFixed(3)},${y.toFixed(3)},${r.toFixed(3)}`),
    fill: () => ops.push('fill'),
    stroke: () => ops.push('stroke'),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, strokeStyles, points };
}

function stroke(brush: ColozooBrush, pts: Array<[number, number]>): Stroke {
  const points: InkPoint[] = pts.map(([x, y], i) => ({ x, y, pressure: 0.6, width: 10, opacity: 1, t: i }));
  return { id: 's', color: '#3B82F6', size: 3.5, penType: brush, points };
}

const LINE: Array<[number, number]> = [
  [10, 10],
  [25, 14],
  [40, 12],
  [55, 20],
  [70, 18],
];

describe('drawColozooStroke textures', () => {
  it('is deterministic — identical strokes produce identical op streams', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawColozooStroke(a.ctx, stroke('czChalk', LINE));
    drawColozooStroke(b.ctx, stroke('czChalk', LINE));
    expect(a.ops).toEqual(b.ops);
    expect(a.ops.length).toBeGreaterThan(0);
  });

  it('magic marker rotates hue along the stroke (strokeStyle varies per segment)', () => {
    const { ctx, strokeStyles } = recordingCtx();
    drawColozooStroke(ctx, stroke('czMagicMarker', LINE));
    const distinctColors = new Set(strokeStyles.filter((s) => s.startsWith('#')));
    expect(distinctColors.size).toBeGreaterThan(1);
  });

  it('paintbrush jitter perturbs the path but stays deterministic', () => {
    const jit = recordingCtx();
    drawColozooStroke(jit.ctx, stroke('czPaintbrush', LINE));
    const plain = recordingCtx();
    drawColozooStroke(plain.ctx, stroke('czMarker', LINE));
    // Jittered path differs from the un-jittered marker path...
    expect(jit.ops).not.toEqual(plain.ops);
    // ...but re-running the paintbrush reproduces it exactly.
    const again = recordingCtx();
    drawColozooStroke(again.ctx, stroke('czPaintbrush', LINE));
    expect(again.ops).toEqual(jit.ops);
  });

  it('pencil/chalk add speckle fills that a plain marker does not', () => {
    const pencil = recordingCtx();
    drawColozooStroke(pencil.ctx, stroke('czPencil', LINE));
    const marker = recordingCtx();
    drawColozooStroke(marker.ctx, stroke('czMarker', LINE));
    const speckles = (ops: string[]) => ops.filter((o) => o === 'fill').length;
    expect(speckles(pencil.ops)).toBeGreaterThan(speckles(marker.ops));
  });

  it('a single-point tap still draws a dot for any brush', () => {
    const rec = recordingCtx();
    drawColozooStroke(rec.ctx, stroke('czDaub', [[50, 50]]));
    expect(rec.ops.some((o) => o.startsWith('arc'))).toBe(true);
    expect(rec.ops).toContain('fill');
  });
});
