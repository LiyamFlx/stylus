/**
 * ColoZoo v3 template bar — one white band across the bottom: illustrated
 * book covers evenly distributed around a centered "✨ SAVE MY ART! ✨" pill.
 * No left/right justify-between gaps: it's a single evenly-spaced row
 * (scrollable when narrow), pill always in the middle of the sequence.
 */

import type { ColozooBook } from '../../lib/colozoo/types';
import { COLOZOO_THEME } from '../../lib/colozoo/theme';

interface Props {
  books: ColozooBook[];
  activeBookId: string;
  onPickBook: (id: string) => void;
  onSave: () => void;
  glow?: boolean;
  /** Hide the SAVE pill (when the bar opens as a panel and SAVE lives in the
   *  collapsed bottom row already). */
  showSave?: boolean;
}

function BookThumb({ book, active, onClick, glow }: { book: ColozooBook; active: boolean; onClick: () => void; glow?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`${book.title} book`}
      aria-pressed={active}
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-1 transition-transform active:scale-95"
    >
      <span
        className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm"
        style={{
          outline: active ? `3px solid ${COLOZOO_THEME.teal}` : '1.5px solid #E2E8EA',
          outlineOffset: active ? 1 : 0,
        }}
      >
        {book.coverImg ? (
          <img src={book.coverImg} alt="" className="h-full w-full object-contain p-1" draggable={false} />
        ) : (
          <span className="text-3xl">{book.coverEmoji}</span>
        )}
      </span>
      <span className="text-xs font-extrabold" style={{ color: glow ? '#eee' : COLOZOO_THEME.ink }}>
        {book.title}
      </span>
    </button>
  );
}

export function ColozooTemplateBar({ books, activeBookId, onPickBook, onSave, glow, showSave = true }: Props) {
  const mid = Math.ceil(books.length / 2);
  const left = showSave ? books.slice(0, mid) : books;
  const right = showSave ? books.slice(mid) : [];
  return (
    <div
      className="flex items-center justify-evenly gap-3 overflow-x-auto rounded-3xl px-4 pb-2 pt-3 shadow-xl"
      style={{ background: glow ? '#160A2A' : COLOZOO_THEME.card }}
    >
      {left.map((b) => (
        <BookThumb key={b.id} book={b} active={b.id === activeBookId} onClick={() => onPickBook(b.id)} glow={glow} />
      ))}
      {showSave && (
        <button
          type="button"
          onClick={onSave}
          className="shrink-0 rounded-full px-7 py-3 text-base font-black tracking-wide text-white shadow-md transition-transform active:scale-95"
          style={{ background: COLOZOO_THEME.pill }}
        >
          ✨ SAVE MY ART! ✨
        </button>
      )}
      {right.map((b) => (
        <BookThumb key={b.id} book={b} active={b.id === activeBookId} onClick={() => onPickBook(b.id)} glow={glow} />
      ))}
    </div>
  );
}
