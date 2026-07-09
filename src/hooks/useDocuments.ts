import { useCallback, useEffect, useState } from 'react';
import type { DocMeta, Folder } from '../lib/documents';
import type { AppMode } from '../lib/modes';
import {
  collectImageIds,
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  ensureIndex,
  getCurrentId,
  listDocuments,
  listFolders,
  moveDocumentToFolder,
  renameDocument,
  renameFolder,
  setCurrentId as persistCurrentId,
} from '../lib/documents';

export interface UseDocumentsResult {
  docs: DocMeta[];
  currentId: string | null;
  select: (id: string) => void;
  create: (name?: string, mode?: AppMode) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  folders: Folder[];
  createFolder: (name: string, parentId?: string) => void;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  moveToFolder: (docId: string, folderId?: string) => void;
}

/** React state over the local multi-document store. */
export function useDocuments(): UseDocumentsResult {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);

  const refresh = useCallback(() => {
    setDocs(listDocuments());
    setCurrentId(getCurrentId());
    setFolders(listFolders());
  }, []);

  useEffect(() => {
    // Create (or migrate to) a first document on first run.
    const idx = ensureIndex(Date.now());
    setDocs(idx.docs);
    setCurrentId(idx.currentId);
    setFolders(listFolders());
  }, []);

  const select = useCallback((id: string) => {
    persistCurrentId(id);
    setCurrentId(id);
  }, []);

  const create = useCallback(
    (name?: string, mode?: AppMode) => {
      createDocument(name ?? 'Untitled', Date.now(), mode);
      refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      renameDocument(id, name);
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    (id: string) => {
      // Collect BEFORE deletion (the aux keys are about to vanish), then
      // best-effort async cleanup of IndexedDB bitmaps.
      const imageIds = collectImageIds(id);
      if (imageIds.length > 0) {
        void import('../lib/imageStore').then((m) => m.deleteImages(imageIds));
      }
      // deleteDocument guarantees a document always remains (recreating one when
      // the last is deleted), so we can just re-read the store.
      deleteDocument(id);
      refresh();
    },
    [refresh],
  );

  const createFolderAction = useCallback(
    (name: string, parentId?: string) => {
      createFolder(name, Date.now(), parentId);
      refresh();
    },
    [refresh],
  );

  const renameFolderAction = useCallback(
    (id: string, name: string) => {
      renameFolder(id, name);
      refresh();
    },
    [refresh],
  );

  const removeFolder = useCallback(
    (id: string) => {
      deleteFolder(id);
      refresh();
    },
    [refresh],
  );

  const moveToFolder = useCallback(
    (docId: string, folderId?: string) => {
      moveDocumentToFolder(docId, folderId);
      refresh();
    },
    [refresh],
  );

  return {
    docs,
    currentId,
    select,
    create,
    rename,
    remove,
    folders,
    createFolder: createFolderAction,
    renameFolder: renameFolderAction,
    removeFolder,
    moveToFolder,
  };
}
