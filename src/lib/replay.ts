import type { Stroke } from '../types';

/**
 * Stroke replay (Phase 3 item 6) — pure timeline construction.
 *
 * `Stroke.startedAt` (absolute ms, captured since Phase 0) orders strokes and
 * preserves inter-stroke gaps; per-point `t` (relative, t[0]=0) animates
 * within a stroke. Strokes saved before Phase 0 lack `startedAt` — they fall
 * back to array order with a fixed synthetic gap, so old drawings still
 * replay, just without authentic pauses.
 */

export interface ReplayEntry {
  stroke: Stroke;
  /** Playback-time start (ms from replay begin). */
  start: number;
  /** Drawing duration (last point's t, floored to a visible minimum). */
  duration: number;
}

/** Thinking pauses longer than this are compressed — nobody wants to watch
 *  a 40-second coffee break at 1x. */
const MAX_GAP_MS = 1_500;
/** Synthetic gap for legacy strokes without startedAt. */
const FALLBACK_GAP_MS = 250;
const MIN_DURATION_MS = 120;

export function buildTimeline(strokes: Stroke[]): ReplayEntry[] {
  if (strokes.length === 0) return [];

  // Order by capture time when known; stable for legacy strokes.
  const ordered = [...strokes].sort((a, b) => {
    if (a.startedAt === undefined || b.startedAt === undefined) return 0;
    return a.startedAt - b.startedAt;
  });

  const entries: ReplayEntry[] = [];
  let clock = 0;
  let prevEnd: number | null = null; // absolute end of previous stroke

  for (const stroke of ordered) {
    const duration = Math.max(
      MIN_DURATION_MS,
      stroke.points[stroke.points.length - 1]?.t ?? 0,
    );
    let gap = FALLBACK_GAP_MS;
    if (stroke.startedAt !== undefined && prevEnd !== null) {
      gap = Math.min(Math.max(stroke.startedAt - prevEnd, 0), MAX_GAP_MS);
    }
    const start = entries.length === 0 ? 0 : clock + gap;
    entries.push({ stroke, start, duration });
    clock = start + duration;
    prevEnd = stroke.startedAt !== undefined ? stroke.startedAt + duration : null;
  }
  return entries;
}

/** Total playback length in ms. */
export function timelineLength(timeline: ReplayEntry[]): number {
  const last = timeline[timeline.length - 1];
  return last ? last.start + last.duration : 0;
}

/**
 * The visible drawing state at playback time `t`: fully drawn strokes plus
 * the in-progress stroke truncated to the points already "drawn".
 */
export function frameAt(
  timeline: ReplayEntry[],
  t: number,
): { complete: Stroke[]; partial: Stroke | null } {
  const complete: Stroke[] = [];
  let partial: Stroke | null = null;
  for (const e of timeline) {
    if (t >= e.start + e.duration) {
      complete.push(e.stroke);
    } else if (t >= e.start) {
      const local = t - e.start;
      const pts = e.stroke.points.filter((p) => p.t <= local);
      if (pts.length > 0) partial = { ...e.stroke, points: pts };
      break; // entries are start-ordered; nothing later is visible
    } else {
      break;
    }
  }
  return { complete, partial };
}
