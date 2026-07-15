# AI Auto-Organization (Phase 3 #13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user click a "Suggest tags" action on a document that calls the AI backend with the document's text content and applies the returned tag suggestions via the existing `setDocumentTags`.

**Architecture:** Extend `api/refine.ts`'s existing `PROMPTS` map with a new `'suggest-tags'` action (same unauthenticated Vercel-AI-Gateway/Claude-Haiku pattern already used for polish/grammar/etc. — no new endpoint, no new auth). The client composes the document's existing recognized/typed text (reusing `collectDocText`-equivalent content already read for search) into one `refine('suggest-tags', text)` call, parses a newline-delimited tag list from the response, and shows a confirmation UI before calling `setDocumentTags`. **Per the user's explicit decision, this is manual-trigger only — no automatic call on every save.** A doc with zero text content (pure ink, never OCR'd or converted) has nothing to suggest from; the action is disabled/hidden in that case rather than silently no-op'ing.

**Tech Stack:** `api/refine.ts` (Vercel serverless + `ai` SDK), `src/lib/ai.ts` (client), `src/lib/documents.ts` (`setDocumentTags`, existing), React, Vitest.

## Global Constraints

- Manual trigger only — a user-initiated button click, never fired from `useLocalStorage`'s `onSaved` or any other save-path hook (confirmed decision — the app is local-first/mostly-offline and unwanted background AI calls on every doc are unacceptable UX).
- No new backend service or auth requirement — extend the existing unauthenticated `/api/refine` action set, matching `api/refine.ts`'s established pattern (`PROMPTS: Record<Action, (t: string) => string>`, Haiku model, Gateway fallback list, 402/429/503 error mapping).
- Reuse `setDocumentTags(id, tags)` (`src/lib/documents.ts:652`) as-is for persistence — do not add a parallel tag-write path.
- Suggested tags are always a **proposal the user confirms**, never auto-applied silently — mirrors how Convert-to-text requires the user to accept the OCR result rather than blind-writing it.
- Reuse `collectDocText`'s traversal logic (doc aux + every page aux for notebook docs) rather than duplicating it — if that logic isn't already exported, export it rather than copy-pasting.

---

## File Structure

- **Modify `api/refine.ts`** — add `'suggest-tags'` to the `Action` union and `PROMPTS` map.
- **Modify `src/lib/ai.ts`** — add `'suggest-tags'` to `RefineAction`. Not added to `REFINE_ACTIONS` (that list drives the AI-studio chip UI for refining *selected text*, a different surface — this is a doc-level action reached from the Sidebar/doc menu instead).
- **Create `src/lib/tagSuggestion.ts`** — `suggestTags(doc: DocMeta): Promise<string[]>`: gathers the doc's text content, calls `refine('suggest-tags', text)`, parses the response into a clean tag array.
- **Modify `src/lib/documents.ts`** — export `collectDocText` (currently module-private) so `tagSuggestion.ts` can reuse it instead of re-implementing the doc-aux + per-page-aux walk.
- **Create `src/components/TagSuggestionDialog.tsx`** — small confirm UI: shows suggested tags as removable chips, lets the user edit before confirming, calls `onConfirm(tags: string[])`.
- **Modify `src/components/Sidebar.tsx`** — add a "Suggest tags" action to each doc's row menu (wherever rename/delete/pin actions already live), wired to `tagSuggestion.ts` + `TagSuggestionDialog` + `setDocumentTags`.

## Task 1: Backend — add the `suggest-tags` refine action

**Files:**
- Modify: `api/refine.ts`

**Interfaces:**
- Consumes: nothing new — same `POST { action, text } -> { result }` contract.
- Produces: `action: 'suggest-tags'` now accepted; `result` is a newline-delimited list of short tag strings.

- [ ] **Step 1: Add the action to the type union and prompt map**

In `api/refine.ts`, extend the `Action` type:

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
  | 'suggest-tags';
