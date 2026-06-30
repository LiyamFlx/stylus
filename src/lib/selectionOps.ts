import { createId } from './id';
import type { Stroke } from '../types';

/**
 * Clone the selected strokes with fresh ids, offset by (dx,dy) in world px.
 * Returns the new full list and the set of clone ids (to select them).
 * Returns the input array unchanged when the selection is empty.
 */
export function duplicateStrokes(
  all: Stroke[],
  selectedIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): { next: Stroke[]; newIds: Set<string> } {
  if (selectedIds.size === 0) return { next: all, newIds: new Set() };
  const newIds = new Set<string>();
  const clones: Stroke[] = [];
  for (const s of all) {
    if (!selectedIds.has(s.id)) continue;
    const id = createId('s_');
    newIds.add(id);
    clones.push({
      ...s,
      id,
      points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    });
  }
  return { next: [...all, ...clones], newIds };
}

/**
 * Set `color` on the selected strokes. Returns the same array reference when
 * the selection is empty (lets callers skip a no-op commit).
 */
export function recolorStrokes(
  all: Stroke[],
  selectedIds: ReadonlySet<string>,
  color: string,
): Stroke[] {
  if (selectedIds.size === 0) return all;
  return all.map((s) => (selectedIds.has(s.id) ? { ...s, color } : s));
}
