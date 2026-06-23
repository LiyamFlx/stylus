import type { PointerEvent as ReactPointerEvent } from 'react';
import { forwardRef } from 'react';
import type { Tool } from '../types';

interface CanvasProps {
  tool: Tool;
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
}

/**
 * Pure drawing surface. Holds no state — it forwards a ref to the underlying
 * <canvas> (sized + painted by useDrawing) and emits pointer events upward.
 *
 * `touch-action: none` (via the `ink-surface` class) is critical: it tells the
 * browser not to treat finger drags as scroll/zoom gestures, so the same
 * pointer pipeline handles mouse, touch, pen and Apple Pencil identically.
 */
export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(
  ({ tool, onPointerDown, onPointerMove, onPointerUp }, ref) => {
    return (
      <canvas
        ref={ref}
        className="ink-surface absolute inset-0 h-full w-full"
        style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        // Treat cancellation (e.g. palm rejection, system gesture) like a
        // normal up so we never leave a dangling captured pointer. We do NOT
        // bind pointerleave: with setPointerCapture active the gesture should
        // continue even when the pointer exits the element bounds.
        onPointerCancel={onPointerUp}
      />
    );
  },
);

Canvas.displayName = 'Canvas';
