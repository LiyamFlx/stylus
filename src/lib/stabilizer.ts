/**
 * Handwriting stabilizer. Pulls each incoming sample a fraction of the way
 * toward the previous (already-smoothed) point, damping jitter without adding
 * perceptible lag at low strengths. Pure and side-effect-free.
 */

interface Pt {
  x: number;
  y: number;
}

/** Largest pull allowed — kept below 1 so the pen never freezes. */
const MAX_STRENGTH = 0.85;

/**
 * @param raw      the new sampled point
 * @param prev     the previous smoothed point, or null for the first sample
 * @param strength 0 = no smoothing, →1 = heavy. Clamped to [0, 0.85].
 */
export function smoothPoint(raw: Pt, prev: Pt | null, strength: number): Pt {
  if (!prev || strength <= 0) return { x: raw.x, y: raw.y };
  const s = Math.min(MAX_STRENGTH, strength);
  return {
    x: raw.x + (prev.x - raw.x) * s,
    y: raw.y + (prev.y - raw.y) * s,
  };
}
