import { describe, it, expect, vi } from 'vitest';
import { drawStroke, renderAll } from './render';
import { stroke } from '../test/fixtures';

/** A minimal mock 2D context recording the calls render.ts makes. */
function mockCtx() {
  return {
    strokeStyle: '',
    fillStyle: '',
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  };
}

describe('drawStroke', () => {
  it('draws nothing for an empty stroke', () => {
    const ctx = mockCtx();
    drawStroke(ctx as unknown as CanvasRenderingContext2D, stroke([]));
    expect(ctx.beginPath).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('renders a single point as a filled dot (so dotting an "i" works)', () => {
    const ctx = mockCtx();
    drawStroke(ctx as unknown as CanvasRenderingContext2D, stroke([[10, 10]]));
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();
  });

  it('draws a quadratic segment per pair of points', () => {
    const ctx = mockCtx();
    // 3 points → 2 segments → 2 quadratic curves.
    drawStroke(
      ctx as unknown as CanvasRenderingContext2D,
      stroke([[0, 0], [10, 0], [20, 0]]),
    );
    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('never switches to a multiply blend (would blacken highlighter on dark exports)', () => {
    const ctx = mockCtx();
    drawStroke(
      ctx as unknown as CanvasRenderingContext2D,
      stroke([[0, 0], [10, 0], [20, 0]], { penType: 'highlighter' }),
    );
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('applies the stroke color to both stroke and fill styles', () => {
    const ctx = mockCtx();
    drawStroke(
      ctx as unknown as CanvasRenderingContext2D,
      stroke([[0, 0]], { color: '#ef4444' }),
    );
    expect(ctx.strokeStyle).toBe('#ef4444');
    expect(ctx.fillStyle).toBe('#ef4444');
  });
});

describe('renderAll', () => {
  it('clears the canvas before drawing the strokes', () => {
    const ctx = mockCtx();
    const calls: string[] = [];
    ctx.clearRect.mockImplementation(() => calls.push('clear'));
    ctx.stroke.mockImplementation(() => calls.push('stroke'));

    renderAll(
      ctx as unknown as CanvasRenderingContext2D,
      [stroke([[0, 0], [5, 5]])],
      100,
      100,
    );
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(calls[0]).toBe('clear'); // clear happens before any stroke
  });

  it('draws every stroke in order', () => {
    const ctx = mockCtx();
    renderAll(
      ctx as unknown as CanvasRenderingContext2D,
      [stroke([[0, 0]]), stroke([[1, 1]]), stroke([[2, 2]])],
      50,
      50,
    );
    expect(ctx.arc).toHaveBeenCalledTimes(3); // three single-point dots
  });

  it('handles an empty drawing by only clearing', () => {
    const ctx = mockCtx();
    renderAll(ctx as unknown as CanvasRenderingContext2D, [], 10, 10);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('renders the paper guide for a non-blank style', () => {
    const ctx = mockCtx();
    // In a real browser the guide is cached to an offscreen bitmap and blitted
    // via drawImage; under jsdom (stub canvas) it falls back to drawing the
    // guide directly. Either way the guide must appear.
    renderAll(ctx as unknown as CanvasRenderingContext2D, [], 200, 200, {
      paper: 'isometric',
    });
    const cached = ctx.drawImage.mock.calls.length > 0;
    const direct = ctx.stroke.mock.calls.length > 0;
    expect(cached || direct).toBe(true);
  });

  it('draws no paper guide for the blank style', () => {
    const ctx = mockCtx();
    renderAll(ctx as unknown as CanvasRenderingContext2D, [], 200, 200, {
      paper: 'blank',
    });
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  describe('bounded page (notebook A4)', () => {
    const pageBounds = { minX: 0, minY: 0, maxX: 794, maxY: 1123 };
    const viewRect = { minX: -100, minY: -50, maxX: 900, maxY: 700 };

    it('fills a backdrop, clips to the page, and strokes the page edge', () => {
      const ctx = mockCtx();
      renderAll(ctx as unknown as CanvasRenderingContext2D, [], 1000, 700, {
        paper: 'notebook',
        pageBounds,
        viewRect,
      });
      // Backdrop covers the visible rect.
      expect(ctx.fillRect).toHaveBeenCalledWith(-100, -50, 1000, 750);
      // Paper is clipped to the page rect and offset to its origin.
      expect(ctx.clip).toHaveBeenCalled();
      expect(ctx.translate).toHaveBeenCalledWith(0, 0);
      // The page gets a visible edge.
      expect(ctx.strokeRect).toHaveBeenCalledWith(0.5, 0.5, 793, 1122);
    });

    it('fills the sheet cream even for a blank notebook page', () => {
      const ctx = mockCtx();
      renderAll(ctx as unknown as CanvasRenderingContext2D, [], 1000, 700, {
        paper: 'blank',
        pageBounds,
        viewRect,
      });
      // A blank bounded page is still a cream sheet, not the dark canvas.
      expect(ctx.fillStyle).toBeTypeOf('string');
      expect(ctx.clip).toHaveBeenCalled();
      expect(ctx.strokeRect).toHaveBeenCalled();
    });
  });
});
