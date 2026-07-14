import { useEffect, useMemo, useRef, useState } from 'react';
import type { TextItem } from '../types';
import { CloseIcon } from './icons';

interface FindReplacePanelProps {
  open: boolean;
  texts: TextItem[];
  /** Apply a bulk rewrite of every text item's content in one commit (so
   *  undo/redo and persistence see one change, not N). */
  onReplaceAll: (next: TextItem[]) => void;
  onClose: () => void;
}

interface Hit {
  itemId: string;
  /** Character offset within that item's text. */
  offset: number;
}

/**
 * Find & replace across this document's text boxes (Quick Note Phase 2).
 * Scoped to what's already loaded in memory — the currently open document /
 * notebook page, matching how the rest of the editor treats "the open note".
 * Case-insensitive substring match, replace-one or replace-all.
 */
export function FindReplacePanel({ open, texts, onReplaceAll, onClose }: FindReplacePanelProps) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFind('');
      setReplace('');
      setCursor(0);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const q = find.toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    for (const item of texts) {
      const lower = item.text.toLowerCase();
      let from = 0;
      for (;;) {
        const idx = lower.indexOf(q, from);
        if (idx < 0) break;
        out.push({ itemId: item.id, offset: idx });
        from = idx + q.length;
      }
    }
    return out;
  }, [find, texts]);

  useEffect(() => {
    setCursor(0);
  }, [find]);

  if (!open) return null;

  const replaceOne = (hit: Hit) => {
    const next = texts.map((item) => {
      if (item.id !== hit.itemId) return item;
      return {
        ...item,
        text: item.text.slice(0, hit.offset) + replace + item.text.slice(hit.offset + find.length),
      };
    });
    onReplaceAll(next);
  };

  const replaceAll = () => {
    if (!find) return;
    // Case-insensitive global replace via split/join — avoids building a
    // RegExp from user input (no injection risk from special regex chars).
    const q = find.toLowerCase();
    const next = texts.map((item) => {
      const lower = item.text.toLowerCase();
      if (!lower.includes(q)) return item;
      let result = '';
      let rest = item.text;
      let restLower = lower;
      for (;;) {
        const idx = restLower.indexOf(q);
        if (idx < 0) {
          result += rest;
          break;
        }
        result += rest.slice(0, idx) + replace;
        rest = rest.slice(idx + find.length);
        restLower = restLower.slice(idx + find.length);
      }
      return { ...item, text: result };
    });
    onReplaceAll(next);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Find and replace"
      className="absolute right-4 top-20 z-50 w-[min(90vw,320px)] rounded-panel border border-border bg-bg-subtle p-3 shadow-pop"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-eyebrow text-brand-700">
          Find & replace
        </h2>
        <button
          type="button"
          aria-label="Close find and replace"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink-400 hover:bg-white/[0.06] hover:text-ink-900 active:bg-white/10"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="next"
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Find"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder="Find…"
        className="mb-2 w-full rounded-md border border-border bg-white/[0.04] px-2 py-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500/50"
      />
      <input
        type="text"
        enterKeyHint="done"
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Replace with"
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        placeholder="Replace with…"
        className="mb-2 w-full rounded-md border border-border bg-white/[0.04] px-2 py-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500/50"
      />

      <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
        <span>
          {find ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : 'Type to search'}
        </span>
        {hits.length > 0 && (
          <span>
            {cursor + 1} / {hits.length}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={hits.length === 0}
          onClick={() => setCursor((c) => (c + 1) % hits.length)}
          className="min-h-11 flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-700 hover:bg-white/[0.05] active:bg-white/10 disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          disabled={hits.length === 0}
          onClick={() => replaceOne(hits[cursor])}
          className="min-h-11 flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-700 hover:bg-white/[0.05] active:bg-white/10 disabled:opacity-40"
        >
          Replace
        </button>
        <button
          type="button"
          disabled={hits.length === 0}
          onClick={replaceAll}
          className="min-h-11 flex-1 rounded-md bg-brand-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-40"
        >
          Replace all
        </button>
      </div>
    </div>
  );
}
