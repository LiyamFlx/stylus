import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { PageNav } from './components/PageNav';
import { NewDocDialog } from './components/NewDocDialog';
import { ModeTabs } from './components/ModeTabs';
import { InstallPrompt } from './components/InstallPrompt';
import { OfflineBadge } from './components/OfflineBadge';
import { ShortcutLegend } from './components/ShortcutLegend';
import { useVisualViewport } from './hooks/useVisualViewport';
import { useDocuments } from './hooks/useDocuments';
import { usePages } from './hooks/usePages';
import { useSync } from './hooks/useSync';
import { modeConfig, defaultDocName } from './lib/modes';
import type { AppMode } from './lib/modes';
import { resolvePageTemplateId, readAux, readPageAux } from './lib/documents';
import { queuePush } from './lib/syncQueue';
import { TemplateGallery } from './components/TemplateGallery';
import type { HistorySnapshot } from './hooks/useHistory';
import type { DrawingContent } from './hooks/useLocalStorage';
import { loadProfile, saveProfile } from './lib/profile';
import { EditingPrefsProvider } from './lib/editingPrefs';
import { Tour } from './components/Tour';
import { useTour } from './hooks/useTour';

/**
 * App shell: owns the local profile, the persisted prefs (Night Mode,
 * stabilizer), and the sidebar. Transient editing prefs (tool / color / size /
 * pen type) live in EditingPrefsProvider so the toolbar and drawing engine read
 * them from context instead of being prop-drilled. The editor lives in
 * <Workspace>, keyed by the current document id so switching documents
 * re-mounts it with that document's strokes, paper, and text.
 */
