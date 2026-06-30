import { useState } from 'react';
import type { DocMeta } from '../lib/documents';
import { initials } from '../lib/profile';
import { ConfirmDialog, PromptDialog } from './Dialog';
import {
  CloseIcon,
  DocumentIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from './icons';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  profileName: string;
  onRenameProfile: (name: string) => void;
  nightMode: boolean;
  onToggleNightMode: () => void;
  stabilizer: boolean;
  onToggleStabilizer: () => void;
  onStartTour: () => void;
  docs: DocMeta[];
  currentId: string | null;
  onSelectDoc: (id: string) => void;
  onNewDoc: () => void;
  onRenameDoc: (id: string, name: string) => void;
  onDeleteDoc: (id: string) => void;
}

/**
 * Left navigation drawer: local profile, the document list (new / switch /
 * rename / delete), and an about footer. Everything is local — no account.
 */
export function Sidebar({
  open,
  onClose,
  profileName,
  onRenameProfile,
  nightMode,
  onToggleNightMode,
  stabilizer,
  onToggleStabilizer,
  onStartTour,
  docs,
  currentId,
  onSelectDoc,
  onNewDoc,
  onRenameDoc,
  onDeleteDoc,
}: SidebarProps) {
  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);

  // Documents targeted by the rename / delete dialogs (null = closed).
  const [renaming, setRenaming] = useState<DocMeta | null>(null);
  const [deleting, setDeleting] = useState<DocMeta | null>(null);

  const handleRename = (doc: DocMeta) => setRenaming(doc);
  const handleDelete = (doc: DocMeta) => setDeleting(doc);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={[
          'absolute inset-0 z-30 bg-black/40 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      <aside
        aria-label="Sidebar"
        // `inert` (not just aria-hidden) removes the off-screen sidebar from
        // both the a11y tree and the tab order when closed, so its buttons
        // aren't focusable behind the canvas. Spread so the attribute is fully
        // present/absent (React 18's JSX types don't include `inert`).
        {...(!open ? { inert: '' } : {})}
        className={[
          'absolute inset-y-0 left-0 z-40 flex w-[84vw] max-w-xs flex-col',
          'border-r border-border bg-bg-subtle shadow-pop transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Profile */}
        <div className="flex items-center gap-3 border-b border-border p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
            {initials(profileName)}
          </div>
          <input
            aria-label="Your name"
            value={profileName}
            onChange={(e) => onRenameProfile(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm font-medium text-ink-900 outline-none focus:bg-white/[0.05]"
          />
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-white/[0.06] hover:text-ink-900"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Preferences */}
        <ToggleRow label="Night Mode" on={nightMode} onToggle={onToggleNightMode} />
        <ToggleRow
          label="Stabilizer"
          on={stabilizer}
          onToggle={onToggleStabilizer}
        />
        <button
          type="button"
          onClick={onStartTour}
          className="mt-1 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-white/[0.05]"
        >
          Take the tour
        </button>

        {/* Documents */}
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-eyebrow text-brand-700">
            Documents
          </h2>
          <button
            type="button"
            aria-label="New document"
            onClick={onNewDoc}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-400 hover:bg-white/[0.06] hover:text-ink-900"
          >
            <PlusIcon size={14} /> New
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto px-2 pb-4">
          {sorted.map((doc) => {
            const active = doc.id === currentId;
            return (
              <li key={doc.id} className="group">
                <div
                  className={[
                    'flex items-center gap-2 rounded-lg px-2 py-2 transition-colors',
                    active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDoc(doc.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <DocumentIcon
                      size={16}
                      className={active ? 'text-brand-500' : 'text-ink-400'}
                    />
                    <span
                      className={[
                        'truncate text-sm',
                        active ? 'text-ink-900' : 'text-ink-700',
                      ].join(' ')}
                    >
                      {doc.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${doc.name}`}
                    onClick={() => handleRename(doc)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 opacity-0 hover:bg-white/[0.08] hover:text-ink-900 focus:opacity-100 group-hover:opacity-100"
                  >
                    <EditIcon size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => handleDelete(doc)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 opacity-0 hover:bg-white/[0.08] hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border p-4 text-[11px] leading-relaxed text-ink-400">
          Stylus — universal digital ink. Saved locally on this device.
        </div>
      </aside>

      <PromptDialog
        open={renaming !== null}
        title="Rename document"
        initialValue={renaming?.name ?? ''}
        confirmLabel="Rename"
        onConfirm={(name) => {
          if (renaming) onRenameDoc(renaming.id, name);
          setRenaming(null);
        }}
        onCancel={() => setRenaming(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete document?"
        message={`“${deleting?.name ?? ''}” will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleting) onDeleteDoc(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** A labeled on/off switch row used for sidebar preferences. */
function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="mt-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-900 transition-colors hover:bg-white/[0.05]"
    >
      <span className="font-medium">{label}</span>
      <span
        className={[
          'relative h-5 w-9 rounded-full transition-colors',
          on ? 'bg-brand-500' : 'bg-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            on ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
        />
      </span>
    </button>
  );
}
