import type { PointerEvent as ReactPointerEvent } from 'react';
import { forwardRef, useState } from 'react';
import type { Tool } from '../types';

interface CanvasProps {
  tool: Tool;
  /** Eraser contact radius in CSS px, used to size the hover ring. */
  eraserRadius: number;
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
}

/**
 * Pure drawing surface. Holds no drawing state — it forwards a ref to the
 * underlying <canvas> (sized + painted by useDrawing) and emits pointer events
 * upward. It does own a tiny bit of local UI state: the eraser hover ring, so
 * the user can see exactly what a tap will erase.
 *
 * `touch-action: none` (via the `ink-surface` class) is critical: it tells the
 * browser not to treat finger drags as scroll/zoom gestures, so the same
 * pointer pipeline handles mouse, touch, pen and Apple Pencil identically.
 */
export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(
  ({ tool, eraserRadius, onPointerDown, onPointerMove, onPointerUp }, ref) => {
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
    const showRing = tool === 'eraser' && cursor !== null;

    const trackCursor = (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (tool === 'eraser') {
        setCursor({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
      }
      onPointerMove(e);
    };

    return (
      <>
        <canvas
          ref={ref}
          className="ink-surface absolute inset-0 h-full w-full"
          // Hide the OS cursor for the eraser — the ring is the cursor.
          style={{ cursor: tool === 'eraser' ? 'none' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={trackCursor}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setCursor(null)}
          // Treat cancellation (e.g. palm rejection, system gesture) like a
          // normal up so we never leave a dangling captured pointer. We do NOT
          // bind pointerleave for the gesture: with setPointerCapture active the
          // gesture should continue even when the pointer exits the bounds.
          onPointerCancel={onPointerUp}
        />
        {showRing && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-full border border-ink-400/70 bg-ink-900/5"
            style={{
              left: cursor.x - eraserRadius,
              top: cursor.y - eraserRadius,
              width: eraserRadius * 2,
              height: eraserRadius * 2,
            }}
          />
        )}
      </>
    );
  },
);

Canvas.displayName = 'Canvas';
