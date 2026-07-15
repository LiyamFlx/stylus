import { useMemo, useState } from 'react';
import type { DocMeta, Folder } from '../lib/documents';
import { searchDocuments } from '../lib/documents';
import { initials } from '../lib/profile';
import {
  estimateLocalStorageUsage,
  formatBytes,
  STORAGE_WARNING_THRESHOLD,
} from '../lib/storageUsage';
import { ConfirmDialog, PromptDialog } from './Dialog';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  DocumentIcon,
  EditIcon,
  FolderIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
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
  folders: Folder[];
  onNewFolder: (name: string, parentId?: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveDoc: (docId: string, folderId?: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
}

/**
 * Left navigation drawer: local profile, the document/folder tree (new /
 * switch / rename / delete / move), and an about footer. Everything is
 * local — no account.
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
  folders,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveDoc,
  onTogglePin,
}: SidebarProps) {
  // Documents targeted by the rename / delete dialogs (null = closed).
  const [renaming, setRenaming] = useState<DocMeta | null>(null);
  const [deleting, setDeleting] = useState<DocMeta | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  // Folder to create a new subfolder under — null when creating at root,
  // and the prompt dialog is only open while this OR `creatingRootFolder`.
  const [newFolderParent, setNewFolderParent] = useState<Folder | 'root' | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragDocId, setDragDocId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | 'root' | null>(null);
  const [query, setQuery] = useState('');
  // Re-scans on every keystroke (documents.ts's searchDocuments is an
  // on-demand scan, no persisted index) — fine at local-notes volume, and
  // `docs` in the deps re-triggers a re-scan whenever content changes.
  const searchResults = useMemo(() => searchDocuments(query), [query, docs]);

  // Recomputed each time the drawer opens (and whenever the doc list changes
  // while it's open) rather than subscribed live — a synchronous scan over
  // every localStorage key is cheap, but there's no benefit to running it on
  // renders where the sidebar isn't even visible.
  const storageUsage = useMemo(
    () => (open ? estimateLocalStorageUsage() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, docs],
  );

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const childFolders = (parentId?: string) =>
    folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));

  const docsIn = (folderId?: string) =>
    docs.filter((d) => d.folderId === folderId).sort((a, b) => b.updatedAt - a.updatedAt);

  // Pinned/Recent (Phase 1 item #10) live above the folder tree regardless of
  // which folder a doc is filed in — pinning and organizing are independent.
  const pinnedDocs = useMemo(
    () =>
      docs
        .filter((d) => d.pinnedAt !== undefined)
        .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    [docs],
  );
  const RECENT_LIMIT = 5;
  const recentDocs = useMemo(
    () => [...docs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_LIMIT),
    [docs],
  );

  const handleDropOnFolder = (folderId?: string) => {
    if (dragDocId) onMoveDoc(dragDocId, folderId);
    setDragDocId(null);
    setDropTarget(null);
  };

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
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            {initials(profileName)}
          </div>
          <input
            type="text"
            enterKeyHint="done"
            autoCapitalize="words"
            aria-label="Your name"
            value={profileName}
            onChange={(e) => onRenameProfile(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm font-medium text-ink-900 outline-none focus:bg-white/[0.05]"
          />
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-400 hover:bg-white/[0.06] active:bg-white/10 hover:text-ink-900"
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="New folder"
              onClick={() => setNewFolderParent('root')}
              className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-400 hover:bg-white/[0.06] hover:text-ink-900"
            >
              <FolderIcon size={14} /> Folder
            </button>
            <button
              type="button"
              aria-label="New document"
              onClick={onNewDoc}
              className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-400 hover:bg-white/[0.06] hover:text-ink-900"
            >
              <PlusIcon size={14} /> New
            </button>
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-md border border-border bg-white/[0.04] py-1.5 pl-8 pr-7 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500/50"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-400 hover:text-ink-900"
              >
                <CloseIcon size={12} />
              </button>
            )}
          </div>
        </div>

        {!query.trim() && (pinnedDocs.length > 0 || recentDocs.length > 0) && (
          <div className="flex flex-col gap-3 px-2 pb-2 pt-3">
            {pinnedDocs.length > 0 && (
              <div>
                <p className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-eyebrow text-ink-400">
                  Pinned
                </p>
                <ul>
                  {pinnedDocs.map((doc) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      depth={0}
                      active={doc.id === currentId}
                      onSelectDoc={onSelectDoc}
                      onRenameDoc={setRenaming}
                      onDeleteDoc={setDeleting}
                      onTogglePin={onTogglePin}
                      dragDocId={dragDocId}
                      setDragDocId={setDragDocId}
                    />
                  ))}
                </ul>
              </div>
            )}
            {recentDocs.length > 0 && (
              <div>
                <p className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-eyebrow text-ink-400">
                  Recent
                </p>
                <ul>
                  {recentDocs.map((doc) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      depth={0}
                      active={doc.id === currentId}
                      onSelectDoc={onSelectDoc}
                      onRenameDoc={setRenaming}
                      onDeleteDoc={setDeleting}
                      onTogglePin={onTogglePin}
                      dragDocId={dragDocId}
                      setDragDocId={setDragDocId}
                    />
                  ))}
                </ul>
              </div>
            )}
            <div className="border-t border-border" />
          </div>
        )}

        {query.trim() ? (
          <ul className="flex-1 overflow-y-auto px-2 pb-4">
            {searchResults.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-ink-400">
                No notes match “{query.trim()}”
              </li>
            ) : (
              searchResults.map(({ doc, matchedIn, snippet }) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => onSelectDoc(doc.id)}
                    className={[
                      'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors',
                      doc.id === currentId ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <span className="flex w-full items-center gap-2">
                      <DocumentIcon size={14} className="shrink-0 text-ink-400" />
                      <span className="truncate text-sm text-ink-900">{doc.name}</span>
                    </span>
                    {matchedIn === 'content' && snippet && (
                      <span className="pl-[22px] text-xs text-ink-400">{snippet}</span>
                    )}
                    {matchedIn === 'tag' && (
                      <span className="pl-[22px] text-xs text-ink-400">
                        matched tag: {doc.tags?.find((t) => t.toLowerCase().includes(query.trim().toLowerCase()))}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul
            className="flex-1 overflow-y-auto px-2 pb-4"
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget('root');
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDropOnFolder(undefined);
            }}
          >
            {childFolders(undefined).map((folder) => (
              <FolderNode
                key={folder.id}
                folder={folder}
                depth={0}
                folders={folders}
                childFolders={childFolders}
                docsIn={docsIn}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                currentId={currentId}
                onSelectDoc={onSelectDoc}
                onRenameDoc={setRenaming}
                onDeleteDoc={setDeleting}
                onTogglePin={onTogglePin}
                onRenameFolder={setRenamingFolder}
                onDeleteFolder={setDeletingFolder}
                onNewSubfolder={setNewFolderParent}
                dragDocId={dragDocId}
                setDragDocId={setDragDocId}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                onDropOnFolder={handleDropOnFolder}
              />
            ))}

            {docsIn(undefined).map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                depth={0}
                active={doc.id === currentId}
                onSelectDoc={onSelectDoc}
                onRenameDoc={setRenaming}
                onDeleteDoc={setDeleting}
                onTogglePin={onTogglePin}
                dragDocId={dragDocId}
                setDragDocId={setDragDocId}
              />
            ))}

            {dropTarget === 'root' && (
              <li className="pointer-events-none mx-2 rounded-lg border border-dashed border-brand-500/60" />
            )}
          </ul>
        )}

        <div className="border-t border-border p-4 text-[11px] leading-relaxed text-ink-400">
          Stylus — write every thought, on every device. Saved locally on this
          device.
          {storageUsage && storageUsage.ratio >= STORAGE_WARNING_THRESHOLD && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-danger-text">
              <span aria-hidden>⚠</span>
              <span>
                Storage is {Math.round(storageUsage.ratio * 100)}% full (
                {formatBytes(storageUsage.usedBytes)} used). Export notes you
                want to keep, or delete old ones, to avoid losing new changes.
              </span>
            </p>
          )}
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

      <PromptDialog
        open={newFolderParent !== null}
        title="New folder"
        initialValue=""
        confirmLabel="Create"
        onConfirm={(name) => {
          if (name.trim()) {
            onNewFolder(name, newFolderParent === 'root' ? undefined : newFolderParent?.id);
          }
          setNewFolderParent(null);
        }}
        onCancel={() => setNewFolderParent(null)}
      />

      <PromptDialog
        open={renamingFolder !== null}
        title="Rename folder"
        initialValue={renamingFolder?.name ?? ''}
        confirmLabel="Rename"
        onConfirm={(name) => {
          if (renamingFolder) onRenameFolder(renamingFolder.id, name);
          setRenamingFolder(null);
        }}
        onCancel={() => setRenamingFolder(null)}
      />

      <ConfirmDialog
        open={deletingFolder !== null}
        title="Delete folder?"
        message={`“${deletingFolder?.name ?? ''}” and any subfolders will be deleted. Documents inside move back to Documents (unfiled), nothing is lost.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deletingFolder) onDeleteFolder(deletingFolder.id);
          setDeletingFolder(null);
        }}
        onCancel={() => setDeletingFolder(null)}
      />
    </>
  );
}

/** One folder row plus its recursively-rendered subfolders and documents. */
function FolderNode({
  folder,
  depth,
  folders,
  childFolders,
  docsIn,
  collapsed,
  onToggleCollapsed,
  currentId,
  onSelectDoc,
  onRenameDoc,
  onDeleteDoc,
  onTogglePin,
  onRenameFolder,
  onDeleteFolder,
  onNewSubfolder,
  dragDocId,
  setDragDocId,
  dropTarget,
  setDropTarget,
  onDropOnFolder,
}: {
  folder: Folder;
  depth: number;
  folders: Folder[];
  childFolders: (parentId?: string) => Folder[];
  docsIn: (folderId?: string) => DocMeta[];
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  currentId: string | null;
  onSelectDoc: (id: string) => void;
  onRenameDoc: (doc: DocMeta) => void;
  onDeleteDoc: (doc: DocMeta) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onNewSubfolder: (folder: Folder) => void;
  dragDocId: string | null;
  setDragDocId: (id: string | null) => void;
  dropTarget: string | 'root' | null;
  setDropTarget: (id: string | 'root' | null) => void;
  onDropOnFolder: (folderId?: string) => void;
}) {
  const isCollapsed = collapsed.has(folder.id);
  const subfolders = childFolders(folder.id);
  const contents = docsIn(folder.id);
  const isDropTarget = dropTarget === folder.id;

  return (
    <li className="group/folder">
      <div
        className={[
          'flex items-center gap-1 rounded-lg py-1.5 pr-1 transition-colors',
          isDropTarget ? 'bg-brand-500/15' : 'hover:bg-white/[0.04]',
        ].join(' ')}
        style={{ paddingLeft: 4 + depth * 16 }}
        onDragOver={(e) => {
          if (!dragDocId) return;
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(folder.id);
        }}
        onDragLeave={() => {
          if (isDropTarget) setDropTarget(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropOnFolder(folder.id);
        }}
      >
        <button
          type="button"
          aria-label={isCollapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
          onClick={() => onToggleCollapsed(folder.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-400 hover:text-ink-900"
        >
          {isCollapsed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
        </button>
        <FolderIcon size={15} className="shrink-0 text-ink-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-700">
          {folder.name}
        </span>
        <button
          type="button"
          aria-label={`New subfolder in ${folder.name}`}
          onClick={() => onNewSubfolder(folder)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-400 opacity-0 hover:bg-white/[0.08] hover:text-ink-900 focus:opacity-100 group-hover/folder:opacity-100"
        >
          <PlusIcon size={12} />
        </button>
        <button
          type="button"
          aria-label={`Rename ${folder.name}`}
          onClick={() => onRenameFolder(folder)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-400 opacity-0 hover:bg-white/[0.08] hover:text-ink-900 focus:opacity-100 group-hover/folder:opacity-100"
        >
          <EditIcon size={12} />
        </button>
        <button
          type="button"
          aria-label={`Delete ${folder.name}`}
          onClick={() => onDeleteFolder(folder)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-400 opacity-0 hover:bg-white/[0.08] hover:text-danger-text focus:opacity-100 group-hover/folder:opacity-100"
        >
          <TrashIcon size={12} />
        </button>
      </div>

      {!isCollapsed && (
        <ul>
          {subfolders.map((sub) => (
            <FolderNode
              key={sub.id}
              folder={sub}
              depth={depth + 1}
              folders={folders}
              childFolders={childFolders}
              docsIn={docsIn}
              collapsed={collapsed}
              onToggleCollapsed={onToggleCollapsed}
              currentId={currentId}
              onSelectDoc={onSelectDoc}
              onRenameDoc={onRenameDoc}
              onDeleteDoc={onDeleteDoc}
              onTogglePin={onTogglePin}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onNewSubfolder={onNewSubfolder}
              dragDocId={dragDocId}
              setDragDocId={setDragDocId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDropOnFolder={onDropOnFolder}
            />
          ))}
          {contents.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              depth={depth + 1}
              active={doc.id === currentId}
              onSelectDoc={onSelectDoc}
              onRenameDoc={onRenameDoc}
              onDeleteDoc={onDeleteDoc}
              onTogglePin={onTogglePin}
              dragDocId={dragDocId}
              setDragDocId={setDragDocId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** One document row — draggable onto any folder to file/move it. */
function DocRow({
  doc,
  depth,
  active,
  onSelectDoc,
  onRenameDoc,
  onDeleteDoc,
  onTogglePin,
  dragDocId,
  setDragDocId,
}: {
  doc: DocMeta;
  depth: number;
  active: boolean;
  onSelectDoc: (id: string) => void;
  onRenameDoc: (doc: DocMeta) => void;
  onDeleteDoc: (doc: DocMeta) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  dragDocId: string | null;
  setDragDocId: (id: string | null) => void;
}) {
  const pinned = doc.pinnedAt !== undefined;
  return (
    <li className="group">
      <div
        draggable
        onDragStart={() => setDragDocId(doc.id)}
        onDragEnd={() => setDragDocId(null)}
        className={[
          'flex items-center gap-2 rounded-lg py-2 pr-2 transition-colors',
          active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
          dragDocId === doc.id ? 'opacity-50' : '',
        ].join(' ')}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <button
          type="button"
          onClick={() => onSelectDoc(doc.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {doc.coverTemplateId ? (
            // Bound cover — the template thumb IS the doc icon. Static asset
            // path derived from the id (manifest layout is stable); if the
            // asset 404s the alt-less img collapses gracefully to nothing.
            <img
              src={`/templates/thumb/${doc.coverTemplateId}.webp`}
              alt=""
              width={16}
              height={22}
              loading="lazy"
              draggable={false}
              className={[
                'h-[22px] w-4 shrink-0 rounded-[3px] border object-cover',
                active ? 'border-brand-500' : 'border-border-strong',
              ].join(' ')}
            />
          ) : (
            <DocumentIcon
              size={16}
              className={active ? 'text-brand-500' : 'text-ink-400'}
            />
          )}
          <span
            className={[
              'truncate text-sm',
              active ? 'text-ink-900' : 'text-ink-700',
            ].join(' ')}
          >
            {doc.name}
          </span>
          {doc.mode === 'notebook' && (
            <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-400">
              {doc.pageCount ? `${doc.pageCount} pg` : 'Notebook'}
            </span>
          )}
          {doc.mode === 'mobile' && (
            <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-400">
              Note
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label={pinned ? `Unpin ${doc.name}` : `Pin ${doc.name}`}
          aria-pressed={pinned}
          onClick={() => onTogglePin(doc.id, !pinned)}
          className={[
            'flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.08] focus:opacity-100 group-hover:opacity-100',
            pinned ? 'text-brand-500 opacity-100' : 'text-ink-400 opacity-0 hover:text-ink-900',
          ].join(' ')}
        >
          <PinIcon size={13} />
        </button>
        <button
          type="button"
          aria-label={`Rename ${doc.name}`}
          onClick={() => onRenameDoc(doc)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 opacity-0 hover:bg-white/[0.08] hover:text-ink-900 focus:opacity-100 group-hover:opacity-100"
        >
          <EditIcon size={14} />
        </button>
        <button
          type="button"
          aria-label={`Delete ${doc.name}`}
          onClick={() => onDeleteDoc(doc)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 opacity-0 hover:bg-white/[0.08] hover:text-danger-text focus:opacity-100 group-hover:opacity-100"
        >
          <TrashIcon size={14} />
        </button>
      </div>
    </li>
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
