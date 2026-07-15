import { useEffect, useRef, useState } from 'react';
import type { PageMeta } from '../lib/documents';
import { pageInkKey, resolvePageTemplateId } from '../lib/documents';
import { ensureTemplateBitmap, getTemplateBitmap } from '../lib/templates';
import { loadContent } from '../hooks/useLocalStorage';
import { A4_BOUNDS } from '../lib/geometry';
import { renderAll } from '../lib/render';
import { ConfirmDialog } from './Dialog';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from './icons';

interface PageNavProps {
  docId: string;
  pages: PageMeta[];
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
  onDeleteActive: () => void;
  /** Doc-level default template — resolution input for inheriting pages. */
  defaultTemplateId?: string;
  /** Opens the page-template picker for the active page. */
  onOpenTemplates?: () => void;
  /** Commits a full reordering of the thumbnail rail (drag-to-reorder). */
  onReorder?: (orderedIds: string[]) => void;
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
 * `paper` is included because the thumb now renders it; the resolved template
 * id AND its decode readiness are included so a thumb rendered on the
 * paper-fallback frame regenerates once the bitmap lands (readiness flips
 * 0→1 → cache miss → re-render with the template).
 */
function fingerprint(raw: string | null, paper: string, templateId: string | null): string {
  const tpl = templateId ? `${templateId}:${getTemplateBitmap(templateId) ? 1 : 0}` : 'plain';
  return `${paper}:${tpl}:${raw?.length ?? 0}:${raw ? raw.slice(-40) : ''}`;
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
function renderThumb(docId: string, page: PageMeta, templateId: string | null): string | null {
  const raw = rawInk(docId, page.id);
  const fp = fingerprint(raw, page.paper, templateId);
  const cached = thumbCache.get(page.id);
  if (cached && cached.fp === fp) return cached.url;

  const { strokes, shapes } = raw
    ? loadContent(pageInkKey(docId, page.id))
    : { strokes: [], shapes: [] };

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
  renderAll(ctx, strokes, pageW, pageH, { paper: page.paper, templateId, shapes });

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

function Thumb({
  docId,
  page,
  active,
  index,
  defaultTemplateId,
  onSelect,
  draggable,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  docId: string;
  page: PageMeta;
  active: boolean;
  index: number;
  defaultTemplateId?: string;
  onSelect: (id: string) => void;
  draggable: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [url, setUrl] = useState<string | null>(() => thumbCache.get(page.id)?.url ?? null);

  // Generate/refresh off the critical path — never during a page flip's paint.
  // `page` identity churns on every refresh; the raw-string fingerprint makes
  // those re-runs near-free when nothing changed.
  useEffect(() => {
    return scheduleIdle(() => {
      const templateId = resolvePageTemplateId(defaultTemplateId, page);
      setUrl(renderThumb(docId, page, templateId));
      // Bitmap not decoded yet → the thumb above rendered the paper fallback.
      // Ensure the decode, then regenerate: the readiness bit in the
      // fingerprint flips, so this is a cache miss that re-renders with the
      // template, not a wasted repaint.
      if (templateId && !getTemplateBitmap(templateId)) {
        void ensureTemplateBitmap(templateId).then((bmp) => {
          if (bmp) setUrl(renderThumb(docId, page, templateId));
        });
      }
    });
  }, [docId, page, active, defaultTemplateId]); // `active` retriggers on flip-away so edits appear

  return (
    <button
      type="button"
      aria-label={`Page ${index + 1}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(page.id)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={[
        'relative shrink-0 overflow-hidden rounded-md border transition-colors',
        active
          ? 'border-brand-500 ring-1 ring-brand-500/50'
          : 'border-border-strong hover:border-ink-400',
        isDragging ? 'opacity-40' : '',
        isDropTarget ? 'ring-2 ring-brand-500' : '',
      ].join(' ')}
      style={{ width: THUMB_W, height: THUMB_H, cursor: draggable ? 'grab' : undefined }}
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
  defaultTemplateId,
  onOpenTemplates,
  onReorder,
}: PageNavProps) {
  const [railOpen, setRailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const activeIndex = pages.findIndex((p) => p.id === activePageId);
  const railRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Jump-to-page (item #12): click the count to edit it directly, distinct
  // from the rail-toggle chevron beside it so the two actions never collide
  // on the same click target.
  const [editingIndex, setEditingIndex] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const jumpInputRef = useRef<HTMLInputElement>(null);

  // Keep the active thumb in view when flipping with the rail open.
  useEffect(() => {
    if (!railOpen || activeIndex < 0) return;
    railRef.current
      ?.children[activeIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [railOpen, activeIndex]);

  useEffect(() => {
    if (!editingIndex) return;
    jumpInputRef.current?.focus();
    jumpInputRef.current?.select();
  }, [editingIndex]);

  const startEditingIndex = () => {
    setJumpValue(String(activeIndex + 1));
    setEditingIndex(true);
  };

  const commitJump = () => {
    const n = Number(jumpValue);
    if (Number.isInteger(n) && n >= 1 && n <= pages.length) {
      onSelect(pages[n - 1].id);
    }
    setEditingIndex(false);
  };

  const commitReorder = (targetId: string) => {
    if (!onReorder || !dragId || dragId === targetId) return;
    const ids = pages.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    onReorder(next);
  };

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
              defaultTemplateId={defaultTemplateId}
              onSelect={onSelect}
              draggable={Boolean(onReorder)}
              isDragging={dragId === p.id}
              isDropTarget={dropTargetId === p.id && dragId !== p.id}
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setDropTargetId(p.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropTargetId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                commitReorder(p.id);
                setDragId(null);
                setDropTargetId(null);
              }}
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
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ‹
        </button>

        {editingIndex ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitJump();
            }}
            className="flex items-center gap-0.5 px-1"
          >
            <input
              ref={jumpInputRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={pages.length}
              value={jumpValue}
              aria-label={`Go to page, 1 to ${pages.length}`}
              onChange={(e) => setJumpValue(e.target.value)}
              onBlur={commitJump}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingIndex(false);
                }
              }}
              className="w-9 rounded-md border border-border-strong bg-bg px-1 py-0.5 text-center font-mono text-[12px] tabular-nums text-ink-900 outline-none focus:border-brand-500"
            />
            <span className="font-mono text-[12px] text-ink-400">/ {pages.length}</span>
          </form>
        ) : (
          <button
            type="button"
            aria-label={`Page ${activeIndex + 1} of ${pages.length}. Click to jump to a page.`}
            onClick={startEditingIndex}
            className="min-w-[52px] rounded-full px-1.5 py-2.5 font-mono text-[12px] tabular-nums text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10"
          >
            {activeIndex + 1} / {pages.length}
          </button>
        )}

        <button
          type="button"
          aria-label={railOpen ? 'Hide page thumbnails' : 'Show page thumbnails'}
          aria-expanded={railOpen}
          onClick={() => setRailOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10"
        >
          {railOpen ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}
        </button>

        <button
          type="button"
          aria-label="Next page"
          disabled={activeIndex >= pages.length - 1}
          onClick={onNext}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ›
        </button>

        <div className="mx-1 h-5 w-px self-center bg-border-strong" aria-hidden />

        {onOpenTemplates && (
          <button
            type="button"
            aria-label="Change page template"
            title="Page template"
            onClick={onOpenTemplates}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10"
          >
            {/* layered-pages glyph */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="6" y="3" width="12" height="16" rx="1.5" />
              <path d="M9 7h6M9 10.5h6M9 14h4" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <button
          type="button"
          aria-label="Add page after this one"
          onClick={onAdd}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10"
        >
          <PlusIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="Delete this page"
          onClick={() => setConfirmDelete(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10"
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