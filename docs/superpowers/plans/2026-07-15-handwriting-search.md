# Handwriting Search (Phase 3 #4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `searchDocuments()` find text the user only ever wrote in ink (never typed or manually converted), by running background OCR on save and caching the recognized text alongside the existing local document data.

**Architecture:** Reuse the existing `recognizeText(strokes): Promise<RecognitionResult>` (`src/lib/recognition.ts` — Claude vision primary, on-device Tesseract fallback, no new AI endpoint needed). On each debounced local save of a page/doc's ink (the existing `useLocalStorage` `onSaved` hook), kick off a **fire-and-forget, heavily-debounced** background OCR pass and cache the result in a new localStorage-backed store keyed by ink key, invalidated by a content hash so unchanged ink is never re-OCR'd. `searchDocuments()` reads this cache the same way it already reads `TextItem.text` — additive, no schema break, no server changes (per the user's decision: localStorage only, extend `searchDocuments`, not a new Postgres column, matching ADR 002's explicit deferral of "search-index architecture").

**Tech Stack:** Existing `src/lib/recognition.ts` (Tesseract.js + `/api/recognize`), localStorage, TypeScript, Vitest.

## Global Constraints

- No new backend/API route. No Postgres schema change (ADR 002 explicitly defers search-index architecture — this stays entirely client-side).
- Must not run OCR synchronously on every keystroke/stroke — only after a save settles, and only when ink actually changed (content hash gate).
- Must not block or slow down the existing save path — `useLocalStorage`'s `onSaved` callback contract requires the local write to have already succeeded; OCR indexing is a separate, independent, best-effort side effect that must never throw into the caller.
- Reuse `recognizeText()` as-is — do not fork or duplicate OCR logic.
- Search UI (`Sidebar.tsx`) must distinguish a hit from handwriting vs. typed text only if trivial; do not block on new UI polish beyond what's needed to prove the match works (a new `matchedIn: 'handwriting'` value is enough).

---

## File Structure

- **Create `src/lib/handwritingIndex.ts`** — the OCR cache: hash ink, read/write cached recognized text per ink key, expose a `queueIndex(inkKey, strokes)` entry point and a `getIndexedText(inkKey): string | null` sync reader.
- **Create `src/lib/handwritingIndex.test.ts`** — unit tests for the cache (hash gating, read/write, eviction if any).
- **Modify `src/lib/documents.ts`** — `collectDocText` (and its notebook-mode per-page loop) also pulls from `getIndexedText`, so `searchDocuments` sees OCR'd content. Add a `matchedIn: 'handwriting'` case to `SearchMatch`.
- **Modify `src/hooks/useLocalStorage.ts`** — nothing structural; the `onSaved` callback signature already carries `(content: DrawingContent, savedAt: number)`, which is everything `queueIndex` needs given the storage key. Wiring happens at the call site (Workspace.tsx), not inside the hook itself, to avoid growing the hook's responsibility.
- **Modify `src/components/Workspace.tsx`** — the `useLocalStorage(key, onSaved)` call site(s) pass an `onSaved` that also calls `queueIndex(key, content.strokes)` (fire-and-forget, never awaited, never throws into the save path).
- **Modify `src/components/Sidebar.tsx`** — render a distinct icon/label for `matchedIn === 'handwriting'` search results (mirrors the existing `'content'`/`'tag'` branches).

## Task 1: Content-hash + cache primitives

**Files:**
- Create: `src/lib/handwritingIndex.ts`
- Test: `src/lib/handwritingIndex.test.ts`

**Interfaces:**
- Consumes: `Stroke[]` from `../types` (already defined — `id, color, size, points: InkPoint[]`).
- Produces:
  - `export function hashStrokes(strokes: Stroke[]): string` — deterministic, cheap (not cryptographic) hash of stroke content, used to detect "ink didn't change since last OCR."
  - `export function getIndexedText(inkKey: string): string | null` — sync read of cached OCR text for a given ink storage key (e.g. `stylus.doc.v1.<id>.ink` or `stylus.doc.v1.<id>.page.<pageId>.ink`), or `null` if never indexed.
  - `export function readIndexEntry(inkKey: string): { hash: string; text: string } | null` — internal-shape reader, exported for Task 2's dirty-check.
  - `export function writeIndexEntry(inkKey: string, hash: string, text: string): void` — persists one entry.

