import { memo } from 'react';
import type { MelodyShape } from '../hooks/useMusicMode';
import { worldToScreen, type ViewTransform } from '../lib/geometry';

/**
 * Visual layer for Kandinsky music mode: the centered welcome moment shown on
 * entry, and the glow+pulse that lights each shape as the sweep plays its note.
 *
 * Shape bounds are stored in WORLD space (the same space stroke points live in,
 * so they survive zoom/pan). We convert to screen space here via the live view
 * transform, so the rings stay glued to the ink at any zoom or pan.
 */

export function KandinskyWelcome() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="kandinsky-welcome flex flex-col items-center text-center">
        <span className="text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          Kandinsky Mode
        </span>
        <span className="mt-2 text-base text-ink-400 sm:text-lg">
          Lines sing. Circles glow. Shapes play.
        </span>
      </div>
    </div>
  );
}

/** A single shape's glow+pulse ring, shown while it is "lit" by the sweep. */
function ShapePulse({ shape, view }: { shape: MelodyShape; view: ViewTransform }) {
  const pad = 14;
  // World bounding box → screen, then pad in screen px.
  const tl = worldToScreen(shape.minX, shape.minY, view);
  const br = worldToScreen(shape.maxX, shape.maxY, view);
  const left = tl.x - pad;
  const top = tl.y - pad;
  const width = br.x - tl.x + pad * 2;
  const height = br.y - tl.y + pad * 2;
  return (
    <span
      className="kandinsky-pulse absolute rounded-full"
      style={{ left, top, width, height }}
    />
  );
}

/**
 * Memoized so Workspace's per-frame re-render during a sweep (driven by the
 * playhead position) only re-renders the pulses when the lit set, melody, or
 * view actually changes — not on every animation frame.
 */
export const KandinskyPulses = memo(function KandinskyPulses({
  shapes,
  litIds,
  view,
}: {
  shapes: MelodyShape[];
  litIds: ReadonlySet<string>;
  view: ViewTransform;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {shapes.map((shape) =>
        litIds.has(shape.id) ? <ShapePulse key={shape.id} shape={shape} view={view} /> : null,
      )}
    </div>
  );
});
