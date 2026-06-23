import type { InkPoint, Stroke } from '../types';

/** Build an InkPoint with sensible defaults; override what the test cares about. */
export function point(x: number, y: number, over: Partial<InkPoint> = {}): InkPoint {
  return { x, y, pressure: 0.5, t: 0, ...over };
}

/** Build a Stroke from raw [x, y] pairs. */
export function stroke(
  coords: Array<[number, number]>,
  over: Partial<Omit<Stroke, 'points'>> = {},
): Stroke {
  return {
    id: 'test-stroke',
    color: '#fafafa',
    size: 4,
    points: coords.map(([x, y]) => point(x, y)),
    ...over,
  };
}
