import { memo, useCallback, useEffect, useRef } from 'react';
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
  /** Finish editing (Escape / blur to empty). */
  onDone: () => void;
}

interface DragState {
  id: string;
  dx: number;
  dy: number;
}

/**
 * Overlay that renders the document's text boxes. Inactive boxes are
 * lightweight display divs; the ACTIVE box is a real, in-place `<textarea>`
 * (transparent, styled to match) so it gets all standard text editing for free
 * from the browser — cursor, double-click word select, drag-select, Cmd+C/V/X/A,
 * arrows, home/end — and, being a focused textarea, it summons the native OS
 * keyboard on phones (IME/autocorrect/emoji included).
 *
 * Positions are stored in *world* space (matching ink). A CSS transform on the
 * inner wrapper applies the canvas pan + zoom so boxes stay glued to the ink and
 * scale with it. Pointer coordinates are converted screen→world against the
 * UNTRANSFORMED root layer — never the transformed wrapper, whose bounding rect
 * already includes pan/zoom and would double-apply the transform.
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

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, item: TextItem) => {
      e.stopPropagation();
      onSelect(item.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      // Grab offset in world units, so the box doesn't jump under the cursor.
      const w = toWorld(e.clientX, e.clientY);
      drag.current = { id: item.id, dx: w.x - item.x, dy: w.y - item.y };
    },
    [onSelect, toWorld],
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
      // Tapping empty space places a new text box (in world coords).
      if (e.target === e.currentTarget) {
        const w = toWorld(e.clientX, e.clientY);
        onCreate(w.x, w.y);
      }
    },
    [onCreate, toWorld],
  );

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
          item.id === activeId && textMode ? (
            <ActiveTextBox key={item.id} item={item} onEdit={onEdit} onDone={onDone} />
          ) : (
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
        // Constant box model — padding+margin cancel so text never shifts on
        // the div ↔ textarea swap when the box is (de)activated.
        padding: 2,
        margin: -2,
      }}
    >
      {item.text || ' '}
    </div>
  );
});

interface ActiveTextBoxProps {
  item: TextItem;
  onEdit: (text: string) => void;
  onDone: () => void;
}

/**
 * The active box: a real transparent `<textarea>` in world space. Auto-focuses
 * on activation, auto-grows to its content, and hands ALL editing to the
 * browser (selection, clipboard, cursor, arrows). Escape finishes.
 */
const ActiveTextBox = memo(function ActiveTextBox({
  item,
  onEdit,
  onDone,
}: ActiveTextBoxProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus + put the caret at the end when the box becomes active.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  // Auto-size: grow the textarea to fit its content (both axes).
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autosize(ref.current);
  }, [item.text, item.size, autosize]);

  return (
    <textarea
      ref={ref}
      value={item.text}
      onChange={(e) => {
        onEdit(e.target.value);
        autosize(e.target);
      }}
      onKeyDown={(e) => {
        // Escape finishes; let every other key (incl. Enter, Cmd+C/V/X/A,
        // arrows) reach the browser's native textarea handling.
        if (e.key === 'Escape') {
          e.preventDefault();
          onDone();
        }
        e.stopPropagation(); // don't let the canvas' global keydown tool hotkeys fire
      }}
      // Keep pointer events on the textarea (canvas beneath is pen/eraser).
      onPointerDown={(e) => e.stopPropagation()}
      rows={1}
      spellCheck={false}
      autoCapitalize="sentences"
      aria-label="Edit text"
      className="pointer-events-auto absolute resize-none overflow-hidden whitespace-pre-wrap break-words rounded-sm border-0 bg-transparent leading-tight outline-none ring-2 ring-brand-500"
      style={{
        left: item.x,
        top: item.y,
        color: item.color,
        fontSize: item.size,
        caretColor: item.color,
        minWidth: '8ch',
        width: 'auto',
        padding: 2,
        margin: -2,
      }}
    />
  );
});