```

And add a prompt to `PROMPTS`:

```typescript
const PROMPTS: Record<Action, (t: string) => string> = {
  // ...existing entries unchanged...
  'suggest-tags': (t) =>
    `Suggest 2 to 5 short, lowercase, single-or-two-word organizational tags for the following note (e.g. "meeting", "recipe", "project-x"). No hashtags, no punctuation, no explanations. Return only the tags, one per line, nothing else.\n\n"""${t}"""`,
};
```

- [ ] **Step 2: Manual verification (no existing api/ test harness to extend)**

Run: `grep -rn "api/refine" src/ --include="*.test.ts"` to confirm whether any test currently exercises this file directly.

Expected: none (the existing `api/refine.ts` has no dedicated test file — it's a thin Vercel handler; client-side behavior is what's tested via `src/lib/ai.test.ts`). This step just confirms there's no hidden contract test to also update.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the `Action` union and `PROMPTS` record stay in sync by construction — TypeScript enforces every union member has a `PROMPTS` entry).

- [ ] **Step 4: Commit**

```bash
git add api/refine.ts
git commit -m "feat(ai): add suggest-tags refine action"
```

## Task 2: Client — `RefineAction` type + `collectDocText` export

**Files:**
- Modify: `src/lib/ai.ts`
- Modify: `src/lib/documents.ts:700-711` (`collectDocText`)
- Test: `src/lib/documents.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RefineAction` includes `'suggest-tags'`; `export function collectDocText(doc: DocMeta): string[]` (was module-private, now exported — signature unchanged).

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
  | 'suggest-tags';
```

Leave `REFINE_ACTIONS` (the AI-studio chip list) unchanged — `suggest-tags` is deliberately not added there since it operates on a whole document, not a text selection, and is reached from a different UI surface (Task 5).

- [ ] **Step 2: Write the failing test for the export**

```typescript
// append to src/lib/documents.test.ts
import { collectDocText } from './documents';

describe('collectDocText (exported for AI tag suggestion)', () => {
  it('is exported and returns text from doc aux', () => {
    const now = Date.now();
    ensureIndex(now);
    const doc = createDocument('Doc', now, 'canvas');
    writeAux(doc.id, { paper: 'grid', texts: [{ id: 't1', x: 0, y: 0, text: 'hello there', size: 16 }] });
    expect(collectDocText(doc)).toEqual(['hello there']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/documents.test.ts -t "collectDocText"`
Expected: FAIL — `collectDocText` is not exported (TypeScript compile error / undefined import).

- [ ] **Step 4: Export it**

In `src/lib/documents.ts`, change the function declaration at line 702 from `function collectDocText` to `export function collectDocText` — no other change to its body.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/documents.test.ts`
Expected: PASS — all tests green including the new one.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai.ts src/lib/documents.ts src/lib/documents.test.ts
git commit -m "feat(ai): export collectDocText, widen RefineAction for suggest-tags"
```

## Task 3: `suggestTags` client helper

**Files:**
- Create: `src/lib/tagSuggestion.ts`
- Create: `src/lib/tagSuggestion.test.ts`

**Interfaces:**
- Consumes: `refine(action, text, signal?): Promise<string>` from `./ai` (existing); `collectDocText(doc): string[]` from `./documents` (Task 2); `DocMeta` type from `./documents`.
- Produces: `export async function suggestTags(doc: DocMeta): Promise<string[]>` — throws the same user-facing `Error` that `refine()` throws on network/API failure; throws a distinct `Error('This document has no text content to suggest tags from.')` when `collectDocText(doc)` is empty (checked BEFORE calling `refine`, so an ink-only doc never spends an API call on nothing). Also exports `parseTagList(raw: string): string[]` for isolated testing of the parsing logic.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/tagSuggestion.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./ai', () => ({ refine: vi.fn() }));
vi.mock('./documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./documents')>();
  return { ...actual, collectDocText: vi.fn() };
});

import { refine } from './ai';
import { collectDocText } from './documents';
import { suggestTags, parseTagList } from './tagSuggestion';
import type { DocMeta } from './documents';

function doc(over: Partial<DocMeta> = {}): DocMeta {
  return { id: 'd1', name: 'Test', createdAt: 0, updatedAt: 0, mode: 'canvas', ...over };
}

describe('parseTagList', () => {
  it('splits newline-delimited tags, trims, lowercases, drops blanks', () => {
    expect(parseTagList('Meeting\n  recipe \n\nProject-X\n')).toEqual([
      'meeting',
      'recipe',
      'project-x',
    ]);
  });

  it('strips leading bullet/dash markers some models add anyway', () => {
    expect(parseTagList('- meeting\n* recipe\n• project-x')).toEqual([
      'meeting',
      'recipe',
      'project-x',
    ]);
  });

  it('deduplicates case-insensitively', () => {
    expect(parseTagList('Meeting\nmeeting\nMEETING')).toEqual(['meeting']);
  });
});

