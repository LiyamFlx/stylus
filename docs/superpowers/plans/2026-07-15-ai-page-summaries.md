# AI Page Summaries (Phase 3 #14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user generate a one-line AI summary of a document's content, cached on `DocMeta.summary`, and shown in the Sidebar's document list/search results.

**Architecture:** Add a `summary` action to `api/refine.ts` (same pattern as Task 1 of the auto-organization plan — extend the existing `PROMPTS` map, no new endpoint). Add `DocMeta.summary?: string` plus a new `setDocumentSummary(id, summary)` persistence function in `documents.ts`, following the exact shape of the existing `setDocumentTags`. Client-side, a new `summarizeDoc(doc): Promise<string>` helper reuses `collectDocText` (already exported per the auto-organization plan — if that plan hasn't landed yet, this plan's Task 2 duplicates the one-line export change defensively). **Manual trigger only**, per the user's decision — a "Summarize" button, not an auto-call on save. Cached indefinitely once generated; the user can re-run it, which simply overwrites the cached value (no explicit invalidation-on-edit is in scope for this plan — a slightly stale one-line summary is a low-stakes, easily-refreshed artifact, not worth staleness-tracking machinery).

**Tech Stack:** `api/refine.ts`, `src/lib/ai.ts`, `src/lib/documents.ts`, React, Vitest.

## Global Constraints

