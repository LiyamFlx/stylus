import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { useDocuments } from './hooks/useDocuments';
import { loadProfile, saveProfile } from './lib/profile';
import { EditingPrefsProvider } from './lib/editingPrefs';

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
  const [profileName, setProfileName] = useState('You');
  const [nightMode, setNightMode] = useState(false);
  const [stabilizer, setStabilizer] = useState(false);

  const documents = useDocuments();
  const currentDoc = documents.docs.find((d) => d.id === documents.currentId);

  useEffect(() => {
    const p = loadProfile();
    setProfileName(p.name);
    setNightMode(p.nightMode);
    setStabilizer(p.stabilizer);
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
          docs={documents.docs}
          currentId={documents.currentId}
          onSelectDoc={selectDoc}
          onNewDoc={newDoc}
          onRenameDoc={documents.rename}
          onDeleteDoc={documents.remove}
        />

        {/* Night Mode: a warm, dimming tint overlay. A fixed sibling (not a CSS
            filter on an ancestor) so it never forces the live-drawing canvas
            into a filtered composite layer — which can add ink latency on
            Safari. */}
        {nightMode && (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[100]"
            style={{ backgroundColor: 'rgba(255, 170, 80, 0.10)', mixBlendMode: 'multiply' }}
          />
        )}
      </div>
    </EditingPrefsProvider>
  );
}
