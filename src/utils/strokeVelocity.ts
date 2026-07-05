import type { InkPoint } from '../types';

/** Tunable thresholds — world-units/ms at typical screen scale (1x). */
export const VELOCITY_THRESHOLDS = {
  /** Below this: smooth, controlled — clean tone. */
  comfortable: 0.6,
  /** Above this: too fast — braking modulation is at full intensity. */
  tooFast: 1.4,
} as const;

/**
 * Instantaneous velocity between two InkPoints, in world-units/ms.
 * `InkPoint.t` is per-stroke monotonic milliseconds, so `curr.t - prev.t` is a
 * valid dt. Guards against zero/negative dt (duplicate or out-of-order samples).
 */
export function pointVelocity(prev: InkPoint, curr: InkPoint): number {
  const dt = curr.t - prev.t;
  if (dt <= 0) return 0;
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  return Math.sqrt(dx * dx + dy * dy) / dt;
}

/**
 * Exponential moving average — smooths per-sample jitter (coalesced pointer
 * events produce noisy instantaneous velocity) without the latency of a
 * fixed-window buffer. `prevSmoothed === null` seeds with the raw value.
 */
export function smoothVelocity(
  raw: number,
  prevSmoothed: number | null,
  alpha = 0.3,
): number {
  if (prevSmoothed === null) return raw;
  return alpha * raw + (1 - alpha) * prevSmoothed;
}

/** Normalized 0–1 "braking intensity" for a smoothed velocity. */
export function brakingIntensity(velocity: number): number {
  const { comfortable, tooFast } = VELOCITY_THRESHOLDS;
  if (velocity <= comfortable) return 0;
  if (velocity >= tooFast) return 1;
  return (velocity - comfortable) / (tooFast - comfortable);
}