- Manual trigger only — never called from the save path.
- No new backend endpoint — extend `/api/refine`'s existing action set.
- `DocMeta.summary` follows the exact optionality convention of every other optional `DocMeta` field (`tags?`, `folderId?`, etc.) — absent on legacy/never-summarized docs, never a required field, never defaulted to `''` on write (only ever set when the user explicitly generates one).
- Reuse `collectDocText` (exported in the auto-organization plan's Task 2) rather than re-implementing the doc-text traversal. If that plan has not been executed yet, this plan's Task 2 independently exports it (idempotent — exporting an already-exported function is a no-op).

---

## File Structure

- **Modify `api/refine.ts`** — add `'summarize-doc'` action (distinct from the existing `'summarize'` action, which summarizes a *selected text excerpt* into bullet points for the AI studio — this one produces a single-sentence, whole-document summary for a list/search-row context, a different prompt and a different output shape).
- **Modify `src/lib/ai.ts`** — add `'summarize-doc'` to `RefineAction`.
- **Modify `src/lib/documents.ts`** — add `summary?: string` to `DocMeta`, add `setDocumentSummary(id: string, summary: string): void`, export `collectDocText` if not already exported.
- **Create `src/lib/docSummary.ts`** — `summarizeDoc(doc: DocMeta, signal?: AbortSignal): Promise<string>`.
- **Modify `src/components/Sidebar.tsx`** — add a "Summarize" action alongside the doc row actions (same location as the auto-organization plan's tag-suggestion button — if both plans land, they sit side by side), and render `doc.summary` under the doc name in both the folder tree and search results when present.

## Task 1: Backend — add the `summarize-doc` refine action

**Files:**
- Modify: `api/refine.ts`

**Interfaces:**
- Consumes: nothing new — same `POST { action, text } -> { result }` contract.
- Produces: `action: 'summarize-doc'` accepted; `result` is a single plain-text sentence (no bullets, no markdown).

- [ ] **Step 1: Add the action**

In `api/refine.ts`, extend `Action`:

```typescript
type Action =
  | 'polish'
  | 'grammar'
  | 'summarize'
  | 'todo'
  | 'formal'
  | 'casual'
  | 'ask'
  | 'translate'
  | 'summarize-doc'; // Phase 3 #14 — distinct from 'summarize' (bullet-point
                      // excerpt summary for the AI studio): this is a single
                      // sentence describing the WHOLE document, for list rows.
```

And add to `PROMPTS`:

```typescript
const PROMPTS: Record<Action, (t: string) => string> = {
  // ...existing entries unchanged...
  'summarize-doc': (t) =>
    `Write a single short sentence (under 15 words) summarizing what this note is about, for display next to its title in a document list. No quotes, no period at the end, no preamble like "This note is about" — just the summary itself.\n\n"""${t}"""`,
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — `Action`/`PROMPTS` stay structurally in sync (TypeScript's `Record<Action, ...>` requires every union member to have an entry).

- [ ] **Step 3: Commit**

```bash
git add api/refine.ts
git commit -m "feat(ai): add summarize-doc refine action"
```

## Task 2: `DocMeta.summary` field + `setDocumentSummary`

**Files:**
- Modify: `src/lib/documents.ts`
- Test: `src/lib/documents.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DocMeta.summary?: string`; `export function setDocumentSummary(id: string, summary: string): void`; `export function collectDocText(doc: DocMeta): string[]` (export if not already exported by a prior plan).

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/documents.test.ts
describe('setDocumentSummary', () => {
  it('sets the summary field on the target document only', () => {
    const now = Date.now();
    ensureIndex(now);
    const a = createDocument('A', now, 'canvas');
    const b = createDocument('B', now, 'canvas');

    setDocumentSummary(a.id, 'A short summary of A.');

    const docs = listDocuments();
    expect(docs.find((d) => d.id === a.id)?.summary).toBe('A short summary of A.');
    expect(docs.find((d) => d.id === b.id)?.summary).toBeUndefined();
  });

  it('overwrites a previous summary on re-run', () => {
    const now = Date.now();
    ensureIndex(now);
    const a = createDocument('A', now, 'canvas');
    setDocumentSummary(a.id, 'First summary.');
    setDocumentSummary(a.id, 'Second summary.');
    expect(listDocuments().find((d) => d.id === a.id)?.summary).toBe('Second summary.');
  });

  it('is a no-op for an unknown document id', () => {
    const now = Date.now();
    ensureIndex(now);
    expect(() => setDocumentSummary('nonexistent', 'x')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/documents.test.ts -t "setDocumentSummary"`
Expected: FAIL — `setDocumentSummary is not a function`.

- [ ] **Step 3: Add the field and function**

In `src/lib/documents.ts`, extend the `DocMeta` interface (near the other optional fields, e.g. right after `tags?: string[];`):

```typescript
  /** AI-generated one-line summary (Phase 3 #14), cached until the user
   *  regenerates it. Absent until the user explicitly runs "Summarize" —
   *  never auto-populated on save. */
  summary?: string;
```

Then add the setter, following `setDocumentTags`'s exact shape (place it right after `setDocumentTags`):

```typescript
export function setDocumentSummary(id: string, summary: string): void {
  const idx = readIndex();
  if (!idx) return;
  writeIndex({
    ...idx,
    docs: idx.docs.map((d) => (d.id === id ? { ...d, summary } : d)),
  });
}
```

If `collectDocText` (around line 702) is still `function collectDocText` (module-private) rather than `export function collectDocText`, add `export` to it now — check with `grep -n "collectDocText" src/lib/documents.ts` first, since the auto-organization plan may have already exported it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/documents.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/documents.ts src/lib/documents.test.ts
git commit -m "feat(ai): add DocMeta.summary field and setDocumentSummary"
```

## Task 3: `summarizeDoc` client helper

**Files:**
- Modify: `src/lib/ai.ts`
- Create: `src/lib/docSummary.ts`
- Create: `src/lib/docSummary.test.ts`

**Interfaces:**
- Consumes: `refine(action, text, signal?)` from `./ai`; `collectDocText(doc)` from `./documents`.
- Produces: `export async function summarizeDoc(doc: DocMeta, signal?: AbortSignal): Promise<string>` — throws `Error('This document has no text content to summarize.')` before any network call when `collectDocText(doc)` is empty; otherwise returns the trimmed one-sentence result from `refine('summarize-doc', text, signal)`.

- [ ] **Step 1: Widen `RefineAction`**

In `src/lib/ai.ts`:

```typescript
export type RefineAction =
  | 'polish'
  | 'grammar'
  | 'summarize'
  | 'todo'
  | 'formal'
  | 'casual'
  | 'ask'
  | 'translate'
  | 'summarize-doc';
```

(If the auto-organization plan already landed and added `'suggest-tags'` too, this union simply has both — no conflict, they're independent string literals in the same type.)

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/docSummary.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./ai', () => ({ refine: vi.fn() }));
vi.mock('./documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./documents')>();
  return { ...actual, collectDocText: vi.fn() };
});

import { refine } from './ai';
import { collectDocText } from './documents';
import { summarizeDoc } from './docSummary';
import type { DocMeta } from './documents';

function doc(over: Partial<DocMeta> = {}): DocMeta {
  return { id: 'd1', name: 'Test', createdAt: 0, updatedAt: 0, mode: 'canvas', ...over };
}

describe('summarizeDoc', () => {
  it('throws without calling refine when the doc has no text content', async () => {
    vi.mocked(collectDocText).mockReturnValue([]);
    await expect(summarizeDoc(doc())).rejects.toThrow(/no text content/i);
    expect(refine).not.toHaveBeenCalled();
  });

  it('calls refine with joined doc text and returns the trimmed result', async () => {
    vi.mocked(collectDocText).mockReturnValue(['Buy milk', 'Call the dentist']);
    vi.mocked(refine).mockResolvedValue('  A short grocery and errands list.  ');

    const summary = await summarizeDoc(doc());
    expect(refine).toHaveBeenCalledWith('summarize-doc', 'Buy milk\nCall the dentist', undefined);
    expect(summary).toBe('A short grocery and errands list.');
  });

  it('propagates refine()\'s error message unchanged', async () => {
    vi.mocked(collectDocText).mockReturnValue(['some text']);
    vi.mocked(refine).mockRejectedValue(new Error('Too many requests. Please slow down.'));
    await expect(summarizeDoc(doc())).rejects.toThrow('Too many requests. Please slow down.');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/docSummary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// src/lib/docSummary.ts
import { refine } from './ai';
import { collectDocText } from './documents';
import type { DocMeta } from './documents';

/**
 * AI page/doc summaries (Phase 3 #14): one-line summary generated on
 * request, cached on DocMeta.summary. Manual-trigger only — never called
 * from the save path. Mirrors tagSuggestion.ts's shape exactly (same
 * no-text-content guard before spending a network call).
 */
export async function summarizeDoc(doc: DocMeta, signal?: AbortSignal): Promise<string> {
  const text = collectDocText(doc).join('\n');
  if (!text.trim()) {
    throw new Error('This document has no text content to summarize.');
  }
  const result = await refine('summarize-doc', text, signal);
  return result.trim();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/docSummary.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai.ts src/lib/docSummary.ts src/lib/docSummary.test.ts
git commit -m "feat(ai): add summarizeDoc client helper"
```

## Task 4: Wire "Summarize" into Sidebar + display the cached summary

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `summarizeDoc(doc, signal?)` (Task 3), `setDocumentSummary(id, summary)` (Task 2), `DocMeta.summary` (Task 2).

- [ ] **Step 1: Locate the doc row action area and the doc-name render sites**

Run: `grep -n "onRenameDoc\|onDeleteDoc\|doc.name" src/components/Sidebar.tsx`

Two things to find: (a) where rename/delete/pin buttons render per doc (same spot the auto-organization plan's "Suggest tags" button goes, if both land — put "Summarize" as a sibling button there), and (b) every place `doc.name` is rendered as the row label, including inside `searchResults.map(...)` (around line 317-339) and the folder-tree doc rows — `doc.summary` needs a line under the name in both places, matching the existing `matchedIn === 'content'` snippet's styling (`text-xs text-ink-400`).

- [ ] **Step 2: Add state and the summarize flow**

```typescript
import { summarizeDoc } from '../lib/docSummary';
import { setDocumentSummary } from '../lib/documents';

// inside the Sidebar component:
const [summarizing, setSummarizing] = useState<Set<string>>(new Set());
const [summarizeError, setSummarizeError] = useState<{ id: string; message: string } | null>(null);

const runSummarize = (doc: DocMeta) => {
  setSummarizing((prev) => new Set(prev).add(doc.id));
  setSummarizeError(null);
  summarizeDoc(doc)
    .then((summary) => setDocumentSummary(doc.id, summary))
    .catch((err) =>
      setSummarizeError({
        id: doc.id,
        message: err instanceof Error ? err.message : 'Failed to summarize.',
      }),
    )
    .finally(() =>
      setSummarizing((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      }),
    );
};
```

Note: like the auto-organization plan's Task 5, `setDocumentSummary` mutates localStorage directly — confirm whether `Sidebar.tsx` needs a callback prop into `App.tsx` to trigger a re-render of its `docs` prop (check how `onTogglePin`/`setDocumentPinned` are wired: is `setDocumentPinned` called directly inside `Sidebar.tsx`, or via an `onTogglePin` prop that `App.tsx` implements? Match that exact pattern here — if `onTogglePin` is a prop, add `onSummarize?: (id: string, summary: string) => void` to `SidebarProps` and have `App.tsx` own the `setDocumentSummary` call instead of calling it directly from `Sidebar.tsx`).

- [ ] **Step 3: Add the button to doc rows**

```tsx
<button
  type="button"
  aria-label="Summarize"
  title="Summarize"
  disabled={summarizing.has(doc.id)}
  onClick={() => runSummarize(doc)}
  className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-900 disabled:opacity-40"
>
  <SparkleIcon size={14} />
</button>
```

If the auto-organization plan's "Suggest tags" button already uses `SparkleIcon` in the same row, use a visually distinct icon here instead to avoid two identical-looking buttons — check `src/components/icons.tsx` for `FocusIcon` or similar already-imported icon that reads as "summarize"; if none fits, reuse `SparkleIcon` but give each button a clearly different `title`/`aria-label` (already done above) so they're distinguishable by tooltip even if visually similar — do not block this task on designing a new icon.

- [ ] **Step 4: Render the cached summary under the doc name**

In the folder-tree doc row (wherever `doc.name` renders as the primary label) and in the search-results row (around line 328-330), add directly beneath the name span:

```tsx
{doc.summary && (
  <span className="block truncate pl-[22px] text-xs text-ink-400">{doc.summary}</span>
)}
```

Adjust the `pl-[22px]` to match whatever indentation the existing snippet/tag lines in that specific location already use (the search-results block uses `pl-[22px]` per the current `matchedIn === 'content'` branch — the folder-tree doc row may use different spacing; match its sibling elements, don't invent a new value).

Also show the summarize error inline if present:

```tsx
{summarizeError?.id === doc.id && (
  <span className="block pl-[22px] text-xs text-red-400">{summarizeError.message}</span>
)}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. Create a doc with a text box containing a few sentences, click "Summarize" in the Sidebar, confirm a one-line summary appears under the doc's name in the folder tree. Search for something matching that doc and confirm the summary also appears (or doesn't clash awkwardly) alongside the search snippet.

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat(ai): wire Summarize action + cached-summary display into Sidebar"
```

## Task 5: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Manual end-to-end check**

Repeat Task 4 Step 6. Additionally verify: summarizing twice overwrites the cached value (no duplicate lines), and a doc with zero text content shows the "no text content" error without a network call.

- [ ] **Step 4: Commit any final fixes**

If Steps 1–3 surfaced anything, fix and commit; otherwise no commit for this task.
