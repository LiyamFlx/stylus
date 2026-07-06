import { useEffect, useRef, useState } from 'react';
import type { PageMeta } from '../lib/documents';
import { pageInkKey } from '../lib/documents';
import { loadStrokes } from '../hooks/useLocalStorage';
import { inkBounds } from '../lib/geometry';
import { renderAll } from '../lib/render';
import { ConfirmDialog } from './Dialog';
import { PlusIcon, TrashIcon } from './icons';

interface PageNavProps {
  docId: string;
  pages: PageMeta[];
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
  onDeleteActive: () => void;
}

const THUMB_W = 44;
const THUMB_H = 62; // ≈ A4 portrait ratio

/**
 * Thumbnail cache: pageId → { fingerprint, dataURL }. Module-level so flips
 * between pages don't regenerate unchanged neighbors. The fingerprint is a
 * cheap content hash (stroke count + last stroke id) — enough to catch edits
 * without hashing point data.
 */
const thumbCache = new Map<string, { fp: string; url: string }>();

function fingerprint(strokes: ReturnType<typeof loadStrokes>): string {
  const last = strokes[strokes.length - 1];
  return `${strokes.length}:${last?.id ?? ''}:${last?.points.length ?? 0}`;
}

/**
 * Rasterize a page's strokes to a small dataURL — reads from storage, NOT the
 * live canvas, so it can't race a page unmount. Fits ink bounds into the thumb
 * with letterboxing.
 *
 * EXPORT-CLASS RENDER: intentionally no `cull` — a thumbnail is a miniature
 * export and must show the whole page (see RenderOptions.cull).
 */
function renderThumb(docId: string, page: PageMeta): string | null {
  const strokes = loadStrokes(pageInkKey(docId, page.id));
  const fp = fingerprint(strokes);
  const cached = thumbCache.get(page.id);
  if (cached && cached.fp === fp) return cached.url;

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = THUMB_W * dpr;
  canvas.height = THUMB_H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const b = inkBounds(strokes);
  if (b) {
    const pad = 6;
    const w = Math.max(b.maxX - b.minX, 1);
    const h = Math.max(b.maxY - b.minY, 1);
    const scale = Math.min((THUMB_W - pad * 2) / w, (THUMB_H - pad * 2) / h, 1);
    const ox = (THUMB_W - w * scale) / 2 - b.minX * scale;
    const oy = (THUMB_H - h * scale) / 2 - b.minY * scale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
  } else {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  renderAll(ctx, strokes, THUMB_W, THUMB_H, { paper: 'blank' });

  try {
    const url = canvas.toDataURL('image/png');
    thumbCache.set(page.id, { fp, url });
    return url;
  } catch {
    return null;
  }
}

function scheduleIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: 800 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 120);
  return () => clearTimeout(id);
}

function Thumb({ docId, page, active, index, onSelect }: {
  docId: string;
  page: PageMeta;
  active: boolean;
  index: number;
  onSelect: (id: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(() => thumbCache.get(page.id)?.url ?? null);

  // Generate/refresh off the critical path — never during a page flip's paint.
  useEffect(() => {
    return scheduleIdle(() => setUrl(renderThumb(docId, page)));
  }, [docId, page, active]); // `active` retriggers on flip-away so edits appear

  return (
    <button
      type="button"
      aria-label={`Page ${index + 1}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(page.id)}
      className={[
        'relative shrink-0 overflow-hidden rounded-md border transition-colors',
        active
          ? 'border-brand-500 ring-1 ring-brand-500/50'
          : 'border-border-strong hover:border-ink-400',
      ].join(' ')}
      style={{ width: THUMB_W, height: THUMB_H }}
    >
      {url ? (
        <img src={url} alt="" width={THUMB_W} height={THUMB_H} draggable={false} aria-hidden />
      ) : (
        <span className="absolute inset-0 bg-bg" aria-hidden />
      )}
      <span className="absolute bottom-0.5 right-1 font-mono text-[9px] text-ink-400">
        {index + 1}
      </span>
    </button>
  );
}

/**
 * Notebook page navigation: prev/next, `n / total` indicator, add + delete,
 * and an expandable thumbnail rail. Rendered only for notebook-mode documents.
 */
export function PageNav({
  docId,
  pages,
  activePageId,
  onSelect,
  onPrev,
  onNext,
  onAdd,
  onDeleteActive,
}: PageNavProps) {
  const [railOpen, setRailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const activeIndex = pages.findIndex((p) => p.id === activePageId);
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the active thumb in view when flipping with the rail open.
  useEffect(() => {
    if (!railOpen || activeIndex < 0) return;
    railRef.current
      ?.children[activeIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [railOpen, activeIndex]);

  if (pages.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2">
      {railOpen && (
        <div
          ref={railRef}
          className="pointer-events-auto flex max-w-[92vw] gap-2 overflow-x-auto rounded-panel border border-border bg-bg-muted/80 p-2 shadow-pop backdrop-blur-pill"
        >
          {pages.map((p, i) => (
            <Thumb
              key={p.id}
              docId={docId}
              page={p}
              index={i}
              active={p.id === activePageId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-bg-muted/80 px-2 py-1 shadow-pop backdrop-blur-pill">
        <button
          type="button"
          aria-label="Previous page"
          disabled={activeIndex <= 0}
          onClick={onPrev}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
        >
          ‹
        </button>

        <button
          type="button"
          aria-label={railOpen ? 'Hide page thumbnails' : 'Show page thumbnails'}
          aria-expanded={railOpen}
          onClick={() => setRailOpen((o) => !o)}
          className="min-w-[64px] rounded-full px-2 py-1 font-mono text-[12px] tabular-nums text-ink-700 transition-colors hover:bg-white/[0.06]"
        >
          {activeIndex + 1} / {pages.length}
        </button>

        <button
          type="button"
          aria-label="Next page"
          disabled={activeIndex >= pages.length - 1}
          onClick={onNext}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
        >
          ›
        </button>

        <div className="mx-1 h-5 w-px self-center bg-border-strong" aria-hidden />

        <button
          type="button"
          aria-label="Add page after this one"
          onClick={onAdd}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06]"
        >
          <PlusIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="Delete this page"
          onClick={() => setConfirmDelete(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06]"
        >
          <TrashIcon size={16} />
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this page?"
        message={`Page ${activeIndex + 1} and its ink will be permanently deleted.`}
        confirmLabel="Delete page"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          thumbCache.delete(activePageId ?? '');
          onDeleteActive();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
