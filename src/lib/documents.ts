import type { ImageItem, PaperStyle, TextItem } from '../types';
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
 *
 * Known limitation: read-modify-write with no cross-tab coordination — two
 * tabs mutating the index race and last-write-wins. Acceptable for the
 * offline-first single-user model; revisit (storage events / locks) if
 * multi-window becomes a supported flow.
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
  /**
   * Derived, denormalized page count (Phase 1) — sidebar display ONLY, never
   * authoritative. `pagesKey` owns PageMeta[]; every page-mutating function
   * updates both in the same call. Absent on non-notebook docs.
   */
  pageCount?: number;
  /**
   * Organization (Quick Note Phase 0). `undefined` = unfiled, shown at the
   * tree root. Never a dangling reference by construction: deleteFolder
   * reassigns every doc pointing at the deleted folder to `undefined` in the
   * same write, so no doc ever points at a folder that doesn't exist.
   */
  folderId?: string;
  /** Free-form labels, independent of folder placement. */
  tags?: string[];
}

/**
 * A node in the notebooks/folders tree (Quick Note Phase 0 — "unlimited
 * notebooks, folders and subfolders"). `parentId: undefined` = root level.
 * Nesting depth is unbounded; the UI (Phase 1) decides how deep to render.
 */
export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
}

interface FolderIndex {
  version: 1;
  folders: Folder[];
}

export interface DocAux {
  paper: PaperStyle;
  texts: TextItem[];
  /** Image-underlay metadata (bitmaps in IndexedDB — see lib/imageStore). */
  images?: ImageItem[];
}

interface DocIndex {
  version: 1;
  currentId: string | null;
  docs: DocMeta[];
}

const INDEX_KEY = 'stylus.docs.v1';
const FOLDERS_KEY = 'stylus.folders.v1';
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

/**
 * Best-effort async removal of image bitmaps from IndexedDB. Fire-and-forget:
 * this module is synchronous and deletion UX must not wait on IDB. MUST be
 * fed ids collected BEFORE the aux keys are swept — afterwards the metadata
 * that references them is gone and the bitmaps become unreachable orphans.
 */
