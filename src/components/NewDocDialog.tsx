import { useEffect, useMemo, useState } from 'react';
import type { AppMode } from '../lib/modes';
import { useDeviceClass } from '../hooks/useDeviceClass';
import type { TemplateDef } from '../lib/templates';
import { loadTemplateManifest } from '../lib/templates';

interface NewDocDialogProps {
  open: boolean;
  onCreate: (
    mode: AppMode,
    templates?: { coverTemplateId?: string; defaultPageTemplateId?: string },
  ) => void;
  onCancel: () => void;
}

/**
 * Mode picker for the "New document" flow. A document IS a mode — chosen at
 * creation, stored on DocMeta, never a global toggle. The device-class
 * suggestion is a preselected default only: the user always picks
 * (roadmap: "never silently force a mode").
 *
 * Notebook adds a second step: a cover/template strip. The choice binds at
 * creation (DocMeta.coverTemplateId + defaultPageTemplateId) — every page
 * inherits it via resolvePageTemplateId until individually overridden.
 * "Plain" (the preselected default) skips templates entirely, so the fast
 * path stays two clicks like the other modes.
 */
const MODE_CARDS: { mode: AppMode; title: string; blurb: string }[] = [
  { mode: 'canvas', title: 'Canvas', blurb: 'Infinite space for sketching and thinking. Pan, zoom, no edges.' },
  { mode: 'notebook', title: 'Notebook', blurb: 'A4 pages, ruled paper, page navigation. Made for class.' },
  { mode: 'mobile', title: 'Quick note', blurb: 'Typing-first capture, phone-shaped. Jot it down and go.' },
];

export function NewDocDialog({ open, onCreate, onCancel }: NewDocDialogProps) {
  const { suggestedMode } = useDeviceClass();
  const [step, setStep] = useState<'mode' | 'notebook-cover'>('mode');
  const [templates, setTemplates] = useState<TemplateDef[] | null>(null);
  const [coverId, setCoverId] = useState<string | null>(null);

  // Reset to step one every time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep('mode');
      setCoverId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  // Lazy-load the manifest only when the cover step is actually reached.
  useEffect(() => {
    if (step !== 'notebook-cover' || templates !== null) return;
    let live = true;
    loadTemplateManifest()
      .then((m) => {
        if (live) setTemplates(m.templates);
      })
      .catch(() => {
        // Manifest unreachable → the strip shows Plain only; creation still works.
        if (live) setTemplates([]);
      });
    return () => {
      live = false;
    };
  }, [step, templates]);

  const pageTemplates = useMemo(
    () => (templates ?? []).filter((t) => t.use !== 'cover'),
    [templates],
  );

  const pickMode = (mode: AppMode) => {
    if (mode === 'notebook') {
      setStep('notebook-cover');
      return;
    }
    onCreate(mode);
  };

  const createNotebook = () => {
    onCreate(
      'notebook',
      coverId ? { coverTemplateId: coverId, defaultPageTemplateId: coverId } : undefined,
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New document"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-panel border border-border bg-bg-subtle p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'mode' ? (
          <>
            <h2 className="mb-1 text-sm font-semibold text-ink-900">New document</h2>
            <p className="mb-4 text-xs text-ink-400">Pick how this one should feel — you can't change it later.</p>

            <div className="flex flex-col gap-2">
              {MODE_CARDS.map(({ mode, title, blurb }) => {
                const suggested = mode === suggestedMode;
                return (
                  <button
                    key={mode}
                    type="button"
                    autoFocus={suggested}
                    onClick={() => pickMode(mode)}
                    className={[
                      'rounded-lg border p-3 text-left transition-colors',
                      suggested
                        ? 'border-brand-500/60 bg-brand-500/[0.08] hover:bg-brand-500/[0.14]'
                        : 'border-border-strong hover:border-ink-400 hover:bg-white/[0.03]',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                      {title}
                      {suggested && (
                        <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300">
                          Suggested
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-400">{blurb}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="mt-4 w-full rounded-lg border border-border-strong py-2 text-xs text-ink-400 transition-colors hover:text-ink-900"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-sm font-semibold text-ink-900">Pick a cover</h2>
            <p className="mb-3 text-xs text-ink-400">
              New pages start with this template. Any page can switch later.
            </p>

            <div className="grid max-h-[46vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
              <CoverCard name="Plain" selected={coverId === null} onClick={() => setCoverId(null)}>
                <span className="flex h-full w-full items-center justify-center bg-[#FDF6E3]">
                  <span className="block w-2/3 space-y-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="block h-px bg-[#6b8abc]/40" />
                    ))}
                  </span>
                </span>
              </CoverCard>
              {templates === null &&
                [0, 1, 2].map((i) => (
                  <div key={i} className="aspect-[210/297] animate-pulse rounded-md bg-bg-muted" />
                ))}
              {pageTemplates.map((t) => (
                <CoverCard
                  key={t.id}
                  name={t.name}
                  selected={coverId === t.id}
                  onClick={() => setCoverId(t.id)}
                >
                  <img
                    src={t.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </CoverCard>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStep('mode')}
                className="flex-1 rounded-lg border border-border-strong py-2 text-xs text-ink-400 transition-colors hover:text-ink-900"
              >
                Back
              </button>
              <button
                type="button"
                autoFocus
                onClick={createNotebook}
                className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Create notebook
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CoverCard({
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
    <button type="button" onClick={onClick} aria-pressed={selected} className="group text-left">
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
      <span className="mt-1 block truncate text-[10px] leading-tight text-ink-400 group-hover:text-ink-900">
        {name}
      </span>
    </button>
  );
}
