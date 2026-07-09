import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TextItem, Tool } from '../types';
import { TEXT_FONT_STACKS, TEXT_FONTS } from '../types';
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
  /** Patch font/bold/italic/align/width on the active box — the format
   *  toolbar and resize handle both funnel through this. */
  onPatchActive?: (patch: Partial<TextItem>) => void;
}

/** CSS font-family stack + weight/style for a text item, with back-compat
 *  defaults for boxes saved before these fields existed. */
function textStyle(item: TextItem): { fontFamily: string; fontWeight: string; fontStyle: string; textAlign: TextItem['align'] } {
  return {
    fontFamily: TEXT_FONT_STACKS[item.font ?? 'sans'],
    fontWeight: item.bold ? '700' : '400',
    fontStyle: item.italic ? 'italic' : 'normal',
    textAlign: item.align ?? 'left',
  };
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
  onPatchActive,
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
            scale={view.scale}
            onEdit={onEdit}
            onDone={onDone}
            onExtent={onActiveExtent}
            onPatch={onPatchActive}
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
        width: item.width,
        color: item.color,
        fontSize: item.size,
        ...textStyle(item),
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
  /** Canvas zoom, so the resize handle converts screen-px drag deltas to
   *  world-space width deltas (independent of pan — only scale matters). */
  scale: number;
  onEdit: (text: string) => void;
  onDone: () => void;
  /** Report the box's bottom edge (world-Y) as it auto-sizes. */
  onExtent?: (bottomWorldY: number) => void;
  /** Patch font/bold/italic/align/width — format toolbar + resize handle. */
  onPatch?: (patch: Partial<TextItem>) => void;
  /** Drag handle: move the active box without disturbing text selection. */
  onHandleDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandleMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandleUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

const FONT_LABELS: Record<(typeof TEXT_FONTS)[number], string> = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Mono',
  hand: 'Hand',
};

/** Three horizontal bars, offset per alignment — a lightweight inline icon
 *  rather than pulling in the shared icon set for one-off use here. */
function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  const x = { left: [2, 2, 2], center: [3, 5, 3], right: [4, 8, 4] }[align];
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x={x[0]} y="3" width="10" height="1.6" rx="0.8" fill="currentColor" />
      <rect x={x[1]} y="7" width="7" height="1.6" rx="0.8" fill="currentColor" />
      <rect x={x[2]} y="11" width="10" height="1.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}

