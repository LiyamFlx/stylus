import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TextItem, Tool } from '../types';
import { screenToWorld } from '../lib/geometry';
import type { ViewTransform } from '../lib/geometry';

interface TextLayerProps {
  items: TextItem[];
  activeId: string | null;
  tool: Tool;
  /** Canvas zoom + pan, so text tracks the ink beneath it. */
  view: ViewTransform;
  onCreate: (x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}

/**
 * Overlay that renders the document's text boxes and, when the text tool is
 * active, lets the user place a new box (tap empty space), select one (tap it),
 * or drag it. Actual text input flows in through the on-screen keyboard; the
 * boxes themselves are display-only.
 *
 * Text positions are stored in *world* space (matching ink). A CSS transform on
 * the inner wrapper applies the canvas pan + zoom so boxes stay glued to the ink
 * and scale with it; pointer coordinates are converted screen→world before they
 * touch the document model.
 */
export function TextLayer({
  items,
  activeId,
  tool,
  view,
  onCreate,
  onSelect,
  onMove,
}: TextLayerProps) {
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(
    null,
  );
  const textMode = tool === 'text';

  // Screen point (relative to the layer) → world coordinates.
  const toWorld = (clientX: number, clientY: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return screenToWorld(clientX - rect.left, clientY - rect.top, view);
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, item: TextItem) => {
    if (!textMode) return;
    e.stopPropagation();
    onSelect(item.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Grab offset in world units, so the box doesn't jump under the cursor.
    const layer = e.currentTarget.parentElement as HTMLElement; // the transformed wrapper
    const w = toWorld(e.clientX, e.clientY, layer);
    drag.current = {
      id: item.id,
      dx: w.x - item.x,
      dy: w.y - item.y,
      moved: false,
    };
  };

  const onItemMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const layer = e.currentTarget.parentElement as HTMLElement;
    const w = toWorld(e.clientX, e.clientY, layer);
    onMove(d.id, Math.max(0, w.x - d.dx), Math.max(0, w.y - d.dy));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    drag.current = null;
  };

  return (
    // The outer layer must never swallow pointer events meant for the canvas
    // beneath it (pen/eraser) — only its interactive children opt back in.
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Placement catcher: only intercepts taps in text mode. Sits outside the
          transform so its offset math is straightforward (converted below). */}
      {textMode && (
        <div
          className="pointer-events-auto absolute inset-0"
          style={{ cursor: 'text' }}
          onPointerDown={(e) => {
            // Tapping empty space places a new text box (in world coords).
            if (e.target === e.currentTarget) {
              const w = toWorld(e.clientX, e.clientY, e.currentTarget);
              onCreate(w.x, w.y);
            }
          }}
        />
      )}

      {/* Transformed wrapper: world space → screen via canvas pan + zoom. */}
      <div
        className="absolute left-0 top-0 h-full w-full"
        style={{
          transformOrigin: '0 0',
          transform: `scale(${view.scale}) translate(${-view.panX}px, ${-view.panY}px)`,
        }}
      >
        {items.map((item) => {
          const isActive = item.id === activeId && textMode;
          return (
            <div
              key={item.id}
              onPointerDown={(e) => startDrag(e, item)}
              onPointerMove={onItemMove}
              onPointerUp={endDrag}
              className={[
                'absolute whitespace-pre-wrap break-words leading-tight',
                textMode ? 'pointer-events-auto cursor-move' : 'pointer-events-none',
                isActive ? 'rounded-sm ring-2 ring-brand-500' : '',
              ].join(' ')}
              style={{
                left: item.x,
                top: item.y,
                color: item.color,
                fontSize: item.size,
                padding: isActive ? 2 : 0,
              }}
            >
              {item.text}
              {isActive && (
                <span className="ml-px inline-block w-px animate-pulse align-baseline">
                  |
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
