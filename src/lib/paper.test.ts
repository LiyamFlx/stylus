import { describe, it, expect, vi } from 'vitest';
import { drawPaper } from './paper';

function mockCtx() {
  return {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
}

describe('drawPaper', () => {
  it('draws nothing for the blank style', () => {
    const c = mockCtx();
    drawPaper(c as unknown as CanvasRenderingContext2D, 'blank', 100, 100);
    expect(c.save).not.toHaveBeenCalled();
    expect(c.stroke).not.toHaveBeenCalled();
    expect(c.fill).not.toHaveBeenCalled();
  });

  it('ruled draws horizontal lines only', () => {
    const c = mockCtx();
    // 100px tall, 32px spacing → lines at y = 32, 64, 96 → 3 lines.
    drawPaper(c as unknown as CanvasRenderingContext2D, 'ruled', 100, 100);
    expect(c.moveTo).toHaveBeenCalledTimes(3);
    expect(c.lineTo).toHaveBeenCalledTimes(3);
    expect(c.stroke).toHaveBeenCalledTimes(1);
  });

  it('grid adds vertical lines on top of the ruled lines', () => {
    const c = mockCtx();
    // 3 horizontal + 3 vertical = 6 segments.
    drawPaper(c as unknown as CanvasRenderingContext2D, 'grid', 100, 100);
    expect(c.moveTo).toHaveBeenCalledTimes(6);
    expect(c.lineTo).toHaveBeenCalledTimes(6);
  });

  it('dots draws a filled dot at each grid intersection', () => {
    const c = mockCtx();
    // 3 × 3 interior intersections = 9 dots.
    drawPaper(c as unknown as CanvasRenderingContext2D, 'dots', 100, 100);
    expect(c.arc).toHaveBeenCalledTimes(9);
    expect(c.fill).toHaveBeenCalledTimes(9);
    expect(c.stroke).not.toHaveBeenCalled();
  });

  it('balances save/restore so it never leaks context state', () => {
    const c = mockCtx();
    drawPaper(c as unknown as CanvasRenderingContext2D, 'grid', 64, 64);
    expect(c.save).toHaveBeenCalledTimes(1);
    expect(c.restore).toHaveBeenCalledTimes(1);
  });

  it('handles a canvas smaller than the spacing without drawing lines', () => {
    const c = mockCtx();
    drawPaper(c as unknown as CanvasRenderingContext2D, 'grid', 10, 10);
    expect(c.moveTo).not.toHaveBeenCalled();
  });
});