- [ ] **Step 1: Write the failing test for `hashStrokes`**

```typescript
// src/lib/handwritingIndex.test.ts
import { describe, it, expect } from 'vitest';
import { hashStrokes, getIndexedText, writeIndexEntry } from './handwritingIndex';
import { stroke } from '../test/fixtures';

describe('hashStrokes', () => {
  it('is stable for the same strokes', () => {
    const strokes = [stroke([[0, 0], [10, 10]], { id: 's1' })];
    expect(hashStrokes(strokes)).toBe(hashStrokes(strokes));
  });

  it('changes when a point moves', () => {
    const a = [stroke([[0, 0], [10, 10]], { id: 's1' })];
    const b = [stroke([[0, 0], [11, 10]], { id: 's1' })];
    expect(hashStrokes(a)).not.toBe(hashStrokes(b));
  });

  it('changes when a stroke is added', () => {
    const a = [stroke([[0, 0], [10, 10]], { id: 's1' })];
    const b = [...a, stroke([[20, 20], [30, 30]], { id: 's2' })];
    expect(hashStrokes(a)).not.toBe(hashStrokes(b));
  });

  it('is the same empty-string hash for an empty stroke array', () => {
    expect(hashStrokes([])).toBe(hashStrokes([]));
  });
});

describe('getIndexedText / writeIndexEntry', () => {
  it('returns null for a key that was never indexed', () => {
    expect(getIndexedText('stylus.doc.v1.nope.ink')).toBeNull();
  });

  it('round-trips a written entry', () => {
    writeIndexEntry('stylus.doc.v1.abc.ink', 'hash1', 'hello world');
    expect(getIndexedText('stylus.doc.v1.abc.ink')).toBe('hello world');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/handwritingIndex.test.ts`
Expected: FAIL — `Cannot find module './handwritingIndex'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/handwritingIndex.ts
import type { Stroke } from '../types';

/**
 * Background handwriting-search index (Phase 3 #4).
 *
 * Caches OCR'd text per ink storage key (see documents.ts's `inkKey` /
 * `pageInkKey`) so `searchDocuments()` can find content the user only ever
 * wrote in ink and never typed or manually ran Convert on. Entirely
 * client-side by design — ADR 002 explicitly defers a real search-index
 * architecture change; this is the local-only stopgap that still closes the
 * "handwriting is invisible to search" gap identified in the product audit.
 *
 * A content hash gates re-OCR: unchanged ink is never re-recognized, so
 * reopening a page you didn't edit costs nothing.
 */

const INDEX_KEY_PREFIX = 'stylus.hwindex.v1.';

interface IndexEntry {
  hash: string;
  text: string;
}

/** Cheap, non-cryptographic hash — good enough to detect "content changed,"
 *  not a security primitive. FNV-1a over a compact serialization of the
 *  fields that affect what OCR would read (point coordinates only; color/
 *  size don't change what the ink SAYS). */
export function hashStrokes(strokes: Stroke[]): string {
  let h = 0x811c9dc5;
  for (const s of strokes) {
    for (const p of s.points) {
      // Round to avoid float-noise from repeated serialize/deserialize.
      const x = Math.round(p.x * 100);
      const y = Math.round(p.y * 100);
      h = (h ^ x) >>> 0;
      h = Math.imul(h, 0x01000193);
      h = (h ^ y) >>> 0;
      h = Math.imul(h, 0x01000193);
    }
    // Stroke boundary marker so [[0,0],[1,1]] + [[2,2]] hashes differently
    // from [[0,0],[1,1],[2,2]] as one stroke.
    h = (h ^ 0xff) >>> 0;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function storageKey(inkKey: string): string {
  return INDEX_KEY_PREFIX + inkKey;
}

export function readIndexEntry(inkKey: string): IndexEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(inkKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as IndexEntry).hash !== 'string' ||
      typeof (parsed as IndexEntry).text !== 'string'
    ) {
      return null;
    }
    return parsed as IndexEntry;
  } catch {
    return null;
  }
}

export function writeIndexEntry(inkKey: string, hash: string, text: string): void {
  try {
    localStorage.setItem(storageKey(inkKey), JSON.stringify({ hash, text } satisfies IndexEntry));
  } catch {
    // Best-effort — a failed index write must never break search (it just
    // stays blind to this page's handwriting, same as before this feature).
  }
}

/** Sync read for search — `searchDocuments()` calls this exactly like it
 *  reads TextItem.text. Empty string, not null, means "indexed, found no
 *  legible text" (distinct from "never indexed" — both are falsy to a
 *  substring search either way, so callers can treat `?? ''` uniformly). */
export function getIndexedText(inkKey: string): string | null {
  return readIndexEntry(inkKey)?.text ?? null;
}

/** Remove a cached entry (doc/page deletion). Best-effort, mirrors
 *  imageStore's deleteImages semantics. */
export function deleteIndexEntry(inkKey: string): void {
  try {
    localStorage.removeItem(storageKey(inkKey));
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/handwritingIndex.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/handwritingIndex.ts src/lib/handwritingIndex.test.ts
git commit -m "feat(search): add content-hashed OCR cache primitives"
```

