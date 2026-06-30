import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { useDocuments } from './hooks/useDocuments';
import { loadProfile, saveProfile } from './lib/profile';
import type { PenSize, Tool } from './types';
import { PEN_SIZES, PRESET_COLORS } from './types';
import type { PenType } from './lib/penProfiles';

/**
 * App shell: owns the global editing prefs (tool/color/size), the local
 * profile, and the sidebar. The actual editor lives in <Workspace>, keyed by
 * the current document id so switching documents re-mounts it with that
 * document's strokes, paper, and text.
 */
export default function App() {
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [size, setSize] = useState<PenSize>(PEN_SIZES[1]);
  const [penType, setPenType] = useState<PenType>('fountain');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileName, setProfileName] = useState('You');
  const [nightMode, setNightMode] = useState(false);

  const documents = useDocuments();
  const currentDoc = documents.docs.find((d) => d.id === documents.currentId);

  useEffect(() => {
    const p = loadProfile();
    setProfileName(p.name);
    setNightMode(p.nightMode);
  }, []);

  // Apply Night Mode as a root class so the whole app dims/warms.
  useEffect(() => {
    document.documentElement.classList.toggle('night', nightMode);
  }, [nightMode]);

  const renameProfile = useCallback((name: string) => {
    setProfileName(name);
    saveProfile({ name, nightMode });
  }, [nightMode]);

  const toggleNightMode = useCallback(() => {
    setNightMode((on) => {
      const next = !on;
      saveProfile({ name: profileName, nightMode: next });
      return next;
    });
  }, [profileName]);

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
    <div className="relative h-full w-full overflow-hidden bg-bg">
      {documents.currentId && (
        <Workspace
          key={documents.currentId}
          documentId={documents.currentId}
          documentName={currentDoc?.name ?? 'Untitled'}
          tool={tool}
          color={color}
          size={size}
          penType={penType}
          onToolChange={setTool}
          onColorChange={setColor}
          onSizeChange={setSize}
          onPenTypeChange={setPenType}
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
        docs={documents.docs}
        currentId={documents.currentId}
        onSelectDoc={selectDoc}
        onNewDoc={newDoc}
        onRenameDoc={documents.rename}
        onDeleteDoc={documents.remove}
      />
    </div>
  );
}
