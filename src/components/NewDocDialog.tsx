import { useEffect } from 'react';
import type { AppMode } from '../lib/modes';
import { useDeviceClass } from '../hooks/useDeviceClass';

interface NewDocDialogProps {
  open: boolean;
  onCreate: (mode: AppMode) => void;
  onCancel: () => void;
}

/**
 * Mode picker for the "New document" flow. A document IS a mode — chosen at
 * creation, stored on DocMeta, never a global toggle. The device-class
 * suggestion is a preselected default only: the user always picks
 * (roadmap: "never silently force a mode").
 */
const MODE_CARDS: { mode: AppMode; title: string; blurb: string }[] = [
  { mode: 'canvas', title: 'Canvas', blurb: 'Infinite space for sketching and thinking. Pan, zoom, no edges.' },
  { mode: 'notebook', title: 'Notebook', blurb: 'A4 pages, ruled paper, page navigation. Made for class.' },
  { mode: 'mobile', title: 'Quick note', blurb: 'Typing-first capture, phone-shaped. Jot it down and go.' },
];

export function NewDocDialog({ open, onCreate, onCancel }: NewDocDialogProps) {
  const { suggestedMode } = useDeviceClass();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

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
                onClick={() => onCreate(mode)}
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
      </div>
    </div>
  );
}