function purgeImageBitmaps(ids: string[]): void {
  if (ids.length === 0) return;
  void import('./imageStore')
    .then((m) => m.deleteImages(ids))
    .catch(() => {
      // best-effort — a failed purge is the pre-existing leak, not a new error
    });
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
  const idx = readIndex() ?? { version: 1 as const, currentId: null, docs: [] };
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

  // Collect image-bitmap ids BEFORE the sweep below removes the aux keys that
  // reference them — collected afterwards there is nothing left to find, and
  // the bitmaps (the largest payloads this app stores) leak in IndexedDB
  // forever. localStorage cleanup alone was only half the quota story.
  purgeImageBitmaps(collectImageIds(id));

  try {
    // Sweep page payloads first (notebook docs) — an orphaned page blob is a
    // silent quota leak identical to an orphaned doc blob.
    const pageIdx = read<PageIndex>(pagesKey(id));
    if (pageIdx && Array.isArray(pageIdx.pages)) {
      for (const p of pageIdx.pages) {
        localStorage.removeItem(pageInkKey(id, p.id));
        localStorage.removeItem(pageAuxKey(id, p.id));
      }
    }
    localStorage.removeItem(pagesKey(id));
    localStorage.removeItem(customColorsKey(id));
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

  // currentId is nullable by type; never launder a null through a `!`.
  const currentId = idx.currentId === id ? docs[0].id : idx.currentId ?? docs[0].id;
  writeIndex({ ...idx, currentId, docs });
  return currentId;
}

export function readAux(id: string): DocAux {
  const aux = read<Partial<DocAux>>(auxKey(id));
  return {
    paper: aux?.paper ?? DEFAULT_AUX.paper,
    texts: Array.isArray(aux?.texts) ? (aux!.texts as TextItem[]) : [],
    images: Array.isArray(aux?.images) ? (aux!.images as ImageItem[]) : [],
  };
}

export function writeAux(id: string, aux: DocAux): void {
  write(auxKey(id), aux);
}

// ─── Pages (Notebook Mode, Phase 1) ──────────────────────────────────────────
//
// Notebook documents store one stroke array PER PAGE (`pageInkKey`) plus page
// metadata under `pagesKey`. The drawing engine stays page-agnostic: useDrawing
// just receives a different storageKey per active page. Mobile/Canvas docs
// never touch any of this — they remain single-array (`inkKey`).
//
// Single source of truth: `pagesKey` owns `PageMeta[]`. `DocMeta.pageCount`
// is a derived display value written alongside every mutation, never read as
// authoritative.

export interface PageMeta {
  id: string;
  /** Position in the notebook; contiguous from 0, maintained by reindexing. */
  index: number;
  /** Per-page paper override (e.g. one blank page in a ruled notebook). */
  paper: PaperStyle;
}

export interface PageIndex {
  version: 1;
  pages: PageMeta[];
}

/** Per-page aux (Notebook): text items live per page, not per doc. The
 *  per-doc `DocAux` stays as-is for Mobile/Canvas — two aux systems cleanly
 *  partitioned by mode, not one with mode-conditional fields. */
export interface PageAux {
  texts: TextItem[];
  /** Image-underlay metadata (bitmaps in IndexedDB — see lib/imageStore). */
  images?: ImageItem[];
}

export const pageInkKey = (docId: string, pageId: string) =>
  `stylus.doc.v1.${docId}.page.${pageId}.ink`;

export const pageAuxKey = (docId: string, pageId: string) =>
  `stylus.doc.v1.${docId}.page.${pageId}.aux`;

export const pagesKey = (docId: string) => `stylus.doc.v1.${docId}.pages`;

const pageUid = () => createId('p_');

// Notebook pages are the cream, red-margin exercise-book page — not plain
// ruled lines on the dark canvas. (This was left as 'ruled' with a "becomes
// notebook" TODO that never landed, so the notebook paper never actually
// rendered.)
const DEFAULT_PAGE_PAPER: PaperStyle = 'notebook';

function reindex(pages: PageMeta[]): PageMeta[] {
  return pages.map((p, i) => (p.index === i ? p : { ...p, index: i }));
}

function readPageIndex(docId: string): PageIndex | null {
  const idx = read<PageIndex>(pagesKey(docId));
  if (!idx || idx.version !== 1 || !Array.isArray(idx.pages)) return null;
  return idx;
}

/** Write the page index AND sync DocMeta.pageCount in the same call — the
 *  invariant that keeps the denormalized count from drifting. */
function writePageIndex(docId: string, pages: PageMeta[]): void {
  write(pagesKey(docId), { version: 1, pages } satisfies PageIndex);
  const idx = readIndex();
  if (!idx) return;
  writeIndex({
    ...idx,
    docs: idx.docs.map((d) => (d.id === docId ? { ...d, pageCount: pages.length } : d)),
  });
}

/**
 * Return the doc's pages, creating the first page if none exist. Notebook
 * workspaces call this on mount — mirrors ensureIndex's "never zero" shape.
 */
export function ensurePages(docId: string, paper: PaperStyle = DEFAULT_PAGE_PAPER): PageMeta[] {
  const existing = readPageIndex(docId);
  if (existing && existing.pages.length > 0) return existing.pages;
  const first: PageMeta = { id: pageUid(), index: 0, paper };
  writePageIndex(docId, [first]);
  return [first];
}

export function listPages(docId: string): PageMeta[] {
  return readPageIndex(docId)?.pages ?? [];
}

/** Create a page at the end, or directly after `afterId` when given. */
export function createPage(
  docId: string,
  opts: { paper?: PaperStyle; afterId?: string } = {},
): PageMeta {
  const pages = listPages(docId);
  const page: PageMeta = {
    id: pageUid(),
    index: 0, // fixed by reindex below
    paper: opts.paper ?? DEFAULT_PAGE_PAPER,
  };
  const at = opts.afterId ? pages.findIndex((p) => p.id === opts.afterId) : -1;
  const next = at >= 0
    ? [...pages.slice(0, at + 1), page, ...pages.slice(at + 1)]
    : [...pages, page];
  const reindexed = reindex(next);
  writePageIndex(docId, reindexed);
  return reindexed.find((p) => p.id === page.id)!;
}

/**
 * Delete a page and BOTH its payload keys (ink + aux) — an orphaned blob is a
 * silent quota leak. Guarantees ≥1 page remains (deleting the last page
 * creates a fresh replacement), mirroring deleteDocument's ≥1-doc invariant.
 * Returns the id of the page to activate next (the page now occupying the
 * deleted slot, or the new last page).
 */
export function deletePage(docId: string, pageId: string): string {
  const pages = listPages(docId);
  const at = pages.findIndex((p) => p.id === pageId);
  if (at < 0) return pages[0]?.id ?? ensurePages(docId)[0].id;

  // Collect BEFORE removing the aux key (see purgeImageBitmaps) — the page's
  // image bitmaps in IndexedDB die with the page, same as its ink and texts.
  purgeImageBitmaps(readPageAux(docId, pageId).images?.map((i) => i.imageId) ?? []);

  try {
    localStorage.removeItem(pageInkKey(docId, pageId));
    localStorage.removeItem(pageAuxKey(docId, pageId));
  } catch {
    // ignore
  }

  const remaining = pages.filter((p) => p.id !== pageId);
  if (remaining.length === 0) {
    const fresh: PageMeta = { id: pageUid(), index: 0, paper: DEFAULT_PAGE_PAPER };
    writePageIndex(docId, [fresh]);
    return fresh.id;
  }
  const reindexed = reindex(remaining);
  writePageIndex(docId, reindexed);
  return reindexed[Math.min(at, reindexed.length - 1)].id;
}

/**
 * Reorder to the given id order. No-op unless `orderedIds` is exactly the
 * current page-id set — a stale drag result must not drop or duplicate pages.
 */
export function reorderPages(docId: string, orderedIds: string[]): void {
  const pages = listPages(docId);
  if (orderedIds.length !== pages.length) return;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const next: PageMeta[] = [];
  for (const id of orderedIds) {
    const p = byId.get(id);
    if (!p) return; // unknown id → reject wholesale
    next.push(p);
  }
  writePageIndex(docId, reindex(next));
}

/** Per-page paper override. */
export function setPagePaper(docId: string, pageId: string, paper: PaperStyle): void {
  const pages = listPages(docId);
  if (!pages.some((p) => p.id === pageId)) return;
  writePageIndex(docId, pages.map((p) => (p.id === pageId ? { ...p, paper } : p)));
}

export function readPageAux(docId: string, pageId: string): PageAux {
  const aux = read<Partial<PageAux>>(pageAuxKey(docId, pageId));
  return {
    texts: Array.isArray(aux?.texts) ? (aux.texts as TextItem[]) : [],
    images: Array.isArray(aux?.images) ? (aux.images as ImageItem[]) : [],
  };
}

export function writePageAux(docId: string, pageId: string, aux: PageAux): void {
  write(pageAuxKey(docId, pageId), aux);
}

// ─── Custom colors (Canvas Mode, Phase 3 item 3) ─────────────────────────────

export const customColorsKey = (docId: string) => `stylus.doc.v1.${docId}.colors`;

const MAX_CUSTOM_COLORS = 8;

export function readCustomColors(docId: string): string[] {
  const v = read<unknown>(customColorsKey(docId));
  return Array.isArray(v) ? (v.filter((c) => typeof c === 'string') as string[]) : [];
}

/** Prepend a color (deduped, capped). Returns the new list. */
export function pushCustomColor(docId: string, color: string): string[] {
  const next = [color, ...readCustomColors(docId).filter((c) => c !== color)].slice(
    0,
    MAX_CUSTOM_COLORS,
  );
  write(customColorsKey(docId), next);
  return next;
}

// ─── Folders & tags (Quick Note Phase 0) ─────────────────────────────────────
//
// A separate flat store of Folder nodes (parentId forms the tree), kept out
// of DocIndex so folder CRUD never touches doc payloads and vice versa.
// DocMeta.folderId is the only link between the two stores.

const folderUid = () => createId('f_');

function readFolderIndex(): FolderIndex {
  const idx = read<FolderIndex>(FOLDERS_KEY);
  if (!idx || idx.version !== 1 || !Array.isArray(idx.folders)) {
    return { version: 1, folders: [] };
  }
  return idx;
}

function writeFolderIndex(idx: FolderIndex): void {
  write(FOLDERS_KEY, idx);
}

export function listFolders(): Folder[] {
  return readFolderIndex().folders;
}

export function createFolder(name: string, now: number, parentId?: string): Folder {
  const idx = readFolderIndex();
  const folder: Folder = { id: folderUid(), name: name.trim() || 'Untitled', createdAt: now, parentId };
  writeFolderIndex({ ...idx, folders: [...idx.folders, folder] });
  return folder;
}

export function renameFolder(id: string, name: string): void {
  const idx = readFolderIndex();
  writeFolderIndex({
    ...idx,
    folders: idx.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
  });
}

/**
 * Delete a folder and everything nested under it (subfolders, recursively).
 * Docs that pointed at any deleted folder are reassigned to `undefined`
 * (unfiled) in the same pass — DocMeta.folderId must never dangle.
 */
export function deleteFolder(id: string): void {
  const idx = readFolderIndex();
  const doomed = new Set<string>([id]);
  // Fixed-point sweep: repeatedly add children of anything already doomed,
  // since a folder can appear before or after its parent in the flat array.
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of idx.folders) {
      if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
        doomed.add(f.id);
        grew = true;
      }
    }
  }
  writeFolderIndex({ ...idx, folders: idx.folders.filter((f) => !doomed.has(f.id)) });

  const docIdx = readIndex();
  if (!docIdx) return;
  writeIndex({
    ...docIdx,
    docs: docIdx.docs.map((d) =>
      d.folderId && doomed.has(d.folderId) ? { ...d, folderId: undefined } : d,
    ),
  });
}

