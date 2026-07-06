import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
  /** Full-value edit of the active box (from the live textarea). */
  onEdit: (text: string) => void;
  /** Finish editing (Escape). */
  onDone: () => void;
}

interface DragState {
  id: string;
  dx: number;
  dy: number;
}

/**
 * Overlay for the document's text boxes.
 *
 * Inactive boxes are lightweight display divs. The ACTIVE box is edited through
 * a single persistent `<textarea>` (transparent, world-positioned over the box)
 * that gives all standard editing for free — caret, double-click word select,
 * drag-select, Cmd+C/V/X/A, arrows, home/end.
 *
 * The textarea is ALWAYS mounted while in text mode and is focused
 * *synchronously inside the tap gesture* (place or select) — never from an
 * effect. That's what lets mobile browsers open the OS keyboard, which they only
 * do when focus happens within a user gesture.
 *
 * Positions are world-space (matching ink); a CSS transform on the inner wrapper
 * applies pan + zoom. Pointer coords convert screen→world against the
 * UNTRANSFORMED root layer (the transformed wrapper's rect already bakes in
 * pan/zoom and would double-apply it).
 */
export function TextLayer({
  items,
  activeId,
  tool,
  view,
  onCreate,
  onSelect,
  onMove,
  onEdit,
  onDone,
}: TextLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<DragState | null>(null);
  const textMode = tool === 'text';

  // view flows through a ref so drag handlers stay referentially stable
  // (keeps memoized items from re-rendering on every pan/zoom frame).
  const viewRef = useRef(view);
  viewRef.current = view;

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return screenToWorld(clientX - rect.left, clientY - rect.top, viewRef.current);
  }, []);

  /** Focus the shared textarea NOW (synchronous, inside a tap) so mobile opens
   *  the keyboard. Safe to call before React repositions it for the new box. */
  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, item: TextItem) => {
      e.stopPropagation();
      onSelect(item.id);
      focusInput();
      e.currentTarget.setPointerCapture(e.pointerId);
      const w = toWorld(e.clientX, e.clientY);
      drag.current = { id: item.id, dx: w.x - item.x, dy: w.y - item.y };
    },
    [onSelect, focusInput, toWorld],
  );

  const onItemMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const w = toWorld(e.clientX, e.clientY);
      onMove(d.id, Math.max(0, w.x - d.dx), Math.max(0, w.y - d.dy));
    },
    [onMove, toWorld],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  }, []);

  const onPlacePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Tapping empty space places a new box, and focuses the input in the SAME
      // gesture so the mobile keyboard opens.
      if (e.target === e.currentTarget) {
        const w = toWorld(e.clientX, e.clientY);
        onCreate(w.x, w.y);
        focusInput();
      }
    },
    [onCreate, focusInput, toWorld],
  );

  const activeItem = items.find((i) => i.id === activeId) ?? null;

  return (
    // The outer layer must never swallow pointer events meant for the canvas
    // beneath it (pen/eraser) — only its interactive children opt back in.
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Placement catcher: only intercepts taps in text mode. */}
      {textMode && (
        <div
          className="pointer-events-auto absolute inset-0"
          style={{ cursor: 'text' }}
          onPointerDown={onPlacePointerDown}
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
        {items.map((item) =>
          item.id === activeId && textMode ? null : (
            <TextBoxItem
              key={item.id}
              item={item}
              textMode={textMode}
              onPointerDown={startDrag}
              onPointerMove={onItemMove}
              onPointerEnd={endDrag}
            />
          ),
        )}

        {/* The single editing surface for the active box. Kept mounted in text
            mode (even with no active box) so it can be focused inside a tap. */}
        {textMode && (
          <ActiveTextArea
            ref={inputRef}
            item={activeItem}
            onEdit={onEdit}
            onDone={onDone}
          />
        )}
      </div>
    </div>
  );
}

interface TextBoxItemProps {
  item: TextItem;
  textMode: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, item: TextItem) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

const TextBoxItem = memo(function TextBoxItem({
  item,
  textMode,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: TextBoxItemProps) {
  return (
    <div
      onPointerDown={textMode ? (e) => onPointerDown(e, item) : undefined}
      onPointerMove={textMode ? onPointerMove : undefined}
      onPointerUp={textMode ? onPointerEnd : undefined}
      onPointerCancel={textMode ? onPointerEnd : undefined}
      className={[
        'absolute whitespace-pre-wrap break-words leading-tight',
        textMode ? 'pointer-events-auto cursor-move' : 'pointer-events-none',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: item.x,
        top: item.y,
        color: item.color,
        fontSize: item.size,
        // Constant box model — padding+margin cancel so text sits identically
        // to the editing textarea (no shift on activate/deactivate).
        padding: 2,
        margin: -2,
      }}
    >
      {item.text || ' '}
    </div>
  );
});

interface ActiveTextAreaProps {
  /** The active box, or null when text mode is on but nothing is selected. */
  item: TextItem | null;
  onEdit: (text: string) => void;
  onDone: () => void;
}

/**
 * One persistent transparent textarea, positioned over the active box. When no
 * box is active it's parked off-view but still mounted, so a placement tap can
 * focus it synchronously (mobile keyboard). All editing is native.
 */
const ActiveTextArea = memo(
  forwardRef<HTMLTextAreaElement, ActiveTextAreaProps>(function ActiveTextArea(
    { item, onEdit, onDone },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = useCallback(
      (el: HTMLTextAreaElement | null) => {
        localRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );

    // Auto-size to content, and place the caret at the end when the active box
    // changes (switching boxes). Layout effect so it's flushed before paint.
    useLayoutEffect(() => {
      const el = localRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [item?.text, item?.size]);

    const activeIdRef = useRef<string | null>(null);
    useEffect(() => {
      if (item && item.id !== activeIdRef.current) {
        activeIdRef.current = item.id;
        const el = localRef.current;
        if (el && document.activeElement === el) {
          const end = el.value.length;
          el.setSelectionRange(end, end);
        }
      } else if (!item) {
        activeIdRef.current = null;
      }
    }, [item]);

    return (
      <textarea
        ref={setRefs}
        value={item?.text ?? ''}
        onChange={(e) => onEdit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDone();
          }
          // Don't let the canvas' window-level tool hotkeys fire while typing.
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        rows={1}
        spellCheck={false}
        autoCapitalize="sentences"
        aria-label="Edit text"
        className={[
          'absolute resize-none overflow-hidden whitespace-pre-wrap break-words rounded-sm',
          'border-0 bg-transparent leading-tight outline-none',
          item ? 'pointer-events-auto ring-2 ring-brand-500' : 'pointer-events-none',
        ].join(' ')}
        style={{
          // Parked off-view (but mounted + focusable) when nothing is active.
          left: item ? item.x : -9999,
          top: item ? item.y : -9999,
          color: item?.color ?? 'transparent',
          fontSize: item?.size ?? 20,
          caretColor: item?.color ?? 'transparent',
          minWidth: '8ch',
          width: 'auto',
          padding: 2,
          margin: -2,
          opacity: item ? 1 : 0,
        }}
      />
    );
  }),
);
