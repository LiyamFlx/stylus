import type { PaperStyle, TextItem } from '../types';
import { createId } from './id';
import { resolveMode } from './modes';
import type { AppMode } from './modes';

/**
 * Local, offline-first multi-document store (no backend, no login).
 *
 * Layout in localStorage:
 *  - `stylus.docs.v1`            → the index: { currentId, docs: DocMeta[] }
 *  - `stylus.doc.v1.<id>.ink`   → that document's strokes (written by
 *                                  useLocalStorage / useDrawing)
 *  - `stylus.doc.v1.<id>.aux`   → that document's paper + text items
 *
 * Splitting strokes (large, hot path) from the lightweight aux/meta keeps the
 * index small and lets the drawing engine own stroke persistence unchanged.
 */

export interface DocMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Which face of the app this document uses (Phase 0). Required in memory;
   * legacy docs on disk lack it and are normalized to 'canvas' in readIndex —
   * the single choke point every read passes through, so no downstream
   * consumer ever sees an undefined mode.
   */
  mode: AppMode;
}

export interface DocAux {
  paper: PaperStyle;
  texts: TextItem[];
}

interface DocIndex {
  version: 1;
  currentId: string | null;
  docs: DocMeta[];
}

const INDEX_KEY = 'stylus.docs.v1';
const LEGACY_INK_KEY = 'stylus.ink.v1';

export const inkKey = (id: string) => `stylus.doc.v1.${id}.ink`;
const auxKey = (id: string) => `stylus.doc.v1.${id}.aux`;

const DEFAULT_AUX: DocAux = { paper: 'blank', texts: [] };

const uid = () => createId('d_');

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[stylus] document save failed', err);
  }
}

function readIndex(): DocIndex | null {
  const idx = read<DocIndex>(INDEX_KEY);
  if (!idx || idx.version !== 1 || !Array.isArray(idx.docs)) return null;
  // Normalize legacy docs (no mode field) to 'canvas' at the one choke point
  // every read passes through. Do NOT scatter per-site fallbacks.
  return {
    ...idx,
    docs: idx.docs.map((d) => ({ ...d, mode: resolveMode((d as Partial<DocMeta>).mode) })),
  };
}

function writeIndex(idx: DocIndex): void {
  write(INDEX_KEY, idx);
}

/**
 * Return the index, creating a first document on first run. If a pre-multidoc
 * drawing exists under the legacy key, it's adopted as that first document so
 * nobody loses their notes on upgrade.
 */
export function ensureIndex(now: number): DocIndex {
  const existing = readIndex();
  if (existing && existing.docs.length > 0) return existing;

  const id = uid();
  const meta: DocMeta = { id, name: 'My notes', createdAt: now, updatedAt: now, mode: 'canvas' };

  // Adopt a legacy single-drawing payload, if present, into this document.
  const legacy = localStorage.getItem(LEGACY_INK_KEY);
  if (legacy !== null) {
    try {
      localStorage.setItem(inkKey(id), legacy);
      localStorage.removeItem(LEGACY_INK_KEY);
    } catch {
      // best-effort migration
    }
  }

  const idx: DocIndex = { version: 1, currentId: id, docs: [meta] };
  writeIndex(idx);
  return idx;
}

export function listDocuments(): DocMeta[] {
  return readIndex()?.docs ?? [];
}

export function getCurrentId(): string | null {
  return readIndex()?.currentId ?? null;
}

export function setCurrentId(id: string): void {
  const idx = readIndex();
  if (!idx) return;
  writeIndex({ ...idx, currentId: id });
}

export function createDocument(name: string, now: number, mode: AppMode = 'canvas'): DocMeta {
  const idx = readIndex() ?? { version: 1, currentId: null, docs: [] };
  const meta: DocMeta = {
    id: uid(),
    name: name.trim() || 'Untitled',
    createdAt: now,
    updatedAt: now,
    mode,
  };
  writeIndex({ ...idx, currentId: meta.id, docs: [meta, ...idx.docs] });
  write(auxKey(meta.id), DEFAULT_AUX);
  return meta;
}

export function renameDocument(id: string, name: string): void {
  const idx = readIndex();
  if (!idx) return;
  writeIndex({
    ...idx,
    docs: idx.docs.map((d) =>
      d.id === id ? { ...d, name: name.trim() || d.name } : d,
    ),
  });
}

export function touchDocument(id: string, now: number): void {
  const idx = readIndex();
  if (!idx) return;
  writeIndex({
    ...idx,
    docs: idx.docs.map((d) => (d.id === id ? { ...d, updatedAt: now } : d)),
  });
}

/**
 * Delete a document and its payloads. Returns the next current id.
 *
 * The store guarantees there is always at least one document: deleting the last
 * remaining one creates a fresh replacement in its place. Keeping that invariant
 * here (rather than in callers) means no caller can ever leave a zero-document,
 * null-current state behind.
 */
export function deleteDocument(id: string): string {
  const idx = readIndex();
  if (!idx) {
    return ensureIndex(Date.now()).currentId!;
  }
  const docs = idx.docs.filter((d) => d.id !== id);

  try {
    localStorage.removeItem(inkKey(id));
    localStorage.removeItem(auxKey(id));
  } catch {
    // ignore
  }

  if (docs.length === 0) {
    const now = Date.now();
    const meta: DocMeta = { id: uid(), name: 'My notes', createdAt: now, updatedAt: now, mode: 'canvas' };
    write(auxKey(meta.id), DEFAULT_AUX);
    writeIndex({ version: 1, currentId: meta.id, docs: [meta] });
    return meta.id;
  }

  const currentId = idx.currentId === id ? docs[0].id : idx.currentId!;
  writeIndex({ ...idx, currentId, docs });
  return currentId;
}

export function readAux(id: string): DocAux {
  const aux = read<Partial<DocAux>>(auxKey(id));
  return {
    paper: aux?.paper ?? DEFAULT_AUX.paper,
    texts: Array.isArray(aux?.texts) ? (aux!.texts as TextItem[]) : [],
  };
}

export function writeAux(id: string, aux: DocAux): void {
  write(auxKey(id), aux);
}
