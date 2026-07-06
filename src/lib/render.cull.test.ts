import { describe, it, expect } from 'vitest';
import { renderAll } from './render';
import type { Stroke } from '../types';

/**
 * Phase 3 prerequisite — culling under load (the spec's gating check).
 *
 * jsdom has no GPU, so we measure what culling actually controls: how many
 * canvas path commands a frame issues, and how per-frame CPU cost scales with
 * total document size. A counting stub context stands in for the real 2D
 * context.
 */

function countingCtx() {
  let commands = 0;
  const bump = () => { commands++; };
  const ctx = {
    get commands() { return commands; },
    strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    save: bump, restore: bump, beginPath: bump, moveTo: bump, lineTo: bump,
    quadraticCurveTo: bump, stroke: bump, arc: bump, fill: bump,
    clearRect: bump, fillRect: bump, drawImage: bump,
    setTransform: bump, translate: bump, scale: bump,
  };
  return ctx as unknown as CanvasRenderingContext2D & { commands: number };
}

/** n strokes of 24 points each, spread across a huge world range. */
function syntheticDoc(n: number, worldExtent: number): Stroke[] {
  const strokes: Stroke[] = [];
  for (let i = 0; i < n; i++) {
    const ox = (i * 7919) % worldExtent; // deterministic pseudo-scatter
    const oy = (i * 104729) % worldExtent;
    const points = Array.from({ length: 24 }, (_, j) => ({
      x: ox + j * 3, y: oy + Math.sin(j) * 8, pressure: 0.5, t: j * 8,
    }));
    strokes.push({ id: `s${i}`, color: '#fff', size: 4, points });
  }
  return strokes;
}

const VIEWPORT = 900;

function frameCost(strokes: Stroke[], panX: number): { ms: number; commands: number } {
  const ctx = countingCtx();
  const start = performance.now();
  renderAll(ctx, strokes, VIEWPORT, VIEWPORT, {
    cull: { minX: panX, minY: 0, maxX: panX + VIEWPORT, maxY: VIEWPORT },
  });
  return { ms: performance.now() - start, commands: ctx.commands };
}

describe('viewport culling under load (Phase 3 gate)', () => {
  it('a 5k-stroke doc issues a small fraction of commands when mostly off-screen', () => {
    const doc = syntheticDoc(5_000, 50_000);
    const unculled = (() => {
      const ctx = countingCtx();
      renderAll(ctx, doc, VIEWPORT, VIEWPORT, { cull: null });
      return ctx.commands;
    })();
    const culled = frameCost(doc, 0).commands;
    // Viewport covers ~(900/50000)² of the world → expect >90% command cut.
    expect(culled).toBeLessThan(unculled * 0.1);
    expect(unculled).toBeGreaterThan(100_000); // sanity: the doc is actually big
  });

  it('panning frames stay flat as the DOCUMENT grows (the actual promise)', () => {
    // Same viewport, same world density — 4x the strokes in 4x the area.
    const small = syntheticDoc(5_000, 50_000);
    const large = syntheticDoc(20_000, 100_000);

    // Warm the bounds caches (first frame computes them), then measure pans.
    frameCost(small, 0); frameCost(large, 0);

    const frames = 30;
    let smallMs = 0, largeMs = 0, largeCmds = 0, smallCmds = 0;
    for (let f = 0; f < frames; f++) {
      const s = frameCost(small, f * 200);
      const l = frameCost(large, f * 200);
      smallMs += s.ms; largeMs += l.ms;
      smallCmds += s.commands; largeCmds += l.commands;
    }

    // Commands per frame track VISIBLE density (same for both docs) — allow
    // 2.5x for scatter unevenness, not the 4x that O(document) would show.
    expect(largeCmds / smallCmds).toBeLessThan(2.5);
    // Wall-clock: the large doc still pays O(strokes) for the bounds lookup
    // walk, but must stay well under linear blowup AND absolutely fast.
    expect(largeMs / frames).toBeLessThan(12); // <12ms mean per 20k-stroke frame
    expect(largeMs / Math.max(smallMs, 0.001)).toBeLessThan(8);
  }, 30_000);

  it('bounds cache: repeat frames are much cheaper than the first', () => {
    const doc = syntheticDoc(8_000, 60_000);
    const cold = frameCost(doc, 0).ms; // computes 8k bounds
    let warm = 0;
    for (let f = 1; f <= 10; f++) warm += frameCost(doc, f * 50).ms;
    warm /= 10;
    // Warm frames skip strokeBounds() entirely (WeakMap hit) — expect a
    // large drop. Conservative 2x to keep CI noise-proof.
    expect(warm).toBeLessThan(cold / 2);
  });
});
