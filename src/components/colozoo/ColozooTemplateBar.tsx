/**
 * ColoZoo template bar — the bottom book/template picker from the v3 mockup.
 * Illustrated thumbnails (inline SVG, emoji fallback) flank a centered
 * "SAVE MY ART!" pill. Picking a thumb switches the coloring book.
 *
 * Presentational only — book state + save live in the parent.
 */

import type { ColozooBook } from '../../lib/colozoo/types';
import { COLOZOO_THEME } from '../../lib/colozoo/theme';

interface ColozooTemplateBarProps {
  books: ColozooBook[];
  activeBookId: string;
  onPick: (bookId: string) => void;
  onSave: () => void;
  glow?: boolean;
}

export function ColozooTemplateBar({ books, activeBookId, onPick, onSave, glow }: ColozooTemplateBarProps) {
  // Split the books either side of the centered SAVE pill (matches the mockup).
  const mid = Math.ceil(books.length / 2);
  const left = books.slice(0, mid);
  const right = books.slice(mid);

  return (
    <div
      className="relative z-10 mx-6 mb-4 flex items-center gap-3 overflow-x-auto rounded-[2rem] px-5 py-3 shadow-lg"
      style={{ background: glow ? '#1b1226' : '#fff' }}
    >
      <div className="flex gap-3">
        {left.map((b) => (
          <TemplateThumb key={b.id} book={b} active={b.id === activeBookId} onPick={onPick} glow={glow} />
        ))}
      </div>

      <button
        type="button"
        onClick={onSave}
        className="mx-auto flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-8 py-4 text-xl font-semibold text-white transition-transform active:scale-95"
        style={{
          fontFamily: "'Fredoka', ui-rounded, system-ui, sans-serif",
          background: COLOZOO_THEME.teal,
          boxShadow: `0 8px 20px ${COLOZOO_THEME.tealDeep}80`,
        }}
      >
        ✨ SAVE MY ART! ✨
      </button>

      <div className="flex gap-3">
        {right.map((b) => (
          <TemplateThumb key={b.id} book={b} active={b.id === activeBookId} onPick={onPick} glow={glow} />
        ))}
      </div>
    </div>
  );
}

function TemplateThumb({
  book,
  active,
  onPick,
  glow,
}: {
  book: ColozooBook;
  active: boolean;
  onPick: (bookId: string) => void;
  glow?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={book.title}
      aria-pressed={active}
      onClick={() => onPick(book.id)}
      className="flex shrink-0 flex-col items-center gap-1 transition-transform active:scale-90"
    >
      <span
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl text-2xl"
        style={{
          background: glow ? '#2a2138' : '#F0F7F6',
          outline: active ? `3px solid ${COLOZOO_THEME.teal}` : 'none',
          outlineOffset: 2,
        }}
      >
        {book.thumbSvg ? (
          <svg viewBox="0 0 64 64" className="h-full w-full" dangerouslySetInnerHTML={{ __html: book.thumbSvg }} />
        ) : (
          book.coverEmoji
        )}
      </span>
      <span
        className="text-xs font-extrabold"
        style={{ color: glow ? '#fff' : '#5a6a6d' }}
      >
        {book.title}
      </span>
    </button>
  );
}