export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Seed prefs from the persisted profile synchronously so night mode doesn't
  // flash off for one frame on load.
  const [profileName, setProfileName] = useState(() => loadProfile().name);
  const [nightMode, setNightMode] = useState(() => loadProfile().nightMode);
  const [stabilizer, setStabilizer] = useState(() => loadProfile().stabilizer);
  // Exam lock lives here (above Workspace, which remounts per page/doc) so the
  // lock survives page flips — a lock that reset on every flip wasn't a lock.
  const [examLock, setExamLock] = useState(false);
  // Mirror of Workspace's distraction-free state, so the mode tabs (rendered
  // here, outside Workspace) also hide when chrome is hidden.
  const [chromeHidden, setChromeHidden] = useState(false);

  const documents = useDocuments();
  const currentDoc = documents.docs.find((d) => d.id === documents.currentId);
  const tour = useTour();
  // Mounted once here, not inside Workspace — Workspace remounts on every
  // notebook page flip, but the sync queue drain loop must survive that
  // (ADR 002 / roadmap instruction).
  useSync();

  // Exam lock is per-document: clear it whenever the active document changes so
  // it never carries into another doc.
  useEffect(() => {
    setExamLock(false);
  }, [documents.currentId]);

  // ── Notebook pagination (Phase 1) ──
  // Page state lives here — above Workspace — because flipping pages remounts
  // Workspace (keyed below), and the state must survive that.
  const isNotebook = currentDoc?.mode === 'notebook';
  const pagesApi = usePages(documents.currentId, isNotebook);

  // Workspace remounts reset its internal distraction-free state to "chrome
  // visible", but nothing inside the old instance tells us that — without this
  // reset the mirror can stick at `true` and hide ModeTabs permanently. If
  // Workspace also notifies on mount, its notification lands after and agrees.
  useEffect(() => {
    setChromeHidden(false);
  }, [documents.currentId, pagesApi.activePageId]);

  // Page-flip undo/redo cache (capped LRU): flip away and back, and Cmd+Z still
  // works. Keyed per doc+page; cap keeps a big notebook from pinning every
  // undo stack in memory. Raised from 8 so typical multi-page sessions don't
  // silently lose undo history when revisiting an earlier page. Snapshots are
  // small (stroke arrays), so this is cheap.
  const HISTORY_CACHE_MAX = 32;
  const historyCache = useRef(new Map<string, HistorySnapshot<DrawingContent>>());
  const cacheKey = useCallback(
    (pageId: string) => `${documents.currentId}:${pageId}`,
    [documents.currentId],
  );
  const cachePageHistory = useCallback(
    (pageId: string, snap: HistorySnapshot<DrawingContent>) => {
      const cache = historyCache.current;
      const key = cacheKey(pageId);
      cache.delete(key); // re-insert to refresh LRU position
      cache.set(key, snap);
      while (cache.size > HISTORY_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    },
    [cacheKey],
  );
  const removeActivePage = useCallback(() => {
    // Evict the deleted page's cached history so a recreated page id can never
    // be seeded with a dead page's stacks.
    if (pagesApi.activePageId) {
      historyCache.current.delete(cacheKey(pagesApi.activePageId));
    }
    pagesApi.removeActive();
  }, [pagesApi, cacheKey]);

  // Deleting a document must evict ALL of its pages' snapshots, not just the
  // active one: dead entries occupy LRU slots and push out LIVE pages' undo
  // stacks (a 20-page notebook deletion would flush most of the cache), while
  // pinning the dead doc's stroke arrays in memory until natural eviction.
  const deleteDoc = useCallback(
    (id: string) => {
      const cache = historyCache.current;
      const prefix = `${id}:`;
      for (const key of [...cache.keys()]) {
        if (key.startsWith(prefix)) cache.delete(key);
      }
      documents.remove(id);
    },
    [documents],
  );

  const activePage = pagesApi.pages.find((p) => p.id === pagesApi.activePageId);
  // Resolved (never raw) template for the active page — inherit → override →
  // plain, one rule (documents.ts resolvePageTemplateId).
  const activeTemplateId = activePage
    ? resolvePageTemplateId(currentDoc?.defaultPageTemplateId, activePage)
    : null;
  // Page-template picker; lives here (not Workspace) because applying a
  // template mutates PageMeta, which pagesApi owns — same reason PageNav does.
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const docModeConfig = modeConfig(currentDoc?.mode);
  const isMobileDoc = docModeConfig.id === 'mobile';
  // Keyboard-safe layout height (--vvh) — only mobile-mode docs consume it.
  useVisualViewport(isMobileDoc);
  const paletteOverride = docModeConfig.paletteOverride ?? undefined;

  // Auto-run the onboarding tour once for first-time visitors.
  useEffect(() => {
    tour.maybeAutostart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // saveProfile merges over the stored profile, so each setter persists only
  // its own field — no stale-closure overwrite of the others.
  const renameProfile = useCallback((name: string) => {
    setProfileName(name);
    saveProfile({ name });
  }, []);

  const toggleNightMode = useCallback(() => {
    setNightMode((on) => {
      const next = !on;
      saveProfile({ nightMode: next });
      return next;
    });
  }, []);

  const toggleStabilizer = useCallback(() => {
    setStabilizer((on) => {
      const next = !on;
      saveProfile({ stabilizer: next });
      return next;
    });
  }, []);

  const selectDoc = useCallback(
    (id: string) => {
      documents.select(id);
      setSidebarOpen(false);
    },
    [documents],
  );

  // "New document" opens the mode picker; the document is created with the
  // chosen mode (a document IS a mode — DocMeta.mode, set at creation).
  const [newDocOpen, setNewDocOpen] = useState(false);
  const newDoc = useCallback(() => {
    setNewDocOpen(true);
    setSidebarOpen(false);
  }, []);
  const createWithMode = useCallback(
    (
      mode: AppMode,
      templates?: { coverTemplateId?: string; defaultPageTemplateId?: string },
    ) => {
      documents.create(defaultDocName(mode), mode, templates);
      setNewDocOpen(false);
    },
    [documents],
  );

  // ── Mode tabs (browser-tab behaviour) ──
  // Switching to a mode reopens that mode's most-recently-touched document,
  // exactly as it was left (docs persist their full state). If none exists yet,
  // one is created. `updatedAt` is the recency signal — no extra storage.
  const currentMode = docModeConfig.id;
  const switchToMode = useCallback(
    (mode: AppMode) => {
      if (mode === currentMode) return;
      const latest = documents.docs
        .filter((d) => d.mode === mode)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (latest) {
        documents.select(latest.id);
      } else {
        documents.create(defaultDocName(mode), mode);
      }
    },
    [currentMode, documents],
  );

  // "NEW" — save the current doc (it auto-persists) and open a fresh one in the
  // SAME mode, giving a clean slate without leaving the current workspace type.
  const newInCurrentMode = useCallback(() => {
    documents.create(defaultDocName(currentMode), currentMode);
  }, [currentMode, documents]);

  // Fires only after a debounced local save has already landed (ADR 002 /
  // useDrawing's onStrokesSaved contract) — enqueues the same edit for sync,
  // never a substitute for the local write that already happened. Reads
  // meta fresh from documents.ts rather than closing over `currentDoc`/
  // `activePage` so a save that lands after those have moved on (e.g. a
  // flush during a doc switch) still queues the RIGHT doc/page's current
  // metadata, not a stale snapshot from an earlier render.
  const queueSyncPush = useCallback(
    (docId: string, pageId: string | null, content: DrawingContent, savedAt: number) => {
      // Shapes ride inside `meta` (an open JSONB bag server-side) rather than
      // a new sync-schema column — the ADR 002 schema predates the shape
      // tool, and meta.shapes keeps the wire format and API routes
      // untouched instead of requiring a migration for a field that isn't
      // core document identity.
      if (pageId) {
        const pages = pagesApi.pages;
        const page = pages.find((p) => p.id === pageId);
        if (!page) return;
        queuePush({
          kind: 'page',
          id: pageId,
          documentId: docId,
          updatedAt: savedAt,
          meta: { ...page, aux: readPageAux(docId, pageId), shapes: content.shapes },
          strokes: content.strokes,
        });
      } else {
        const doc = documents.docs.find((d) => d.id === docId);
        if (!doc) return;
        queuePush({
          kind: 'document',
          id: docId,
          updatedAt: savedAt,
          meta: { ...doc, aux: readAux(docId), shapes: content.shapes },
          strokes: content.strokes,
        });
      }
    },
    [documents.docs, pagesApi.pages],
  );

  return (
    <EditingPrefsProvider>
      <div
        className="relative h-full w-full overflow-hidden bg-bg"
        // iOS keyboards overlay 100% heights; visualViewport is the truth.
        style={isMobileDoc ? { height: 'var(--vvh, 100%)' } : undefined}
      >
        {documents.currentId && (!isNotebook || activePage) && (
          <Workspace
            // Page flips remount the editor — same mechanism as doc switches,
            // one level deeper (spec: "nothing new to invent").
            key={`${documents.currentId}:${activePage?.id ?? 'single'}`}
            documentId={documents.currentId}
            documentName={currentDoc?.name ?? 'Untitled'}
            stabilizer={stabilizer}
            nightMode={nightMode}
            onOpenSidebar={() => setSidebarOpen(true)}
            pageId={activePage?.id ?? null}
            paletteOverride={paletteOverride}
            toolbarVariant={docModeConfig.toolbarVariant}
            appMode={docModeConfig.id}
            pagePaper={activePage?.paper}
            pageTemplateId={activeTemplateId}
            initialHistory={
              activePage
                ? historyCache.current.get(cacheKey(activePage.id))
                : undefined
            }
            onHistorySnapshot={cachePageHistory}
            examLock={examLock}
            onToggleExamLock={
              isNotebook && activePage ? () => setExamLock((v) => !v) : undefined
            }
            onChromeHiddenChange={setChromeHidden}
            onSwipePrevPage={isNotebook && activePage && !examLock ? pagesApi.prev : undefined}
            onSwipeNextPage={isNotebook && activePage && !examLock ? pagesApi.next : undefined}
            onStrokesSaved={queueSyncPush}
            pageNav={
              // Hidden while locked so an exam can't be escaped by flipping pages.
              isNotebook && activePage && !examLock ? (
                <PageNav
                  docId={documents.currentId}
                  pages={pagesApi.pages}
                  activePageId={pagesApi.activePageId}
                  onSelect={pagesApi.goTo}
                  onPrev={pagesApi.prev}
                  onNext={pagesApi.next}
                  onAdd={() => pagesApi.add()}
                  onReorder={pagesApi.reorder}
                  onDeleteActive={removeActivePage}
                  defaultTemplateId={currentDoc?.defaultPageTemplateId}
                  onOpenTemplates={() => setTemplatePickerOpen(true)}
                />
              ) : undefined
            }
          />
        )}

        {/* Mode tabs: fast browser-tab switching between the three document
            modes, plus a New button. Top-centre, above the toolbar, so it's the
            same prominent control in every mode. */}
        {documents.currentId && !examLock && !chromeHidden && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
            <ModeTabs
              current={currentMode}
              onSwitch={switchToMode}
              onNew={newInCurrentMode}
            />
          </div>
        )}

        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          profileName={profileName}
          onRenameProfile={renameProfile}
          nightMode={nightMode}
          onToggleNightMode={toggleNightMode}
          stabilizer={stabilizer}
          onToggleStabilizer={toggleStabilizer}
          onStartTour={() => {
            setSidebarOpen(false);
            tour.start();
          }}
          docs={documents.docs}
          currentId={documents.currentId}
          onSelectDoc={selectDoc}
          onNewDoc={newDoc}
          onRenameDoc={documents.rename}
          onDeleteDoc={deleteDoc}
          folders={documents.folders}
          onNewFolder={documents.createFolder}
          onRenameFolder={documents.renameFolder}
          onDeleteFolder={documents.removeFolder}
          onMoveDoc={documents.moveToFolder}
          onTogglePin={documents.setPinned}
        />

        {isMobileDoc && <InstallPrompt />}
        <OfflineBadge />
        <ShortcutLegend />

        <NewDocDialog
          open={newDocOpen}
          onCreate={createWithMode}
          onCancel={() => setNewDocOpen(false)}
        />

        {templatePickerOpen && isNotebook && activePage && (
          <TemplateGallery
            mode="page"
            selectedId={activeTemplateId}
            onSelect={(templateId) => {
              pagesApi.setTemplate(templateId);
              setTemplatePickerOpen(false);
            }}
            onClose={() => setTemplatePickerOpen(false)}
          />
        )}

        <Tour controller={tour} />
      </div>
    </EditingPrefsProvider>
  );
}