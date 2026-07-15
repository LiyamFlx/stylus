import { useEffect, useState } from 'react';

/**
 * `?`-triggered keyboard shortcut legend (Phase 1 item #9).
 *
 * These shortcuts have always existed (Workspace.tsx's window keydown
 * handler) but were entirely invisible — no in-app surface listed them, so a
 * user had no way to discover ⌘Z or the letter-key tool switches short of
 * reading the source. This is a read-only reference, not a rebinding UI.
 *
 * Self-contained: owns its own `?` listener and open state rather than
 * threading open/onClose through App, since nothing else needs to control
 * when it's shown.
 */

interface ShortcutGroup {
  title: string;
  items: { keys: string; label: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Tools',
    items: [
      { keys: 'P or B', label: 'Pen' },
      { keys: 'E', label: 'Eraser' },
      { keys: 'S', label: 'Select' },
      { keys: 'T', label: 'Text' },
    ],
  },
  {
    title: 'Selection',
    items: [
      { keys: 'Delete or Backspace', label: 'Delete selected strokes' },
      { keys: 'Esc', label: 'Clear selection' },
    ],
  },
  {
    title: 'History',
    items: [
      { keys: '⌘Z / Ctrl+Z', label: 'Undo' },
      { keys: '⌘⇧Z / Ctrl+Y', label: 'Redo' },
    ],
  },
  {
    title: 'General',
    items: [
      { keys: '⌘V / Ctrl+V', label: 'Paste text onto the page' },
      { keys: 'Esc', label: 'Exit distraction-free mode' },
      { keys: '?', label: 'Show this legend' },
    ],
  },
];

export function ShortcutLegend(): React.ReactElement | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing) return;

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-legend-title"
    >
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-panel border border-border bg-bg-subtle p-5 shadow-pop">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="shortcut-legend-title" className="text-[15px] font-semibold text-ink-900">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-900"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-eyebrow text-ink-400">
                {group.title}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div
                    key={item.keys + item.label}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <span className="text-ink-700">{item.label}</span>
                    <kbd className="rounded-md border border-border-strong bg-bg-muted px-2 py-0.5 font-mono text-[11px] text-ink-900">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
