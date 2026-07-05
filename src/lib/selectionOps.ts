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
 * Drop from the selection any ids no longer present in `strokes` — e.g. after an
 * undo/redo brings back a state where selected strokes don't exist. Returns the
 * same set reference (identity-stable) when nothing needs pruning, so callers
 * can cheaply skip a state update.
 */
export function reconcileSelection(
  selectedIds: ReadonlySet<string>,
  strokes: Stroke[],
): ReadonlySet<string> {
  if (selectedIds.size === 0) return selectedIds;
  const liveIds = new Set(strokes.map((s) => s.id));
  let changed = false;
  const next = new Set<string>();
  for (const id of selectedIds) {
    if (liveIds.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : selectedIds;
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