describe('suggestTags', () => {
  it('throws without calling refine when the doc has no text content', async () => {
    vi.mocked(collectDocText).mockReturnValue([]);
    await expect(suggestTags(doc())).rejects.toThrow(/no text content/i);
    expect(refine).not.toHaveBeenCalled();
  });

  it('calls refine with joined doc text and parses the result', async () => {
    vi.mocked(collectDocText).mockReturnValue(['first note', 'second note']);
    vi.mocked(refine).mockResolvedValue('meeting\nfollow-up');

    const tags = await suggestTags(doc());
    expect(refine).toHaveBeenCalledWith('suggest-tags', 'first note\nsecond note', undefined);
    expect(tags).toEqual(['meeting', 'follow-up']);
  });

  it('propagates refine()\'s error message unchanged', async () => {
    vi.mocked(collectDocText).mockReturnValue(['some text']);
    vi.mocked(refine).mockRejectedValue(new Error('AI budget reached. Try again later.'));
    await expect(suggestTags(doc())).rejects.toThrow('AI budget reached. Try again later.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tagSuggestion.test.ts`
Expected: FAIL — `Cannot find module './tagSuggestion'`

- [ ] **Step 3: Implement**

```typescript
// src/lib/tagSuggestion.ts
import { refine } from './ai';
import { collectDocText } from './documents';
import type { DocMeta } from './documents';

/**
 * AI auto-organization (Phase 3 #13): suggest tags for a document from its
 * existing text content. Manual-trigger only — never called from the save
 * path. A pure-ink doc (no typed or OCR'd text) has nothing to suggest from,
 * so that case is rejected BEFORE the network call rather than sending an
 * empty prompt to the API.
 */

/** Parse the model's newline-delimited tag response into a clean array:
 *  trimmed, lowercased, blank lines dropped, leading bullet/dash markers
 *  stripped (models sometimes add them despite the prompt saying not to),
 *  case-insensitively deduplicated preserving first-seen order. */
export function parseTagList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const cleaned = line.replace(/^[\s\-*•]+/, '').trim().toLowerCase();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export async function suggestTags(doc: DocMeta, signal?: AbortSignal): Promise<string[]> {
  const text = collectDocText(doc).join('\n');
  if (!text.trim()) {
    throw new Error('This document has no text content to suggest tags from.');
  }
  const result = await refine('suggest-tags', text, signal);
  return parseTagList(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tagSuggestion.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tagSuggestion.ts src/lib/tagSuggestion.test.ts
git commit -m "feat(ai): add suggestTags client helper with tag-list parsing"
```

## Task 4: `TagSuggestionDialog` confirm UI

**Files:**
- Create: `src/components/TagSuggestionDialog.tsx`
- Create: `src/components/TagSuggestionDialog.test.tsx`

**Interfaces:**
- Consumes: none beyond props — pure presentational + local-state component, same family as `ConfirmDialog`/`PromptDialog` in `src/components/Dialog.tsx` (reuse their `Backdrop` styling pattern by following the same className conventions, not by importing `Backdrop` itself since it's not exported — confirm via `grep -n "^function Backdrop\|^export" src/components/Dialog.tsx` before writing, and export `Backdrop` from Dialog.tsx if reuse is cleaner than duplicating the wrapper markup).
- Produces:

```typescript
interface TagSuggestionDialogProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  suggested: string[];
  existingTags: string[];
  onConfirm: (tags: string[]) => void;
  onCancel: () => void;
}
export function TagSuggestionDialog(props: TagSuggestionDialogProps): React.ReactElement | null;
```

- [ ] **Step 1: Check whether `Backdrop` is exported from Dialog.tsx**

Run: `grep -n "^function Backdrop\|^export function Backdrop" src/components/Dialog.tsx`

If it prints `function Backdrop` (not exported), add `export` to that line in `src/components/Dialog.tsx` before proceeding — reusing the existing backdrop/card chrome keeps this new dialog visually consistent with `ConfirmDialog`/`PromptDialog` instead of hand-rolling a third copy of the same wrapper markup.

- [ ] **Step 2: Write the failing test**

```typescript
// src/components/TagSuggestionDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagSuggestionDialog } from './TagSuggestionDialog';

const noop = () => {};

describe('TagSuggestionDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <TagSuggestionDialog
        open={false}
        loading={false}
        error={null}
        suggested={[]}
        existingTags={[]}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a loading state', () => {
    render(
      <TagSuggestionDialog
        open
        loading
        error={null}
        suggested={[]}
        existingTags={[]}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByText(/suggesting/i)).toBeInTheDocument();
  });

  it('shows an error message', () => {
    render(
      <TagSuggestionDialog
        open
        loading={false}
        error="AI budget reached. Try again later."
        suggested={[]}
        existingTags={[]}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByText('AI budget reached. Try again later.')).toBeInTheDocument();
  });

  it('shows suggested tags as removable chips and confirms only the kept ones', () => {
    const onConfirm = vi.fn();
    render(
      <TagSuggestionDialog
        open
        loading={false}
        error={null}
        suggested={['meeting', 'follow-up', 'q3']}
        existingTags={['work']}
        onConfirm={onConfirm}
        onCancel={noop}
      />,
    );
    // Remove one suggested tag before confirming.
    fireEvent.click(screen.getByRole('button', { name: /remove follow-up/i }));
    fireEvent.click(screen.getByRole('button', { name: /add tags/i }));
    // existingTags are preserved and merged with the kept suggestions.
    expect(onConfirm).toHaveBeenCalledWith(['work', 'meeting', 'q3']);
  });

  it('calls onCancel on Cancel click', () => {
    const onCancel = vi.fn();
    render(
      <TagSuggestionDialog
        open
        loading={false}
        error={null}
        suggested={['meeting']}
        existingTags={[]}
        onConfirm={noop}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/TagSuggestionDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```tsx
// src/components/TagSuggestionDialog.tsx
import { useEffect, useState } from 'react';
import { Backdrop } from './Dialog';

/**
 * AI auto-organization (Phase 3 #13) confirm UI. Shows AI-suggested tags as
 * removable chips; the user prunes before confirming — suggestions are never
 * applied silently. Kept tags are merged with the document's existing tags
 * (setDocumentTags itself already dedupes/cleans, but this component sends a
 * combined, de-duplicated list either way for a predictable onConfirm
 * contract).
 */
interface TagSuggestionDialogProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  suggested: string[];
  existingTags: string[];
  onConfirm: (tags: string[]) => void;
  onCancel: () => void;
}

export function TagSuggestionDialog({
  open,
  loading,
  error,
  suggested,
  existingTags,
  onConfirm,
  onCancel,
}: TagSuggestionDialogProps) {
  const [kept, setKept] = useState<Set<string>>(new Set(suggested));

  // Reset the kept-set whenever a fresh suggestion list arrives (new dialog
  // open, or a retry after an error resolved into a new suggested[] array).
  useEffect(() => {
    setKept(new Set(suggested));
  }, [suggested]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const handleConfirm = () => {
    const merged = [...new Set([...existingTags, ...suggested.filter((t) => kept.has(t))])];
    onConfirm(merged);
  };

  return (
    <Backdrop onClose={onCancel} labelledBy="tag-suggestion-title">
      <h2 id="tag-suggestion-title" className="text-sm font-semibold text-ink-900">
        Suggest tags
      </h2>

      {loading && (
        <p className="mt-3 text-sm text-ink-400">Suggesting tags…</p>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}

      {!loading && !error && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggested.length === 0 && (
            <p className="text-sm text-ink-400">No tags suggested.</p>
          )}
          {suggested.map((tag) => {
            const isKept = kept.has(tag);
            return (
              <span
                key={tag}
                className={[
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  isKept ? 'bg-brand-600 text-white' : 'bg-bg-muted text-ink-400 line-through',
                ].join(' ')}
              >
                {tag}
                <button
                  type="button"
                  aria-label={isKept ? `Remove ${tag}` : `Restore ${tag}`}
                  onClick={() =>
                    setKept((prev) => {
                      const next = new Set(prev);
                      if (next.has(tag)) next.delete(tag);
                      else next.add(tag);
                      return next;
                    })
                  }
                  className="ml-0.5 opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-900"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading || !!error || suggested.length === 0}
          onClick={handleConfirm}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add tags
        </button>
      </div>
    </Backdrop>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/TagSuggestionDialog.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Dialog.tsx src/components/TagSuggestionDialog.tsx src/components/TagSuggestionDialog.test.tsx
git commit -m "feat(ai): add TagSuggestionDialog confirm UI"
```

## Task 5: Wire the action into Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `suggestTags(doc): Promise<string[]>` (Task 3), `TagSuggestionDialog` (Task 4), `setDocumentTags(id, tags)` (existing, already imported/used in this file's parent per `onTogglePin`-style prop wiring — confirm via `grep -n "setDocumentTags" src/components/Sidebar.tsx src/App.tsx`).

- [ ] **Step 1: Confirm where doc row actions (rename/delete/pin) currently live**

Run: `grep -n "onRenameDoc\|onDeleteDoc\|onTogglePin" src/components/Sidebar.tsx | head -20`

Locate the `DocRow`-equivalent component/JSX inside `Sidebar.tsx` where these three actions render as buttons — the new "Suggest tags" action goes in the same menu/action row.

- [ ] **Step 2: Add local state and the suggest-tags flow**

Near the top of the `Sidebar` component function, add:

```typescript
import { suggestTags } from '../lib/tagSuggestion';
import { setDocumentTags } from '../lib/documents';
import { TagSuggestionDialog } from './TagSuggestionDialog';

// ... inside the Sidebar component, alongside the other useState calls:
const [suggestingFor, setSuggestingFor] = useState<DocMeta | null>(null);
const [suggestLoading, setSuggestLoading] = useState(false);
const [suggestError, setSuggestError] = useState<string | null>(null);
const [suggested, setSuggested] = useState<string[]>([]);

const startSuggestTags = (doc: DocMeta) => {
  setSuggestingFor(doc);
  setSuggestLoading(true);
  setSuggestError(null);
  setSuggested([]);
  suggestTags(doc)
    .then((tags) => setSuggested(tags))
    .catch((err) => setSuggestError(err instanceof Error ? err.message : 'Failed to suggest tags.'))
    .finally(() => setSuggestLoading(false));
};
```

- [ ] **Step 3: Add the button to each doc row**

Wherever the existing rename/delete/pin buttons render per-doc (found in Step 1), add a sibling button:

```tsx
<button
  type="button"
  aria-label="Suggest tags"
  title="Suggest tags"
  onClick={() => startSuggestTags(doc)}
  className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-900"
>
  <SparkleIcon size={14} />
</button>
```

Add `SparkleIcon` to the existing icon import list at the top of `Sidebar.tsx` (it already exists in `src/components/icons.tsx`, used by `ConvertButton` in Toolbar.tsx).

- [ ] **Step 4: Render the dialog and wire confirm**

Near the other dialogs already rendered at the bottom of `Sidebar`'s JSX (`ConfirmDialog`/`PromptDialog` instances for rename/delete), add:

```tsx
<TagSuggestionDialog
  open={suggestingFor !== null}
  loading={suggestLoading}
  error={suggestError}
  suggested={suggested}
  existingTags={suggestingFor?.tags ?? []}
  onConfirm={(tags) => {
    if (suggestingFor) setDocumentTags(suggestingFor.id, tags);
    setSuggestingFor(null);
  }}
  onCancel={() => setSuggestingFor(null)}
/>
```

Note: `setDocumentTags` mutates the localStorage index directly (it's not a prop passed down from `App.tsx` — confirm this via Step 1's grep; if `Sidebar.tsx` receives docs via a `docs` prop that needs a refresh callback after mutation, check how the existing rename/delete actions trigger a re-render — likely `onRenameDoc`/`onDeleteDoc` are themselves prop callbacks into `App.tsx` that call the `documents.ts` function AND update the app's `docs` state. If so, add a matching `onTagsSuggested?: (id: string, tags: string[]) => void` prop to `SidebarProps` instead of calling `setDocumentTags` directly from inside `Sidebar.tsx`, and have `App.tsx` own the call — follow whatever pattern `onTogglePin`/`setDocumentPinned` already uses, since that's the closest existing analog (a doc-meta field mutated from a Sidebar-initiated action).**

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. Create a doc, add a text box with some content (e.g. "Q3 planning meeting notes"), open the Sidebar, click "Suggest tags" on that doc, confirm the dialog shows AI-suggested tags, remove one, click "Add tags", confirm the doc's tags updated (visible via the doc's tag display or by re-opening the suggest-tags dialog and seeing `existingTags` reflect the change).

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat(ai): wire Suggest tags action into Sidebar doc rows"
```

## Task 6: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Manual end-to-end check**

Repeat Task 5 Step 6, additionally testing: (a) a doc with zero text content shows the "no text content" error immediately without a network call (check the Network tab / add a temporary console.log if needed, then remove it), (b) an offline test (disable network in devtools) surfaces `refine()`'s existing "Network error" message inside the dialog's error state.

- [ ] **Step 4: Commit any final fixes**

If Steps 1–3 surfaced anything, fix and commit; otherwise no commit for this task.
