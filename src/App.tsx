import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { useDocuments } from './hooks/useDocuments';
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

  const newDoc = useCallback(() => {
    documents.create('Untitled');
    setSidebarOpen(false);
  }, [documents]);

  return (
    <EditingPrefsProvider>
      <div className="relative h-full w-full overflow-hidden bg-bg">
        {documents.currentId && (
          <Workspace
            key={documents.currentId}
            documentId={documents.currentId}
            documentName={currentDoc?.name ?? 'Untitled'}
            stabilizer={stabilizer}
            nightMode={nightMode}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
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

        <Tour controller={tour} />
      </div>
    </EditingPrefsProvider>
  );
}
