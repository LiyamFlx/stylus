import type { MelodyShape } from '../hooks/useMusicMode';

/**
 * Visual layer for Kandinsky music mode: the centered welcome moment shown on
 * entry, and the glow+pulse that lights each shape as the sweep plays its note.
 *
 * Positioned absolutely over the canvas; coordinates are canvas-space CSS px,
 * matching the values classifyShape returns (the canvas fills <main>).
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
function ShapePulse({ shape }: { shape: MelodyShape }) {
  const pad = 14;
  const left = shape.minX - pad;
  const top = shape.minY - pad;
  const width = shape.maxX - shape.minX + pad * 2;
  const height = shape.maxY - shape.minY + pad * 2;
  return (
    <span
      className="kandinsky-pulse absolute rounded-full"
      style={{ left, top, width, height }}
    />
  );
}

export function KandinskyPulses({
  shapes,
}: {
  shapes: { shape: MelodyShape; lit: boolean }[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {shapes.map(({ shape, lit }) => (lit ? <ShapePulse key={shape.id} shape={shape} /> : null))}
    </div>
  );
}
