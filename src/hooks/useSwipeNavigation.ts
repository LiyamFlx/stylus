import { useEffect, useRef } from 'react';

/**
 * Edge-zone swipe to flip notebook pages (Mobile UX Phase 2).
 *
 * Only starts tracking a gesture that begins within EDGE_ZONE_PX of the left
 * or right viewport edge — like iOS's back-swipe — so it never competes with
 * pen strokes or lasso-selects happening in the body of the page. A swipe
 * starting there still must clear MIN_DISTANCE_PX and stay mostly horizontal
 * (ANGLE_TOLERANCE) to commit; otherwise it's silently ignored (no partial
 * nav, no dead zone left behind for the real gesture underneath).
 *
 * touch-only, deliberately: the canvas calls setPointerCapture on
 * pointerdown, which retargets but does NOT stop bubbling, so a stylus
 * stroke's pointerup still reaches this listener. A pen stroke started near
 * a margin (common) would otherwise flip the page out from under the user
 * mid-draw. Touch has no such conflict — a finger near the edge is never
 * "drawing" — so pen is excluded entirely rather than raced against.
 */

const EDGE_ZONE_PX = 24;
const MIN_DISTANCE_PX = 60;
const ANGLE_TOLERANCE = 0.6; // max |dy/dx| to still count as "horizontal"

export function useSwipeNavigation(
  ref: React.RefObject<HTMLElement>,
  options: { enabled: boolean; onSwipeLeft: () => void; onSwipeRight: () => void },
): void {
  const { enabled, onSwipeLeft, onSwipeRight } = options;
  const startRef = useRef<{ x: number; y: number; fromEdge: 'left' | 'right' | null } | null>(
    null,
  );

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const width = el.clientWidth;
      const fromEdge =
        e.clientX <= EDGE_ZONE_PX ? 'left' : e.clientX >= width - EDGE_ZONE_PX ? 'right' : null;
      startRef.current = fromEdge ? { x: e.clientX, y: e.clientY, fromEdge } : null;
    };

    const onPointerUp = (e: PointerEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < MIN_DISTANCE_PX) return;
      if (Math.abs(dy) / Math.abs(dx) > ANGLE_TOLERANCE) return;

      // Started at the left edge, dragged right → previous page (like pulling
      // the next page's left edge toward you). Started at the right edge,
      // dragged left → next page. Same convention as iOS back/forward-swipe.
      if (start.fromEdge === 'left' && dx > 0) onSwipeRight();
      else if (start.fromEdge === 'right' && dx < 0) onSwipeLeft();
    };

    const onPointerCancel = () => {
      startRef.current = null;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [ref, enabled, onSwipeLeft, onSwipeRight]);
}
