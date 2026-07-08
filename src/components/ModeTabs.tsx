import { memo } from 'react';
import type { AppMode } from '../lib/modes';
import { PaperIcon, TypeIcon, PlusIcon, LassoIcon } from './icons';

interface ModeTabsProps {
  /** The mode of the currently-open document. */
  current: AppMode;
  /** Jump to that mode's last-used document (or create one). */
  onSwitch: (mode: AppMode) => void;
  /** Open a fresh document in the current mode (clean slate). */
  onNew: () => void;
}

const TABS: { mode: AppMode; label: string; short: string; Icon: typeof PaperIcon }[] = [
  { mode: 'canvas', label: 'Canvas', short: 'Canvas', Icon: LassoIcon },
  { mode: 'notebook', label: 'Notebook', short: 'Notes', Icon: PaperIcon },
  { mode: 'mobile', label: 'Quick note', short: 'Quick', Icon: TypeIcon },
];

/**
 * Browser-tab-style switcher for the three document modes. Each tab reopens
 * that mode's most-recently-touched document exactly as it was left; the "New"
 * button opens a fresh document in the current mode. Sits centred at the top,
 * below the toolbar, out of the way of the drawing surface.
 */
export const ModeTabs = memo(function ModeTabs({ current, onSwitch, onNew }: ModeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Document mode"
      className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-bg-muted/80 p-1 shadow-pop backdrop-blur-pill"
    >
      {TABS.map(({ mode, label, short, Icon }) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            title={label}
            aria-label={label}
            onClick={() => onSwitch(mode)}
            className={[
              'flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors',
              active
                ? 'bg-brand-500 text-white shadow-soft'
                : 'text-ink-700 hover:bg-white/[0.06] active:bg-white/10',
            ].join(' ')}
          >
            <Icon size={15} />
            {/* Full label on wider screens, short on tight ones. */}
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{short}</span>
          </button>
        );
      })}

      <span className="mx-0.5 h-5 w-px bg-border-strong" aria-hidden />

      <button
        type="button"
        title="New document (in this mode)"
        aria-label="New document in this mode"
        onClick={onNew}
        className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-brand-300 transition-colors hover:bg-brand-500/15 active:bg-brand-500/25"
      >
        <PlusIcon size={16} />
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  );
});