/** Move a document into `folderId` (or back to unfiled root if omitted). */
export function moveDocumentToFolder(id: string, folderId?: string): void {
  const idx = readIndex();
  if (!idx) return;
  writeIndex({
    ...idx,
    docs: idx.docs.map((d) => (d.id === id ? { ...d, folderId } : d)),
  });
}

export function setDocumentTags(id: string, tags: string[]): void {
  const idx = readIndex();
  if (!idx) return;
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  writeIndex({
    ...idx,
    docs: idx.docs.map((d) => (d.id === id ? { ...d, tags: cleaned } : d)),
  });
}

// ─── Search (Quick Note Phase 2) ─────────────────────────────────────────────
//
// On-demand scan, no persisted index: reads every doc's title/tags plus its
// text-item content (single aux for Canvas/Mobile docs, every page's aux for
// Notebook docs) and matches case-insensitively. Fine at local-notes volume;
// revisit with a real index only if this becomes visibly slow.

export interface SearchMatch {
  doc: DocMeta;
  /** Where the match was found — used to pick an icon/label in the UI. */
  matchedIn: 'title' | 'tag' | 'content';
  /** Short excerpt around the match, for content hits only. */
  snippet?: string;
}

const SNIPPET_RADIUS = 40;

function snippetAround(text: string, index: number, queryLen: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + queryLen + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix;
}

