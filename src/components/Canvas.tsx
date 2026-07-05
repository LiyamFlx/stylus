import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { Tool } from '../types';

interface CanvasProps {
  tool: Tool;
  /** Eraser contact radius in CSS px (world units), used to size the hover ring. */
  eraserRadius: number;
  /** Current zoom — scales the hover ring so it matches on-screen erase size. */
  scale: number;
  /** Resolved CSS cursor value — computed by the parent from tool + selection phase. */
  cursor?: string;
  /** Bottom layer: committed strokes + paper (painted by useDrawing). */
  baseCanvasRef: RefObject<HTMLCanvasElement>;
  /** Top layer: live stroke, lasso, selection — also the interactive surface. */
  overlayCanvasRef: RefObject<HTMLCanvasElement>;
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  /** Abort the in-flight gesture without committing (palm rejection etc.). */
  onPointerCancel: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
}

/**
 * Pure drawing surface, split into two stacked canvases for performance:
 *  - a static layer (bottom) holding committed strokes + paper, repainted only
 *    when committed ink changes;
 *  - an overlay layer (top, interactive) holding the in-progress stroke, lasso,
 *    and selection, cleared + redrawn cheaply on every pointer frame.
 * This keeps the hot drawing path from re-stroking the whole document each frame.
 *
 * The overlay is the topmost element and owns pointer events + the eraser hover
 * ring; the static canvas sits beneath with `pointer-events-none`.
 *
 * `touch-action: none` (via the `ink-surface` class) is critical: it tells the
 * browser not to treat finger drags as scroll/zoom gestures, so the same
 * pointer pipeline handles mouse, touch, pen and Apple Pencil identically.
 */
export function Canvas({
  tool,
  eraserRadius,
  scale,
  cursor,
  baseCanvasRef,
  overlayCanvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: CanvasProps) {
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const showRing = tool === 'eraser' && hoverPos !== null;

  // Drop the stale position on tool switch — otherwise re-entering eraser
  // mode shows the ring at wherever the cursor was last time it was active.
  useEffect(() => {
    if (tool !== 'eraser') setHoverPos(null);
  }, [tool]);

  const clearHover = useCallback(() => setHoverPos(null), []);

  // Derive cursor: callers can override via the `cursor` prop; otherwise fall
  // back to sensible per-tool defaults.
  const resolvedCursor =
    cursor ?? (tool === 'eraser' ? 'none' : tool === 'select' ? 'default' : 'crosshair');

  const trackCursor = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === 'eraser') {
      // offsetX/Y are screen-space (relative to the canvas), which is what the
      // CSS-positioned ring needs — no world conversion required here.
      setHoverPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    }
    onPointerMove(e);
  };

  const handlePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      // Cancellation (palm rejection, a system/browser gesture stealing the
      // pointer) must DISCARD the in-flight gesture, not commit it like a normal
      // up would. Also drop the hover ring, since cancel usually means the
      // pointer left valid contact and pointerleave won't reliably fire while
      // captured.
      onPointerCancel(e);
      setHoverPos(null);
    },
    [onPointerCancel],
  );

  // Ring radius is a world-space value, so scale it to on-screen pixels.
  const ringRadius = eraserRadius * scale;

  return (
    <>
      <canvas
        ref={baseCanvasRef}
        className="ink-surface pointer-events-none absolute inset-0 h-full w-full"
      />
      <canvas
        ref={overlayCanvasRef}
        className="ink-surface absolute inset-0 h-full w-full"
        style={{ cursor: resolvedCursor }}
        onPointerDown={onPointerDown}
        onPointerMove={trackCursor}
        onPointerUp={onPointerUp}
        onPointerLeave={clearHover}
        onPointerCancel={handlePointerCancel}
      />
      {showRing && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 rounded-full border border-ink-400/70 bg-ink-900/5"
          style={{
            left: hoverPos.x - ringRadius,
            top: hoverPos.y - ringRadius,
            width: ringRadius * 2,
            height: ringRadius * 2,
          }}
        />
      )}
    </>
  );
}
