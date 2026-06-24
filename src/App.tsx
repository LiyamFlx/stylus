import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { useDocuments } from './hooks/useDocuments';
import { loadProfile, saveProfile } from './lib/profile';
import type { PenSize, Tool } from './types';
import { PEN_SIZES, PRESET_COLORS } from './types';

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileName, setProfileName] = useState('You');

  const documents = useDocuments();

  useEffect(() => {
    setProfileName(loadProfile().name);
  }, []);

  const renameProfile = useCallback((name: string) => {
    setProfileName(name);
    saveProfile({ name });
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
    <div className="relative h-full w-full overflow-hidden bg-bg">
      {documents.currentId && (
        <Workspace
          key={documents.currentId}
          documentId={documents.currentId}
          tool={tool}
          color={color}
          size={size}
          onToolChange={setTool}
          onColorChange={setColor}
          onSizeChange={setSize}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        profileName={profileName}
        onRenameProfile={renameProfile}
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
