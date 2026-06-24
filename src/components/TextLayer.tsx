import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TextItem, Tool } from '../types';

interface TextLayerProps {
  items: TextItem[];
  activeId: string | null;
  tool: Tool;
  onCreate: (x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}

/**
 * Overlay that renders the document's text boxes and, when the text tool is
 * active, lets the user place a new box (tap empty space), select one (tap it),
 * or drag it. Actual text input flows in through the on-screen keyboard; the
 * boxes themselves are display-only.
 */
export function TextLayer({
  items,
  activeId,
  tool,
  onCreate,
  onSelect,
  onMove,
}: TextLayerProps) {
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(
    null,
  );
  const textMode = tool === 'text';

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, item: TextItem) => {
    if (!textMode) return;
    e.stopPropagation();
    onSelect(item.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: item.id,
      dx: e.nativeEvent.offsetX,
      dy: e.nativeEvent.offsetY,
      moved: false,
    };
  };

  const onItemMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    // Position from the parent layer's coordinate space.
    const parent = e.currentTarget.parentElement?.getBoundingClientRect();
    const x = e.clientX - (parent?.left ?? 0) - d.dx;
    const y = e.clientY - (parent?.top ?? 0) - d.dy;
    onMove(d.id, Math.max(0, x), Math.max(0, y));
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
    // The layer itself must never swallow pointer events meant for the canvas
    // beneath it (pen/eraser) — only its interactive children opt back in.
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Placement catcher: only intercepts taps in text mode. */}
      {textMode && (
        <div
          className="pointer-events-auto absolute inset-0"
          style={{ cursor: 'text' }}
          onPointerDown={(e) => {
            // Tapping empty space places a new text box and deselects.
            if (e.target === e.currentTarget) {
              onCreate(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
            }
          }}
        />
      )}

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
  );
}