/** Toolbar button — shared look for the format popover's icon buttons. */
function FormatButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Format clicks must not steal focus from the textarea (losing the
      // caret would feel like the box "closed") — preventDefault on
      // pointerdown keeps focus in place; the click still fires normally.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors',
        active ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-white/[0.08]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/**
 * One persistent transparent textarea, positioned over the active box. When no
 * box is active it's parked off-view but still mounted, so a placement tap can
 * focus it synchronously (mobile keyboard). All editing is native.
 */
const ActiveTextArea = memo(
  forwardRef<HTMLTextAreaElement, ActiveTextAreaProps>(function ActiveTextArea(
    { item, scale, onEdit, onDone, onExtent, onPatch, onHandleDown, onHandleMove, onHandleUp },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const scaleRef = useRef(scale);
    scaleRef.current = scale;

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
    //
    // Width has two modes: AUTO (item.width undefined — the original
    // behavior, grows with content up to the page edge) and FIXED (item.width
    // set by dragging the resize handle — text rewraps within that width and
    // never auto-grows past it, like a real word-processor text frame).
    useLayoutEffect(() => {
      const el = localRef.current;
      if (!el) return;

      if (item?.width != null) {
        el.style.width = `${item.width}px`;
      } else {
        const parent = el.offsetParent as HTMLElement | null;
        const maxWidth = parent && item
          ? Math.max(parent.clientWidth - item.x - 2, 40)
          : Infinity;
        el.style.width = 'auto';
        const naturalWidth = el.scrollWidth;
        el.style.width = `${Math.min(naturalWidth, maxWidth)}px`;
      }

      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      // The textarea lives inside the world-transformed wrapper, so offsetHeight
      // is in world units — report the box's bottom so the page can follow it.
      if (item && onExtent) onExtent(item.y + el.offsetHeight);
    }, [item?.text, item?.size, item?.width, item, onExtent]);

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

    // Resize handle: drag the right edge to set a FIXED wrap width (switches
    // the box from auto-size to manual — see the layout effect above). Tracks
    // the gesture's start screen-X and start width in a ref (not state) since
    // this fires on every pointermove and must stay a stable callback.
    const resizeRef = useRef<{ startClientX: number; startWidth: number } | null>(null);
    const onResizeDown = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const el = localRef.current;
        if (!el) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        resizeRef.current = { startClientX: e.clientX, startWidth: el.offsetWidth };
      },
      [],
    );
    const onResizeMove = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const drag = resizeRef.current;
        if (!drag || !onPatch) return;
        // Screen-px delta must be converted to world units (÷ scale) — the
        // handle lives inside the pan/zoom-transformed wrapper, so a raw
        // client-px delta would resize too fast/slow away from 100% zoom.
        const deltaScreen = e.clientX - drag.startClientX;
        const deltaWorld = deltaScreen / (scaleRef.current || 1);
        onPatch({ width: Math.max(40, drag.startWidth + deltaWorld) });
      },
      [onPatch],
    );
    const onResizeUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      resizeRef.current = null;
    }, []);

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
            // Width is set imperatively by the layout effect above (grows with
            // content, capped at the space remaining to the layer's edge, OR
            // fixed once the resize handle has been dragged).
            color: item?.color ?? 'transparent',
            fontSize: item?.size ?? 20,
            ...(item ? textStyle(item) : null),
            caretColor: item?.color ?? 'transparent',
            minWidth: '8ch',
            padding: 2,
            margin: -2,
            opacity: item ? 1 : 0,
          }}
        />

        {/* Resize handle: bottom-right grip on the active box's right edge.
            Dragging sets a FIXED wrap width (item.width) — text rewraps
            within it instead of the box auto-growing with content. */}
        {item && onPatch && (
          <div
            role="button"
            aria-label="Resize text box width"
            title="Drag to resize"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            onLostPointerCapture={onResizeUp}
            className="pointer-events-auto absolute cursor-ew-resize rounded-full bg-brand-500/80 shadow-soft"
            style={{
              left: item.x + (localRef.current?.offsetWidth ?? 0) - 5,
              top: item.y + (localRef.current?.offsetHeight ?? item.size) / 2 - 5,
              width: 10,
              height: 10,
              touchAction: 'none',
            }}
          />
        )}

        {/* Floating format toolbar: font family, bold, italic, align. Shown
            above the drag handle so the two never overlap. */}
        {item && onPatch && (
          <div
            className="pointer-events-auto absolute flex items-center gap-0.5 rounded-lg border border-border bg-bg-muted/95 p-1 shadow-pop backdrop-blur-pill"
            style={{
              left: item.x,
              top: Math.max(2, item.y - 60),
            }}
            // Same rule as FormatButton: don't let toolbar taps steal focus
            // from the textarea mid-edit.
            onPointerDown={(e) => e.stopPropagation()}
          >
            <select
              aria-label="Font family"
              value={item.font ?? 'sans'}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onPatch({ font: e.target.value as TextItem['font'] })}
              className="h-7 rounded-md border-0 bg-transparent px-1 text-xs text-ink-700 outline-none hover:bg-white/[0.08]"
            >
              {TEXT_FONTS.map((f) => (
                <option key={f} value={f}>
                  {FONT_LABELS[f]}
                </option>
              ))}
            </select>
            <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <FormatButton
              label="Bold"
              active={item.bold}
              onClick={() => onPatch({ bold: !item.bold })}
            >
              B
            </FormatButton>
            <FormatButton
              label="Italic"
              active={item.italic}
              onClick={() => onPatch({ italic: !item.italic })}
            >
              <span style={{ fontStyle: 'italic' }}>I</span>
            </FormatButton>
            <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <FormatButton
              label="Align left"
              active={(item.align ?? 'left') === 'left'}
              onClick={() => onPatch({ align: 'left' })}
            >
              <AlignIcon align="left" />
            </FormatButton>
            <FormatButton
              label="Align center"
              active={item.align === 'center'}
              onClick={() => onPatch({ align: 'center' })}
            >
              <AlignIcon align="center" />
            </FormatButton>
            <FormatButton
              label="Align right"
              active={item.align === 'right'}
              onClick={() => onPatch({ align: 'right' })}
            >
              <AlignIcon align="right" />
            </FormatButton>
          </div>
        )}
      </>
    );
  }),
);