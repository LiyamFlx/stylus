import { useCallback, useEffect, useState } from 'react';
import type { DocMeta } from '../lib/documents';
import type { AppMode } from '../lib/modes';
import {
  collectImageIds,
  createDocument,
  deleteDocument,
  ensureIndex,
  getCurrentId,
  listDocuments,
  renameDocument,
  setCurrentId as persistCurrentId,
} from '../lib/documents';

export interface UseDocumentsResult {
  docs: DocMeta[];
  currentId: string | null;
  select: (id: string) => void;
  create: (name?: string, mode?: AppMode) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

/** React state over the local multi-document store. */
export function useDocuments(): UseDocumentsResult {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setDocs(listDocuments());
    setCurrentId(getCurrentId());
  }, []);

  useEffect(() => {
    // Create (or migrate to) a first document on first run.
    const idx = ensureIndex(Date.now());
    setDocs(idx.docs);
    setCurrentId(idx.currentId);
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

  return { docs, currentId, select, create, rename, remove };
}
