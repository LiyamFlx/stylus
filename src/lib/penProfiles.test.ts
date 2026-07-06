import { describe, it, expect } from 'vitest';
import { penProfile, PEN_TYPES } from './penProfiles';

describe('penProfile', () => {
  it('defines a profile for every pen type', () => {
    for (const t of PEN_TYPES) {
      expect(penProfile(t)).toBeDefined();
    }
  });

  it('fountain varies width with pressure', () => {
    const p = penProfile('fountain');
    expect(p.widthFor(0.2, 4)).toBeLessThan(p.widthFor(0.9, 4));
  });

  it('ballpoint width is uniform regardless of pressure', () => {
    const p = penProfile('ballpoint');
    expect(p.widthFor(0.1, 4)).toBe(p.widthFor(0.9, 4));
  });

  it('highlighter is wide and translucent', () => {
    const hi = penProfile('highlighter');
    const ball = penProfile('ballpoint');
    expect(hi.widthFor(0.5, 4)).toBeGreaterThan(ball.widthFor(0.5, 4));
    expect(hi.opacity).toBeLessThan(1);
  });

  it('opaque pens have full opacity', () => {
    expect(penProfile('ballpoint').opacity).toBe(1);
    expect(penProfile('fountain').opacity).toBe(1);
  });

  it('clamps width to a sane minimum', () => {
    const p = penProfile('fountain');
    expect(p.widthFor(0, 4)).toBeGreaterThan(0);
  });
});

describe('PEN_TYPES', () => {
  it('lists every pen exactly once, fountain first', () => {
    expect(PEN_TYPES[0]).toBe('fountain');
    expect(new Set(PEN_TYPES).size).toBe(PEN_TYPES.length);
    // Every entry must have a working profile (compile-time Record + runtime).
    for (const t of PEN_TYPES) expect(penProfile(t).label).toBeTruthy();
  });
});

describe('phase 3 brushes', () => {
  it('pencil is semi-opaque and pressure-sensitive', () => {
    const p = penProfile('pencil');
    expect(p.opacity).toBeLessThan(1);
    expect(p.widthFor(1, 4)).toBeGreaterThan(p.widthFor(0, 4));
    expect(p.blend).toBeUndefined();
  });
  it('neon carries the screen blend; all others default to source-over', () => {
    expect(penProfile('neon').blend).toBe('screen');
    for (const t of ['fountain', 'ballpoint', 'brush', 'highlighter', 'pencil'] as const) {
      expect(penProfile(t).blend).toBeUndefined();
    }
  });
});
