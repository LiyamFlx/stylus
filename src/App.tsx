import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { PageNav } from './components/PageNav';
import { NewDocDialog } from './components/NewDocDialog';
import { ModeTabs } from './components/ModeTabs';
import { InstallPrompt } from './components/InstallPrompt';
import { useVisualViewport } from './hooks/useVisualViewport';
import { useDocuments } from './hooks/useDocuments';
import { usePages } from './hooks/usePages';
import { modeConfig, defaultDocName } from './lib/modes';
import type { AppMode } from './lib/modes';
import type { HistorySnapshot } from './hooks/useHistory';
import type { Stroke } from './types';
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

  const documents = useDocuments();
  const currentDoc = documents.docs.find((d) => d.id === documents.currentId);
  const tour = useTour();

  // ── Notebook pagination (Phase 1) ──
  // Page state lives here — above Workspace — because flipping pages remounts
  // Workspace (keyed below), and the state must survive that.
  const isNotebook = currentDoc?.mode === 'notebook';
  const pagesApi = usePages(documents.currentId, isNotebook);

  // Page-flip undo/redo cache (capped LRU): flip to page 2 and back, and
  // Cmd+Z still works. Keyed per doc+page; cap keeps a 60-page notebook from
  // pinning 60 undo stacks in memory.
  const HISTORY_CACHE_MAX = 8;
  const historyCache = useRef(new Map<string, HistorySnapshot<Stroke[]>>());
  const cacheKey = useCallback(
    (pageId: string) => `${documents.currentId}:${pageId}`,
    [documents.currentId],
  );
  const cachePageHistory = useCallback(
    (pageId: string, snap: HistorySnapshot<Stroke[]>) => {
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

  const activePage = pagesApi.pages.find((p) => p.id === pagesApi.activePageId);
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
    (mode: AppMode) => {
      documents.create(defaultDocName(mode), mode);
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
            initialHistory={
              activePage
                ? historyCache.current.get(cacheKey(activePage.id))
                : undefined
            }
            onHistorySnapshot={cachePageHistory}
            pageNav={
              isNotebook && activePage ? (
                <PageNav
                  docId={documents.currentId}
                  pages={pagesApi.pages}
                  activePageId={pagesApi.activePageId}
                  onSelect={pagesApi.goTo}
                  onPrev={pagesApi.prev}
                  onNext={pagesApi.next}
                  onAdd={() => pagesApi.add()}
                  onDeleteActive={removeActivePage}
                />
              ) : undefined
            }
          />
        )}

        {/* Mode tabs: fast browser-tab switching between the three document
            modes, plus a New button. Top-centre, above the toolbar, so it's the
            same prominent control in every mode. */}
        {documents.currentId && (
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
          onDeleteDoc={documents.remove}
        />

        {isMobileDoc && <InstallPrompt />}

        <NewDocDialog
          open={newDocOpen}
          onCreate={createWithMode}
          onCancel={() => setNewDocOpen(false)}
        />

        <Tour controller={tour} />
      </div>
    </EditingPrefsProvider>
  );
}
