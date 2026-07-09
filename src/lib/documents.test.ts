import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  ensureIndex,
  getCurrentId,
  inkKey,
  listDocuments,
  listFolders,
  moveDocumentToFolder,
  readAux,
  renameDocument,
  renameFolder,
  setCurrentId,
  setDocumentTags,
  writeAux,
} from './documents';

const NOW = 1_000_000;

describe('documents', () => {
  beforeEach(() => localStorage.clear());

  describe('ensureIndex', () => {
    it('creates a first document on first run', () => {
      const idx = ensureIndex(NOW);
      expect(idx.docs).toHaveLength(1);
      expect(idx.currentId).toBe(idx.docs[0].id);
      expect(idx.docs[0].name).toBe('My notes');
    });

    it('is idempotent — a second call reuses the same index', () => {
      const a = ensureIndex(NOW);
      const b = ensureIndex(NOW + 5);
      expect(b.docs).toHaveLength(1);
      expect(b.docs[0].id).toBe(a.docs[0].id);
    });

    it('adopts a legacy single-drawing payload into the first document', () => {
      localStorage.setItem('stylus.ink.v1', JSON.stringify({ version: 1, strokes: [], savedAt: 0 }));
      const idx = ensureIndex(NOW);
      const id = idx.docs[0].id;
      expect(localStorage.getItem(inkKey(id))).not.toBeNull();
      expect(localStorage.getItem('stylus.ink.v1')).toBeNull(); // moved, not copied
    });
  });

  describe('create / list / current', () => {
    it('creates documents at the front and makes the new one current', () => {
      ensureIndex(NOW);
      const meta = createDocument('Sketches', NOW + 1);
      const docs = listDocuments();
      expect(docs[0].id).toBe(meta.id);
      expect(docs[0].name).toBe('Sketches');
      expect(getCurrentId()).toBe(meta.id);
    });

    it('falls back to "Untitled" for a blank name', () => {
      ensureIndex(NOW);
      const meta = createDocument('   ', NOW + 1);
      expect(meta.name).toBe('Untitled');
    });

    it('persists the selected document id', () => {
      const idx = ensureIndex(NOW);
      const second = createDocument('Second', NOW + 1);
      setCurrentId(idx.docs[0].id);
      expect(getCurrentId()).toBe(idx.docs[0].id);
      setCurrentId(second.id);
      expect(getCurrentId()).toBe(second.id);
    });
  });

  describe('rename', () => {
    it('renames a document, ignoring a blank name', () => {
      const idx = ensureIndex(NOW);
      const id = idx.docs[0].id;
      renameDocument(id, 'Journal');
      expect(listDocuments()[0].name).toBe('Journal');
      renameDocument(id, '   ');
      expect(listDocuments()[0].name).toBe('Journal'); // unchanged
    });
  });

  describe('delete', () => {
    it('removes the document and its payloads, returning the next current id', () => {
      const first = ensureIndex(NOW).docs[0];
      const second = createDocument('Second', NOW + 1);
      writeAux(second.id, { paper: 'grid', texts: [] });
      localStorage.setItem(inkKey(second.id), 'x');

      const next = deleteDocument(second.id);
      expect(next).toBe(first.id);
      expect(listDocuments().some((d) => d.id === second.id)).toBe(false);
      expect(localStorage.getItem(inkKey(second.id))).toBeNull();
    });

    it('creates a fresh replacement when the last document is deleted', () => {
      const only = ensureIndex(NOW).docs[0];
      const next = deleteDocument(only.id);
      // The store never drops to zero documents: a replacement is created and
      // returned as the new current id.
      const docs = listDocuments();
      expect(docs).toHaveLength(1);
      expect(docs[0].id).not.toBe(only.id);
      expect(next).toBe(docs[0].id);
    });
  });

  describe('aux (paper + texts)', () => {
    it('round-trips paper and text items', () => {
      const id = ensureIndex(NOW).docs[0].id;
      const texts = [{ id: 'a', x: 1, y: 2, text: 'hi', color: '#fff', size: 24 }];
      writeAux(id, { paper: 'dots', texts });
      const aux = readAux(id);
      expect(aux.paper).toBe('dots');
      expect(aux.texts).toEqual(texts);
    });

    it('defaults to blank paper + no texts when nothing is stored', () => {
      expect(readAux('missing')).toEqual({ paper: 'blank', texts: [], images: [] });
    });
  });

  describe('folders', () => {
    it('creates folders and lists them', () => {
      const a = createFolder('Work', NOW);
      const b = createFolder('School', NOW + 1);
      expect(listFolders().map((f) => f.id)).toEqual([a.id, b.id]);
    });

    it('supports nested subfolders via parentId', () => {
      const parent = createFolder('Classes', NOW);
      const child = createFolder('Physics 101', NOW + 1, parent.id);
      expect(listFolders().find((f) => f.id === child.id)?.parentId).toBe(parent.id);
    });

    it('falls back to "Untitled" for a blank name', () => {
      const f = createFolder('   ', NOW);
      expect(f.name).toBe('Untitled');
    });

    it('renames a folder', () => {
      const f = createFolder('Old', NOW);
      renameFolder(f.id, 'New');
      expect(listFolders().find((x) => x.id === f.id)?.name).toBe('New');
    });

    it('deleting a folder cascades to nested subfolders', () => {
      const parent = createFolder('Parent', NOW);
      const child = createFolder('Child', NOW, parent.id);
      const grandchild = createFolder('Grandchild', NOW, child.id);
      deleteFolder(parent.id);
      const remaining = listFolders().map((f) => f.id);
      expect(remaining).not.toContain(parent.id);
      expect(remaining).not.toContain(child.id);
      expect(remaining).not.toContain(grandchild.id);
    });

    it('deleting a folder unfiles any doc pointing at it (no dangling folderId)', () => {
      ensureIndex(NOW);
      const doc = createDocument('Note', NOW + 1);
      const folder = createFolder('Temp', NOW);
      moveDocumentToFolder(doc.id, folder.id);
      deleteFolder(folder.id);
      expect(listDocuments().find((d) => d.id === doc.id)?.folderId).toBeUndefined();
    });

    it('moves a document between folders and back to unfiled', () => {
      ensureIndex(NOW);
      const doc = createDocument('Note', NOW + 1);
      const folder = createFolder('Folder', NOW);
      moveDocumentToFolder(doc.id, folder.id);
      expect(listDocuments().find((d) => d.id === doc.id)?.folderId).toBe(folder.id);
      moveDocumentToFolder(doc.id);
      expect(listDocuments().find((d) => d.id === doc.id)?.folderId).toBeUndefined();
    });
  });

  describe('tags', () => {
    it('sets, dedupes, and trims tags', () => {
      ensureIndex(NOW);
      const doc = createDocument('Note', NOW + 1);
      setDocumentTags(doc.id, [' school ', 'urgent', 'urgent', '  ']);
      expect(listDocuments().find((d) => d.id === doc.id)?.tags).toEqual(['school', 'urgent']);
    });
  });
});
