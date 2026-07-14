import { useEffect, useMemo, useState } from 'react';
import type { TemplateCategory, TemplateDef } from '../lib/templates';
import { loadTemplateManifest } from '../lib/templates';

/**
 * Template picker (Notebook Mode) — modal grid of the bundled page templates.
 *
 * Pure selection UI: owns zero document state. The caller persists the choice
 * (setPageTemplate / setDocumentTemplates) — same separation as ConfirmDialog.
 *
 * `mode='page'` filters to page-usable templates and offers "Plain" (null →
 * explicitly procedural paper); `mode='cover'` filters to cover-usable ones.
 */

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  paper: 'Paper',
  planner: 'Planners',
  tracker: 'Trackers',
  finance: 'Finance',
  list: 'Lists',
  cover: 'Covers',
};

interface TemplateGalleryProps {
  mode: 'page' | 'cover';
  /** Currently applied template (null = plain paper). */
  selectedId: string | null;
  onSelect: (templateId: string | null) => void;
  onClose: () => void;
}

export function TemplateGallery({ mode, selectedId, onSelect, onClose }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<TemplateDef[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<TemplateCategory | 'all'>('all');

  useEffect(() => {
    let live = true;
    loadTemplateManifest()
      .then((m) => {
        if (live) setTemplates(m.templates);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const usable = useMemo(
    () =>
      (templates ?? []).filter((t) =>
        mode === 'page' ? t.use !== 'cover' : t.use !== 'page',
      ),
    [templates, mode],
  );

  const categories = useMemo(() => [...new Set(usable.map((t) => t.category))], [usable]);

  const visible = useMemo(
    () => (filter === 'all' ? usable : usable.filter((t) => t.category === filter)),
    [usable, filter],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'page' ? 'Page template' : 'Notebook cover'}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-panel border border-border bg-bg-subtle shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">
              {mode === 'page' ? 'Page template' : 'Notebook cover'}
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              {mode === 'page'
                ? 'Sets this page’s background. Your ink stays put.'
                : 'Shown on this notebook and used for its new pages.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-900"
          >
            ✕
          </button>
        </div>

        {categories.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-5 py-2">
            {(['all', ...categories] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c as TemplateCategory | 'all')}
                className={[
                  'shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                  filter === c
                    ? 'bg-brand-600 text-white'
                    : 'bg-bg-muted text-ink-400 hover:text-ink-900',
                ].join(' ')}
              >
                {c === 'all' ? 'All' : CATEGORY_LABELS[c as TemplateCategory]}
              </button>
            ))}
          </div>
        )}

        <div className="grid flex-1 grid-cols-3 gap-3 overflow-y-auto p-5 sm:grid-cols-4 md:grid-cols-5">
          {mode === 'page' && (
            <TemplateCard name="Plain" selected={selectedId === null} onClick={() => onSelect(null)}>
              <div className="flex h-full w-full items-center justify-center bg-[#FDF6E3]">
                <div className="w-2/3 space-y-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-px bg-[#6b8abc]/40" />
                  ))}
                </div>
              </div>
            </TemplateCard>
          )}

          {templates === null &&
            !error &&
            [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="aspect-[210/297] animate-pulse rounded-md bg-bg-muted" />
            ))}

          {error && (
            <p className="col-span-full py-8 text-center text-xs text-ink-400">
              Couldn’t load templates. Check your connection and reopen this picker.
            </p>
          )}

          {visible.map((t) => (
            <TemplateCard
              key={t.id}
              name={t.name}
              selected={selectedId === t.id}
              onClick={() => onSelect(t.id)}
            >
              <TemplateThumb src={t.thumb} landscape={t.orientation === 'landscape'} />
            </TemplateCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Individual thumbnail with its own shimmer until the webp decodes — the
 *  manifest-level skeleton above only covers the gap before the JSON loads;
 *  each image still pops in on its own as the (cached, but not-yet-decoded
 *  on first visit) bitmap arrives. */
function TemplateThumb({ src, landscape }: { src: string; landscape: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className="relative block h-full w-full">
      {!loaded && (
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse rounded-md bg-bg-muted"
        />
      )}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={[
          'h-full w-full object-cover transition-opacity duration-200',
          loaded ? 'opacity-100' : 'opacity-0',
          landscape ? 'object-left' : '',
        ].join(' ')}
      />
    </span>
  );
}

function TemplateCard({
  name,
  selected,
  onClick,
  children,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group flex flex-col gap-1 text-left"
    >
      <span
        className={[
          'block aspect-[210/297] w-full overflow-hidden rounded-md border transition-colors',
          selected
            ? 'border-brand-500 ring-1 ring-brand-500/50'
            : 'border-border-strong group-hover:border-ink-400',
        ].join(' ')}
      >
        {children}
      </span>
      <span className="truncate text-[11px] leading-tight text-ink-400 group-hover:text-ink-900">
        {name}
      </span>
    </button>
  );
}
