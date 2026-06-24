import { useCallback, useEffect, useState } from 'react';
import type { DocMeta } from '../lib/documents';
import {
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
  create: (name?: string) => void;
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
    (name?: string) => {
      createDocument(name ?? 'Untitled', Date.now());
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
      const next = deleteDocument(id);
      if (next === null) {
        // Deleted the last document — recreate a fresh one.
        const idx = ensureIndex(Date.now());
        setDocs(idx.docs);
        setCurrentId(idx.currentId);
      } else {
        refresh();
      }
    },
    [refresh],
  );

  return { docs, currentId, select, create, rename, remove };
}