## Task 2: Background indexing entry point (`queueIndex`)

**Files:**
- Modify: `src/lib/handwritingIndex.ts`
- Test: `src/lib/handwritingIndex.test.ts`

**Interfaces:**
- Consumes: `recognizeText(strokes: Stroke[]): Promise<{ text: string }>` from `./recognition` (existing, unchanged — Claude vision primary / Tesseract fallback; throws `RecognitionError` on total failure or empty ink).
- Produces: `export function queueIndex(inkKey: string, strokes: Stroke[]): void` — fire-and-forget; debounces per `inkKey`, skips the OCR call entirely if the content hash matches the cached entry, swallows all errors (a failed background index must never surface to the user or the caller).

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/handwritingIndex.test.ts
import { vi } from 'vitest';

vi.mock('./recognition', () => ({
  recognizeText: vi.fn(),
}));

import { recognizeText } from './recognition';
import { queueIndex } from './handwritingIndex';

describe('queueIndex', () => {
  it('calls recognizeText and caches the result', async () => {
    vi.mocked(recognizeText).mockResolvedValue({ text: 'meeting notes' });
    const strokes = [stroke([[0, 0], [5, 5]], { id: 's1' })];

    queueIndex('stylus.doc.v1.x.ink', strokes);
    // queueIndex is fire-and-forget; wait a tick for the microtask queue.
    await new Promise((r) => setTimeout(r, 0));

    expect(getIndexedText('stylus.doc.v1.x.ink')).toBe('meeting notes');
  });

  it('skips the OCR call when the hash matches the cached entry', async () => {
    vi.mocked(recognizeText).mockClear();
    const strokes = [stroke([[1, 1], [2, 2]], { id: 's2' })];

    queueIndex('stylus.doc.v1.y.ink', strokes);
    await new Promise((r) => setTimeout(r, 0));
    expect(recognizeText).toHaveBeenCalledTimes(1);

    // Same content again — should NOT re-call recognizeText.
    queueIndex('stylus.doc.v1.y.ink', strokes);
    await new Promise((r) => setTimeout(r, 0));
    expect(recognizeText).toHaveBeenCalledTimes(1);
  });

  it('never throws when recognizeText rejects', async () => {
    vi.mocked(recognizeText).mockRejectedValueOnce(new Error('offline'));
    const strokes = [stroke([[9, 9], [8, 8]], { id: 's3' })];
    expect(() => queueIndex('stylus.doc.v1.z.ink', strokes)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    // No cached entry since the call failed — getIndexedText stays null.
    expect(getIndexedText('stylus.doc.v1.z.ink')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/handwritingIndex.test.ts`
Expected: FAIL — `queueIndex is not exported`

- [ ] **Step 3: Implement `queueIndex`**

```typescript
// append to src/lib/handwritingIndex.ts
import { recognizeText } from './recognition';

/**
 * Fire-and-forget background OCR indexing, called from the save path
 * (useLocalStorage's onSaved). Debounced per inkKey so a burst of saves
 * (one per stroke, coalesced by useLocalStorage's own 400ms debounce, but
 * still frequent during active drawing) only triggers one OCR call once
 * the ink settles — recognizeText is not cheap (network round-trip or a
 * WASM OCR pass) and must not run on every keystroke-adjacent save.
 *
 * Errors (offline, budget reached, empty ink) are swallowed: a failed
 * background index just means this page stays un-searchable-by-handwriting
 * until the next successful save, never a user-visible failure.
 */
const INDEX_DEBOUNCE_MS = 2_000;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function queueIndex(inkKey: string, strokes: Stroke[]): void {
  const existing = pendingTimers.get(inkKey);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingTimers.delete(inkKey);
    void runIndex(inkKey, strokes);
  }, INDEX_DEBOUNCE_MS);
  pendingTimers.set(inkKey, timer);
}

async function runIndex(inkKey: string, strokes: Stroke[]): Promise<void> {
  const hash = hashStrokes(strokes);
  const cached = readIndexEntry(inkKey);
  if (cached && cached.hash === hash) return; // unchanged since last index

  try {
    const { text } = await recognizeText(strokes);
    writeIndexEntry(inkKey, hash, text);
  } catch {
    // Offline, budget reached, empty canvas, or both engines failed — leave
    // the previous cache entry (if any) in place rather than clobbering a
    // good result with nothing.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/handwritingIndex.test.ts`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/handwritingIndex.ts src/lib/handwritingIndex.test.ts
git commit -m "feat(search): add debounced background OCR indexing (queueIndex)"
```

## Task 3: Wire `searchDocuments` to read the index

**Files:**
- Modify: `src/lib/documents.ts:682-741` (SearchMatch interface, collectDocText, searchDocuments)
- Test: `src/lib/documents.test.ts`

**Interfaces:**
- Consumes: `getIndexedText(inkKey: string): string | null` from `./handwritingIndex`, `inkKey(id)` and `pageInkKey(docId, pageId)` (already exported from `documents.ts` itself).
- Produces: `SearchMatch.matchedIn` gains a `'handwriting'` variant; `searchDocuments` now also matches on OCR'd ink content.

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/documents.test.ts — find the existing searchDocuments
// describe block and add a sibling test. Uses the same localStorage-mock
// setup the rest of the file already uses (createDocument, etc.)
import { writeIndexEntry } from './handwritingIndex';

describe('searchDocuments — handwriting (Phase 3 #4)', () => {
  it('matches text that only exists as OCR-indexed handwriting, not a TextItem', () => {
    const now = Date.now();
    ensureIndex(now);
    const doc = createDocument('Ink-only doc', now, 'canvas');
    // No TextItem written — this doc's aux has empty texts. Simulate a
    // background OCR result cached against its ink key.
    writeIndexEntry(inkKey(doc.id), 'somehash', 'remember to buy milk');

    const results = searchDocuments('buy milk');
    expect(results).toHaveLength(1);
    expect(results[0].doc.id).toBe(doc.id);
    expect(results[0].matchedIn).toBe('handwriting');
    expect(results[0].snippet).toContain('buy milk');
  });

  it('prefers a title match over a handwriting match when both exist', () => {
    const now = Date.now();
    ensureIndex(now);
    const doc = createDocument('buy milk list', now, 'canvas');
    writeIndexEntry(inkKey(doc.id), 'somehash', 'buy milk');

    const results = searchDocuments('buy milk');
    expect(results).toHaveLength(1);
    expect(results[0].matchedIn).toBe('title');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/documents.test.ts -t "handwriting"`
Expected: FAIL — handwriting match not found (only title/tag/content branches exist)

- [ ] **Step 3: Implement the wiring**

In `src/lib/documents.ts`, add the import and extend `SearchMatch` + `collectDocText`'s caller:

```typescript
// near the top of documents.ts, alongside the other imports
import { getIndexedText } from './handwritingIndex';
```

```typescript
// SearchMatch interface — widen matchedIn
export interface SearchMatch {
  doc: DocMeta;
  /** Where the match was found — used to pick an icon/label in the UI. */
  matchedIn: 'title' | 'tag' | 'content' | 'handwriting';
  /** Short excerpt around the match, for content/handwriting hits only. */
  snippet?: string;
}
```

```typescript
/** OCR-indexed handwriting text for a document — doc-level ink key plus
 *  every page's ink key for Notebook docs, mirroring collectDocText's own
 *  doc-aux + every-page-aux walk. Returns [] entries as '' rather than
 *  skipping them, so callers can just filter falsy strings uniformly. */
function collectDocHandwriting(doc: DocMeta): string[] {
  const strings: string[] = [];
  const own = getIndexedText(inkKey(doc.id));
  if (own) strings.push(own);
  if (doc.mode === 'notebook') {
    for (const page of listPages(doc.id)) {
      const text = getIndexedText(pageInkKey(doc.id, page.id));
      if (text) strings.push(text);
    }
  }
  return strings;
}
```

Then extend `searchDocuments`'s loop — insert a handwriting check after the existing `'content'` check, before moving to the next doc:

```typescript
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
    let matchedContent = false;
    for (const text of collectDocText(doc)) {
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        results.push({ doc, matchedIn: 'content', snippet: snippetAround(text, idx, q.length) });
        matchedContent = true;
        break;
      }
    }
    if (matchedContent) continue;
    for (const text of collectDocHandwriting(doc)) {
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        results.push({ doc, matchedIn: 'handwriting', snippet: snippetAround(text, idx, q.length) });
        break;
      }
    }
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/documents.test.ts`
Expected: PASS — all existing documents.test.ts tests plus the 2 new ones green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents.ts src/lib/documents.test.ts
git commit -m "feat(search): searchDocuments matches OCR-indexed handwriting"
```

## Task 4: Wire background indexing into the save path

**Files:**
- Modify: `src/components/Workspace.tsx` (every `useLocalStorage(...)` call site that persists page/doc ink)
- Test: manual verification (documented below) — this task is glue code between two already-tested units (Task 2's `queueIndex`, `useLocalStorage`'s existing `onSaved` contract), not new logic worth a fresh unit test.

**Interfaces:**
- Consumes: `queueIndex(inkKey: string, strokes: Stroke[]): void` from `../lib/handwritingIndex` (Task 2); `useLocalStorage(storageKey, onSaved)` (existing, unchanged signature).
- Produces: nothing new exported — this task only adds a call inside existing `onSaved` closures.

- [ ] **Step 1: Locate every `useLocalStorage` call site**

Run: `grep -n "useLocalStorage(" src/components/Workspace.tsx`

Expected: one or more call sites, each passing a storage key (via `inkKey(docId)` or `pageInkKey(docId, pageId)`) and possibly an existing `onSaved` (the sync push callback from ADR 002, e.g. `queuePush`).

- [ ] **Step 2: Add `queueIndex` alongside the existing `onSaved`**

For each call site, compose the background-index call with whatever `onSaved` already does (sync push, etc.) rather than replacing it. Example shape (adapt to the actual existing callback found in Step 1):

```typescript
import { queueIndex } from '../lib/handwritingIndex';

// ... inside the component, where useLocalStorage is called:
const { save, flush, load, clear } = useLocalStorage(storageKey, (content, savedAt) => {
  existingOnSavedLogic(content, savedAt); // whatever was already there (e.g. sync push)
  queueIndex(storageKey, content.strokes);
});
```

If there are multiple call sites (e.g. one for Canvas/Mobile docs, one for Notebook pages), apply the same pattern to each — `storageKey` is already in scope at each site since it's what's passed as the hook's first argument.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the app, draw a short word (e.g. "test") on a Canvas-mode doc, wait ~3 seconds (past the 400ms save debounce + 2s index debounce), then open the Sidebar search and type "test". Expected: the doc appears in results with `matchedIn: 'handwriting'` styling (Task 5) even though no Convert/OCR button was ever pressed.

- [ ] **Step 5: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat(search): trigger background OCR indexing on save"
```

## Task 5: Sidebar UI for handwriting matches

**Files:**
- Modify: `src/components/Sidebar.tsx:317-338` (search results list)
- Test: existing Sidebar tests if present (`grep -rn "Sidebar.test" src/components/`) — add one case; otherwise this is a small enough visual branch to verify manually per this task's Step 3.

**Interfaces:**
- Consumes: `SearchMatch.matchedIn` now includes `'handwriting'` (Task 3).
- Produces: no new exports — a rendering branch only.

- [ ] **Step 1: Check for an existing Sidebar test file**

Run: `ls src/components/Sidebar.test.tsx 2>/dev/null || echo "none"`

- [ ] **Step 2: Add the rendering branch**

In `src/components/Sidebar.tsx`, extend the `matchedIn === 'tag'` conditional block (around line 334) with a sibling branch:

```tsx
{matchedIn === 'content' && snippet && (
  <span className="pl-[22px] text-xs text-ink-400">{snippet}</span>
)}
{matchedIn === 'handwriting' && snippet && (
  <span className="pl-[22px] text-xs text-ink-400">
    <span className="text-brand-400">✎ </span>
    {snippet}
  </span>
)}
{matchedIn === 'tag' && (
  <span className="pl-[22px] text-xs text-ink-400">
    matched tag: {doc.tags?.find((t) => t.toLowerCase().includes(query.trim().toLowerCase()))}
  </span>
)}
```

The `✎` prefix (pencil, reusing the existing `text-brand-400` accent color already used elsewhere in the toolbar) distinguishes "found in your handwriting" from "found in typed text" without needing a new icon import — kept minimal since this is a small affordance, not a new UI system.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Repeat Task 4 Step 4's manual test; confirm the search result row shows the ✎ prefix before the snippet.

- [ ] **Step 4: Typecheck and full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(search): show a handwriting-match affordance in search results"
```

## Task 6: Cleanup on document/page deletion

**Files:**
- Modify: `src/lib/documents.ts` — `deleteDocument` (line 264) and `deletePage` (line 444)
- Test: `src/lib/documents.test.ts`

**Interfaces:**
- Consumes: `deleteIndexEntry(inkKey: string): void` from `./handwritingIndex` (Task 1).
- Produces: no new exports — deletion now also purges the OCR cache entry, mirroring how `collectImageIds`/`purgeImageBitmaps` already clean up image bitmaps on delete.

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/documents.test.ts
import { getIndexedText, writeIndexEntry } from './handwritingIndex';

describe('deleteDocument — handwriting index cleanup', () => {
  it('removes the cached OCR entry for the deleted document', () => {
    const now = Date.now();
    ensureIndex(now);
    const doc = createDocument('Temp', now, 'canvas');
    writeIndexEntry(inkKey(doc.id), 'h', 'some handwriting');
    expect(getIndexedText(inkKey(doc.id))).toBe('some handwriting');

    deleteDocument(doc.id);
    expect(getIndexedText(inkKey(doc.id))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/documents.test.ts -t "handwriting index cleanup"`
Expected: FAIL — entry still present after delete.

- [ ] **Step 3: Implement cleanup**

In `src/lib/documents.ts`, import `deleteIndexEntry` and call it in `deleteDocument` (for the doc's own ink key, plus every page's ink key if notebook mode — read the existing `deleteDocument` body first to insert this alongside the existing `collectImageIds`/`purgeImageBitmaps` calls, same ordering rule: collect page ids BEFORE the aux/page-index keys are swept). Example shape, adapt to whatever the real function body looks like once read:

```typescript
import { deleteIndexEntry } from './handwritingIndex';

// inside deleteDocument, alongside the existing image-bitmap purge:
deleteIndexEntry(inkKey(id));
if (doc.mode === 'notebook') {
  for (const page of listPages(id)) {
    deleteIndexEntry(pageInkKey(id, page.id));
  }
}
```

And in `deletePage`, add the single-page equivalent:

```typescript
// inside deletePage, before/alongside its existing per-page cleanup:
deleteIndexEntry(pageInkKey(docId, pageId));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/documents.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents.ts src/lib/documents.test.ts
git commit -m "fix(search): purge handwriting index entries on document/page delete"
```

## Task 7: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing suite + new handwritingIndex.test.ts + documents.test.ts additions).

- [ ] **Step 3: Manual end-to-end check**

Run: `npm run dev`. On a fresh Canvas doc, write a short recognizable word in ink, wait a few seconds, search for it in the Sidebar, confirm it's found with the handwriting affordance. Then delete that doc and confirm the same search no longer returns it (Task 6).

- [ ] **Step 4: Commit any final fixes**

If Steps 1–3 surfaced anything, fix and commit with a clear message; otherwise this task has no commit of its own.
