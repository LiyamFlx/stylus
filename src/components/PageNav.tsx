import { useEffect, useRef, useState } from 'react';
import type { PageMeta } from '../lib/documents';
import { pageInkKey } from '../lib/documents';
import { loadStrokes } from '../hooks/useLocalStorage';
import { A4_BOUNDS } from '../lib/geometry';
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
const THUMB_H = 62; // ≈ A4 portrait ratio (0.7097 vs the page's 0.707)

/**
 * Thumbnail cache: pageId → { fingerprint, dataURL }. Module-level so flips
 * between pages don't regenerate unchanged neighbors. Capped LRU — page ids
 * from deleted docs would otherwise accumulate forever (same pattern as the
 * page-flip history cache in App).
 */
const THUMB_CACHE_MAX = 200;
const thumbCache = new Map<string, { fp: string; url: string }>();

function cacheThumb(pageId: string, fp: string, url: string): void {
  thumbCache.delete(pageId); // re-insert to refresh LRU position
  thumbCache.set(pageId, { fp, url });
  while (thumbCache.size > THUMB_CACHE_MAX) {
    const oldest = thumbCache.keys().next().value;
    if (oldest === undefined) break;
    thumbCache.delete(oldest);
  }
}

function rawInk(docId: string, pageId: string): string | null {
  try {
    return localStorage.getItem(pageInkKey(docId, pageId));
  } catch {
    return null;
  }
}

/**
 * Fingerprint from the RAW payload string — length plus the tail, which
 * contains `savedAt` (a perfect change signal: it only advances when strokes
 * were rewritten). The old fingerprint needed parsed strokes, which forced a
 * full JSON.parse of every page's ink on every rail render just to conclude
 * "unchanged" — the parse WAS the cost the cache existed to avoid.
 * `paper` is included because the thumb now renders it.
 */
function fingerprint(raw: string | null, paper: string): string {
  return `${paper}:${raw?.length ?? 0}:${raw ? raw.slice(-40) : ''}`;
}

/**
 * Rasterize a page to a small dataURL — reads from storage, NOT the live
 * canvas, so it can't race a page unmount.
 *
 * PAGE-SHAPED: the A4 page rect is fitted into the thumb and the page's real
 * paper is drawn, so a thumbnail looks like the page — stable framing that
 * doesn't rescale as ink is added. (Fitting INK bounds rendered one corner
 * dot as a giant centered blob and never showed the cream page at all.)
 *
 * EXPORT-CLASS RENDER: intentionally no `cull` — a thumbnail is a miniature
 * export and must show the whole page (see RenderOptions.cull).
 */
function renderThumb(docId: string, page: PageMeta): string | null {
  const raw = rawInk(docId, page.id);
  const fp = fingerprint(raw, page.paper);
  const cached = thumbCache.get(page.id);
  if (cached && cached.fp === fp) return cached.url;

  const strokes = raw ? loadStrokes(pageInkKey(docId, page.id)) : [];

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = THUMB_W * dpr;
  canvas.height = THUMB_H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const pageW = A4_BOUNDS.maxX - A4_BOUNDS.minX;
  const pageH = A4_BOUNDS.maxY - A4_BOUNDS.minY;
  const scale = Math.min(THUMB_W / pageW, THUMB_H / pageH);
  const ox = (THUMB_W - pageW * scale) / 2;
  const oy = (THUMB_H - pageH * scale) / 2;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
  renderAll(ctx, strokes, pageW, pageH, { paper: page.paper });

  try {
    const url = canvas.toDataURL('image/png');
    cacheThumb(page.id, fp, url);
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
  // `page` identity churns on every refresh; the raw-string fingerprint makes
  // those re-runs near-free when nothing changed.
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