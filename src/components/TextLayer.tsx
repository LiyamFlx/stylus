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
  /** The active box's bottom edge in WORLD-Y, reported as it grows — lets the
   *  parent keep the writing position on a bounded page (notebook). */
  onActiveExtent?: (bottomWorldY: number) => void;
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
  onActiveExtent,
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
      // NOTE: clamp-to-0 assumes the page origin is the world origin — true for
      // notebook/mobile. Canvas Mode (infinite plane, negative coords) must
      // replace this with the mode's bounds policy or ink and text diverge.
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
      if (e.target !== e.currentTarget) return; // clicked a box, not empty space
      // If a box is being edited, an empty-space tap FINISHES it (like any
      // editor) instead of dropping a second box on top — that mismatch was the
      // bug. Only when nothing is active does a tap place a new box.
      if (activeId) {
        onSelect(null);
        return;
      }
      const w = toWorld(e.clientX, e.clientY);
      onCreate(w.x, w.y);
      focusInput();
    },
    [activeId, onSelect, onCreate, focusInput, toWorld],
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
        {items.map((item) => (
          // The active item stays MOUNTED but hidden instead of rendering null.
          // Selecting a box happens inside its own pointerdown (startDrag): if
          // selection unmounted the element, the browser would drop its pointer
          // capture on the first frame, killing the drag and stranding a stale
          // drag.current that later gestures would apply to the wrong box.
          // Pointer capture overrides hit-testing, so the hidden element keeps
          // receiving move/up while pointer-events:none keeps it out of the way
          // of the textarea for NEW pointerdowns.
          <TextBoxItem
            key={item.id}
            item={item}
            textMode={textMode}
            hiddenActive={item.id === activeId && textMode}
            onPointerDown={startDrag}
            onPointerMove={onItemMove}
            onPointerEnd={endDrag}
          />
        ))}

        {/* The single editing surface for the active box. Kept mounted in text
            mode (even with no active box) so it can be focused inside a tap. A
            drag handle lets you reposition it without fighting text selection. */}
        {textMode && (
          <ActiveTextArea
            ref={inputRef}
            item={activeItem}
            onEdit={onEdit}
            onDone={onDone}
            onExtent={onActiveExtent}
            onHandleDown={activeItem ? (e) => startDrag(e, activeItem) : undefined}
            onHandleMove={onItemMove}
            onHandleUp={endDrag}
          />
        )}
      </div>
    </div>
  );
}

interface TextBoxItemProps {
  item: TextItem;
  textMode: boolean;
  /** Item is being edited: keep the node (and any pointer capture it holds)
   *  alive, but invisible and transparent to new pointer events. */
  hiddenActive?: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, item: TextItem) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

const TextBoxItem = memo(function TextBoxItem({
  item,
  textMode,
  hiddenActive = false,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: TextBoxItemProps) {
  const interactive = textMode && !hiddenActive;
  return (
    <div
      onPointerDown={interactive ? (e) => onPointerDown(e, item) : undefined}
      // Move/end stay bound while hiddenActive: an in-flight capture from the
      // pre-selection pointerdown still delivers events here.
      onPointerMove={textMode ? onPointerMove : undefined}
      onPointerUp={textMode ? onPointerEnd : undefined}
      onPointerCancel={textMode ? onPointerEnd : undefined}
      // Any capture loss (unmount elsewhere, browser steal) must clear drag
      // state — a stale drag.current teleports whichever box is touched next.
      onLostPointerCapture={textMode ? onPointerEnd : undefined}
      className={[
        'absolute whitespace-pre-wrap break-words leading-tight',
        interactive ? 'pointer-events-auto cursor-move' : 'pointer-events-none',
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
        visibility: hiddenActive ? 'hidden' : undefined,
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
  /** Report the box's bottom edge (world-Y) as it auto-sizes. */
  onExtent?: (bottomWorldY: number) => void;
  /** Drag handle: move the active box without disturbing text selection. */
  onHandleDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandleMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandleUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

/**
 * One persistent transparent textarea, positioned over the active box. When no
 * box is active it's parked off-view but still mounted, so a placement tap can
 * focus it synchronously (mobile keyboard). All editing is native.
 */
const ActiveTextArea = memo(
  forwardRef<HTMLTextAreaElement, ActiveTextAreaProps>(function ActiveTextArea(
    { item, onEdit, onDone, onExtent, onHandleDown, onHandleMove, onHandleUp },
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
      // The textarea lives inside the world-transformed wrapper, so offsetHeight
      // is in world units — report the box's bottom so the page can follow it.
      if (item && onExtent) onExtent(item.y + el.offsetHeight);
    }, [item?.text, item?.size, item, onExtent]);

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
      <>
        {/* Drag handle: a small grip above the active box. Dragging it moves the
            box; the textarea itself keeps native text selection intact. */}
        {item && onHandleDown && (
          <div
            role="button"
            aria-label="Move text box"
            title="Drag to move"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onLostPointerCapture={onHandleUp}
            className="pointer-events-auto absolute flex cursor-move items-center justify-center rounded-full bg-brand-500 text-white shadow-soft"
            style={{
              left: item.x,
              // Above the box, but never above the layer's top edge (which is
              // clipped by overflow-hidden) — clamp so it's always grabbable.
              top: Math.max(2, item.y - 22),
              width: 22,
              height: 18,
              touchAction: 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
            </svg>
          </div>
        )}

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
            // Anchor to the layer's right edge so the WRAP WIDTH matches the
            // display div's shrink-to-fit bound (containing block minus x).
            // `width:auto` on a textarea resolves to the default cols (~20ch),
            // which made long text reflow on activate/deactivate.
            right: item ? 0 : 'auto',
            color: item?.color ?? 'transparent',
            fontSize: item?.size ?? 20,
            caretColor: item?.color ?? 'transparent',
            minWidth: '8ch',
            padding: 2,
            margin: -2,
            opacity: item ? 1 : 0,
          }}
        />
      </>
    );
  }),
);