/** All text-item strings belonging to a document, across every page for
 *  Notebook docs (mirrors collectImageIds's doc-aux + every-page-aux walk). */
function collectDocText(doc: DocMeta): string[] {
  const strings: string[] = [];
  for (const t of readAux(doc.id).texts) strings.push(t.text);
  if (doc.mode === 'notebook') {
    for (const page of listPages(doc.id)) {
      for (const t of readPageAux(doc.id, page.id).texts) strings.push(t.text);
    }
  }
  return strings;
}

/**
 * Search every document's title, tags, and text content for `query`
 * (case-insensitive substring match). Empty/whitespace query returns no
 * results — callers show the full tree instead of an empty search state.
 */
export function searchDocuments(query: string): SearchMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchMatch[] = [];
  for (const doc of listDocuments()) {
    if (doc.name.toLowerCase().includes(q)) {
      results.push({ doc, matchedIn: 'title' });
      continue;
    }
    if (doc.tags?.some((t) => t.toLowerCase().includes(q))) {
      results.push({ doc, matchedIn: 'tag' });
      continue;
    }
    for (const text of collectDocText(doc)) {
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        results.push({ doc, matchedIn: 'content', snippet: snippetAround(text, idx, q.length) });
        break;
      }
    }
  }
  return results;
}

/** All image-underlay ids referenced by a document (doc aux + every page
 *  aux). Must run BEFORE deleteDocument's sweep — the sweep removes the aux
 *  keys this reads. deleteDocument now calls it internally at the right time;
 *  exported for tooling/diagnostics. */
export function collectImageIds(docId: string): string[] {
  const ids: string[] = [];
  for (const img of readAux(docId).images ?? []) ids.push(img.imageId);
  for (const page of listPages(docId)) {
    for (const img of readPageAux(docId, page.id).images ?? []) ids.push(img.imageId);
  }
  return ids;
}