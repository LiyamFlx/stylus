# Custom Templates (Phase 3 #11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user save the current notebook page (its paper background + ink + shapes, rasterized) as a reusable custom template, stored user-scoped alongside the bundled manifest, selectable from the existing `TemplateGallery` picker.

**Architecture:** Bundled templates (`src/lib/templates.ts`) are static webp assets referenced by a fetched `manifest.json` — read-only, never user data. Custom templates need a **parallel, additive registry** with the same `TemplateDef`-compatible shape but backed by user data: metadata in localStorage (mirroring `documents.ts`'s index pattern) and the rasterized bitmap as a `Blob` in a new IndexedDB object store (mirroring `src/lib/imageStore.ts`'s exact pattern — same DB-per-purpose separation the codebase already uses for image underlays). "Save as template" rasterizes the current page via the existing `buildPNGBlob`/`renderToCanvas` machinery in `src/lib/export.ts` (no new rendering code), stores the blob, and registers a `CustomTemplateDef` the gallery can render as another card. `TemplateGallery` is extended (not replaced) to merge bundled + custom entries, with custom ones additionally deletable from the picker.

**Tech Stack:** IndexedDB (new store, same driver pattern as `imageStore.ts`), localStorage (metadata index, same pattern as `documents.ts`), existing `src/lib/export.ts` rasterization, `src/lib/templates.ts` (extended, not replaced), React, Vitest.

## Global Constraints

- Never touch or extend the bundled `manifest.json` / `templates.ts` bitmap-cache internals — custom templates are a **separate, additive** registry that the gallery merges at render time. Bundled templates must keep working identically if this feature is reverted.
- Custom template bitmaps live in IndexedDB (new store `stylus-custom-templates`), never localStorage — same rationale as `imageStore.ts` (a rasterized A4 page PNG is well over the ~5MB origin-quota-shared budget localStorage already strains under, per the product audit's storage-ceiling finding).
- Reuse `buildPNGBlob`/`renderToCanvas` from `src/lib/export.ts` for rasterization — do not write a second canvas-rendering path.
- A custom template's `TemplateDef`-shaped metadata must satisfy the exact same interface the gallery already consumes (`id, name, category, use, orientation, full, thumb, width, height`) so `TemplateGallery.tsx`'s existing card-rendering JSX needs only a data-source change, not a rewrite — `full`/`thumb` become blob URLs instead of `/templates/...` paths.
- Deleting a custom template must clean up its IndexedDB blob (mirrors `imageStore.deleteImages` / `documents.ts`'s image-purge-before-index-sweep ordering rule).
- Deleting a document/page must NOT delete any custom template built from it — a saved template is an independent artifact once created (same relationship bundled templates already have to the docs that use them).

---

## File Structure

- **Create `src/lib/customTemplateStore.ts`** — IndexedDB blob store for custom template bitmaps (mirrors `imageStore.ts` exactly: `putTemplateBitmap`, `getTemplateBitmap`, `deleteTemplateBitmaps`).
- **Create `src/lib/customTemplates.ts`** — localStorage-backed metadata registry (mirrors `documents.ts`'s index pattern): `CustomTemplateDef` type, `listCustomTemplates()`, `createCustomTemplate(...)`, `deleteCustomTemplate(id)`, `renameCustomTemplate(id, name)`.
- **Create `src/lib/customTemplates.test.ts`** and **`src/lib/customTemplateStore.test.ts`**.
- **Modify `src/lib/templates.ts`** — add a small `mergedTemplateList(bundled, custom): TemplateDef[]`-style adapter, OR (simpler, chosen here) keep `templates.ts` untouched and do the merge in `TemplateGallery.tsx` itself, since `templates.ts`'s module is scoped tightly to the bundled-manifest lifecycle per its own doc comment and shouldn't grow a second concern.
- **Modify `src/components/TemplateGallery.tsx`** — merge bundled + custom templates for display, resolve custom thumb/full via blob URLs, add a delete affordance on custom cards only.
- **Create `src/components/SaveAsTemplateDialog.tsx`** — name-prompt + rasterize-and-save flow, triggered from the page template picker or a new toolbar/menu entry.
- **Modify `src/App.tsx`** — wire a "Save as template" trigger (near the existing `templatePickerOpen`/`TemplateGallery` wiring) that has access to the current page's strokes/shapes/paper to rasterize.

## Task 1: `customTemplateStore.ts` — IndexedDB blob store

**Files:**
- Create: `src/lib/customTemplateStore.ts`
- Create: `src/lib/customTemplateStore.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module, like `imageStore.ts`).
- Produces:
  - `export async function putTemplateBitmap(id: string, blob: Blob): Promise<void>`
  - `export async function getTemplateBitmap(id: string): Promise<Blob | null>`
  - `export async function deleteTemplateBitmaps(ids: string[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/customTemplateStore.test.ts
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { putTemplateBitmap, getTemplateBitmap, deleteTemplateBitmaps } from './customTemplateStore';

describe('customTemplateStore', () => {
  it('returns null for an id that was never stored', async () => {
    expect(await getTemplateBitmap('nope')).toBeNull();
  });

  it('round-trips a stored blob', async () => {
    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' });
    await putTemplateBitmap('t1', blob);
    const got = await getTemplateBitmap('t1');
    expect(got).not.toBeNull();
    expect(got?.type).toBe('image/png');
  });

  it('deletes the requested ids and leaves others intact', async () => {
    await putTemplateBitmap('t2', new Blob(['a']));
    await putTemplateBitmap('t3', new Blob(['b']));
    await deleteTemplateBitmaps(['t2']);
    expect(await getTemplateBitmap('t2')).toBeNull();
    expect(await getTemplateBitmap('t3')).not.toBeNull();
  });

  it('deleteTemplateBitmaps is a safe no-op for an empty array', async () => {
    await expect(deleteTemplateBitmaps([])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Confirm `fake-indexeddb` is available (imageStore's own tests must use something — check first)**

Run: `grep -rn "fake-indexeddb\|indexedDB" src/lib/imageStore.test.ts vitest.config.ts vite.config.ts package.json 2>/dev/null`

If `imageStore.test.ts` doesn't exist or uses a different IndexedDB shim/mock, mirror whatever pattern it (or the vitest environment config) already establishes instead of introducing `fake-indexeddb` fresh — jsdom (the likely test environment per other component tests) may already provide a usable `indexedDB` global, or the project may rely on a setup file. Adjust Step 1's test imports accordingly once confirmed.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/customTemplateStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement, mirroring `src/lib/imageStore.ts` exactly**

```typescript
// src/lib/customTemplateStore.ts
/**
 * IndexedDB blob store for user-saved custom page templates (Phase 3 #11).
 *
 * Same rationale and shape as imageStore.ts: a rasterized A4 page PNG is
 * multiple MB, well past what localStorage should hold alongside every
 * document's ink. A separate object store (not reusing imageStore's) keeps
 * template bitmaps on an independent lifecycle from image underlays — a
 * template is never cleaned up by document/page deletion (see
 * customTemplates.ts), so mixing them into one store would make that
 * distinction harder to enforce correctly.
 */

const DB_NAME = 'stylus-custom-templates';
const STORE = 'templates';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error('IndexedDB open failed'));
      };
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putTemplateBitmap(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(blob, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getTemplateBitmap(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Best-effort cleanup — an orphaned blob is a quota leak, but a failed
 *  delete must never block template-registry deletion. */
export async function deleteTemplateBitmaps(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openDb();
    await Promise.all(
      ids.map(
        (id) =>
          new Promise<void>((resolve) => {
            const req = tx(db, 'readwrite').delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
          }),
      ),
    );
  } catch {
    // storage unavailable — nothing to clean
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/customTemplateStore.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/customTemplateStore.ts src/lib/customTemplateStore.test.ts
git commit -m "feat(templates): add IndexedDB blob store for custom templates"
```

## Task 2: `customTemplates.ts` — metadata registry

**Files:**
- Create: `src/lib/customTemplates.ts`
- Create: `src/lib/customTemplates.test.ts`

**Interfaces:**
- Consumes: `deleteTemplateBitmaps(ids)` from `./customTemplateStore` (Task 1).
- Produces:

```typescript
export interface CustomTemplateDef {
  id: string;
  name: string;
  category: 'custom';
  use: 'page';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  createdAt: number;
}
export function listCustomTemplates(): CustomTemplateDef[];
export function createCustomTemplateMeta(
  name: string,
  width: number,
  height: number,
  now: number,
): CustomTemplateDef; // metadata only — caller stores the bitmap separately via customTemplateStore
export function renameCustomTemplate(id: string, name: string): void;
export function deleteCustomTemplate(id: string): void; // removes metadata AND the IndexedDB blob
```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/customTemplates.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./customTemplateStore', () => ({
  deleteTemplateBitmaps: vi.fn().mockResolvedValue(undefined),
}));

import { deleteTemplateBitmaps } from './customTemplateStore';
import {
  listCustomTemplates,
  createCustomTemplateMeta,
  renameCustomTemplate,
  deleteCustomTemplate,
} from './customTemplates';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(deleteTemplateBitmaps).mockClear();
});

describe('customTemplates registry', () => {
  it('starts empty', () => {
    expect(listCustomTemplates()).toEqual([]);
  });

  it('creates and lists a template', () => {
    const t = createCustomTemplateMeta('My planner page', 1240, 1754, 1000);
    expect(t.category).toBe('custom');
    expect(t.use).toBe('page');
    expect(t.orientation).toBe('portrait');
    expect(listCustomTemplates()).toEqual([t]);
  });

  it('detects landscape orientation from dimensions', () => {
    const t = createCustomTemplateMeta('Wide page', 1754, 1240, 1000);
    expect(t.orientation).toBe('landscape');
  });

  it('renames a template', () => {
    const t = createCustomTemplateMeta('Old name', 1240, 1754, 1000);
    renameCustomTemplate(t.id, 'New name');
    expect(listCustomTemplates()[0].name).toBe('New name');
  });

  it('deletes a template\'s metadata and purges its bitmap', () => {
    const t = createCustomTemplateMeta('Temp', 1240, 1754, 1000);
    deleteCustomTemplate(t.id);
    expect(listCustomTemplates()).toEqual([]);
    expect(deleteTemplateBitmaps).toHaveBeenCalledWith([t.id]);
  });

  it('assigns unique ids to successive templates', () => {
    const a = createCustomTemplateMeta('A', 1240, 1754, 1000);
    const b = createCustomTemplateMeta('B', 1240, 1754, 1000);
    expect(a.id).not.toBe(b.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/customTemplates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/customTemplates.ts
import { createId } from './id';
import { deleteTemplateBitmaps } from './customTemplateStore';

/**
 * User-scoped custom page templates (Phase 3 #11), stored ALONGSIDE the
 * bundled manifest (lib/templates.ts) — never merged into it. Bundled
 * templates are static assets fetched from a versioned manifest.json;
 * custom ones are user data (localStorage metadata + IndexedDB bitmap, see
 * customTemplateStore.ts), so they need their own registry with the same
 * read-modify-write-to-localStorage shape documents.ts already uses.
 *
 * Deliberately NOT cross-referenced with the document/page that produced
 * one — once saved, a custom template is an independent artifact, exactly
 * like a bundled template has no back-reference to "who used it." Deleting
 * the source document/page must never delete a template built from it.
 */

export interface CustomTemplateDef {
  id: string;
  name: string;
  category: 'custom';
  use: 'page';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  createdAt: number;
}

const INDEX_KEY = 'stylus.customTemplates.v1';

interface CustomTemplateIndex {
  version: 1;
  templates: CustomTemplateDef[];
}

function readIndex(): CustomTemplateIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return { version: 1, templates: [] };
    const parsed = JSON.parse(raw) as CustomTemplateIndex;
    if (parsed.version !== 1 || !Array.isArray(parsed.templates)) {
      return { version: 1, templates: [] };
    }
    return parsed;
  } catch {
    return { version: 1, templates: [] };
  }
}

function writeIndex(idx: CustomTemplateIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    // Best-effort, same as documents.ts's write() — a failed metadata write
    // leaves the just-created bitmap orphaned in IndexedDB, an acceptable
    // rare-quota-exhaustion edge case rather than new complexity to prevent it.
  }
}

export function listCustomTemplates(): CustomTemplateDef[] {
  return readIndex().templates;
}

/** Registers metadata only — the caller is responsible for storing the
 *  actual bitmap via `putTemplateBitmap(returned.id, blob)` (see
 *  customTemplateStore.ts). Split this way so rasterization (async, can
 *  fail independently) and metadata registration stay decoupled, matching
 *  how imageStore.ts's putImage is a separate call from ImageItem creation. */
export function createCustomTemplateMeta(
  name: string,
  width: number,
  height: number,
  now: number,
): CustomTemplateDef {
  const def: CustomTemplateDef = {
    id: createId('ct_'),
    name,
    category: 'custom',
    use: 'page',
    orientation: width >= height ? 'landscape' : 'portrait',
    width,
    height,
    createdAt: now,
  };
  const idx = readIndex();
  writeIndex({ ...idx, templates: [...idx.templates, def] });
  return def;
}

export function renameCustomTemplate(id: string, name: string): void {
  const idx = readIndex();
  writeIndex({
    ...idx,
    templates: idx.templates.map((t) => (t.id === id ? { ...t, name } : t)),
  });
}

export function deleteCustomTemplate(id: string): void {
  const idx = readIndex();
  writeIndex({ ...idx, templates: idx.templates.filter((t) => t.id !== id) });
  void deleteTemplateBitmaps([id]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/customTemplates.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customTemplates.ts src/lib/customTemplates.test.ts
git commit -m "feat(templates): add custom-template metadata registry"
```

## Task 3: `SaveAsTemplateDialog` — rasterize current page and save

**Files:**
- Create: `src/components/SaveAsTemplateDialog.tsx`
- Create: `src/components/SaveAsTemplateDialog.test.tsx`

**Interfaces:**
- Consumes: `buildPNGBlob(strokes, opts): Promise<Blob>` from `../lib/export.ts` (existing); `createCustomTemplateMeta`, from `../lib/customTemplates`; `putTemplateBitmap` from `../lib/customTemplateStore`; `A4_BOUNDS` from `../lib/geometry` (existing, gives the 794×1123 portrait page dimensions used elsewhere for export sizing — confirm via `grep -n "A4_BOUNDS" src/lib/geometry.ts src/lib/export.ts` for the exact numbers already in use, e.g. in `buildPDFPagesBlob`, and reuse them rather than hardcoding new ones).
- Produces:

```typescript
interface SaveAsTemplateDialogProps {
  open: boolean;
  strokes: Stroke[];
  shapes: Shape[];
  paper: PaperStyle;
  templateId?: string | null; // existing page background, if any, to bake in — pass through to renderToCanvas's opts the same way export.ts callers already do
  onSaved: () => void;
  onCancel: () => void;
}
export function SaveAsTemplateDialog(props): React.ReactElement | null;
```

- [ ] **Step 1: Confirm `buildPNGBlob`'s exact option shape and A4 dimensions before writing the test**

Run: `grep -n "A4_BOUNDS\|buildPNGBlob\|ExportOptions" src/lib/export.ts src/lib/geometry.ts | head -20`

Note the exact `width`/`height` values (`A4_BOUNDS.maxX - A4_BOUNDS.minX`, etc. — already computed this way elsewhere per `export.ts`'s existing PDF/PNG callers) and the `ExportOptions` field names (`width, height, background, paper, texts, scale, ruling, templateId, shapes`) to use verbatim in Step 3.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/SaveAsTemplateDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';

vi.mock('../lib/export', () => ({
  buildPNGBlob: vi.fn().mockResolvedValue(new Blob(['fake'], { type: 'image/png' })),
}));
vi.mock('../lib/customTemplates', () => ({
  createCustomTemplateMeta: vi.fn().mockReturnValue({
    id: 'ct_1',
    name: 'My template',
    category: 'custom',
    use: 'page',
    orientation: 'portrait',
    width: 794,
    height: 1123,
    createdAt: 1000,
  }),
}));
vi.mock('../lib/customTemplateStore', () => ({
  putTemplateBitmap: vi.fn().mockResolvedValue(undefined),
}));

import { buildPNGBlob } from '../lib/export';
import { createCustomTemplateMeta } from '../lib/customTemplates';
import { putTemplateBitmap } from '../lib/customTemplateStore';

const noop = () => {};

beforeEach(() => {
  vi.mocked(buildPNGBlob).mockClear();
  vi.mocked(createCustomTemplateMeta).mockClear();
  vi.mocked(putTemplateBitmap).mockClear();
});

describe('SaveAsTemplateDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SaveAsTemplateDialog
        open={false}
        strokes={[]}
        shapes={[]}
        paper="notebook"
        onSaved={noop}
        onCancel={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('rasterizes and saves on confirm with the entered name', async () => {
    const onSaved = vi.fn();
    render(
      <SaveAsTemplateDialog
        open
        strokes={[]}
        shapes={[]}
        paper="notebook"
        onSaved={onSaved}
        onCancel={noop}
      />,
    );
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'My planner' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(buildPNGBlob).toHaveBeenCalled();
    expect(createCustomTemplateMeta).toHaveBeenCalledWith(
      'My planner',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(putTemplateBitmap).toHaveBeenCalledWith('ct_1', expect.any(Blob));
  });

  it('disables Save while the name is empty', () => {
    render(
      <SaveAsTemplateDialog
        open
        strokes={[]}
        shapes={[]}
        paper="notebook"
        onSaved={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('calls onCancel on Cancel click', () => {
    const onCancel = vi.fn();
    render(
      <SaveAsTemplateDialog
        open
        strokes={[]}
        shapes={[]}
        paper="notebook"
        onSaved={noop}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/SaveAsTemplateDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```tsx
// src/components/SaveAsTemplateDialog.tsx
import { useState } from 'react';
import type { PaperStyle, Shape, Stroke } from '../types';
import { buildPNGBlob } from '../lib/export';
import { createCustomTemplateMeta } from '../lib/customTemplates';
import { putTemplateBitmap } from '../lib/customTemplateStore';
import { A4_BOUNDS } from '../lib/geometry';
import { Backdrop } from './Dialog';

/**
 * "Save this page as a template" (Phase 3 #11). Rasterizes the current
 * page's paper + ink + shapes via the same buildPNGBlob() export.ts already
 * uses for PNG export, then registers it as a custom template (metadata in
 * customTemplates.ts, bitmap blob in customTemplateStore.ts) — the same
 * split imageStore.ts/documents.ts already use for image underlays.
 */
interface SaveAsTemplateDialogProps {
  open: boolean;
  strokes: Stroke[];
  shapes: Shape[];
  paper: PaperStyle;
  /** Existing page-background template, if any, to bake in as the base
   *  layer under the user's own ink — matches export.ts callers' existing
   *  `templateId` option. Caller must have already called
   *  `ensureTemplateBitmap(templateId)` if set (same contract export.ts's
   *  ExportOptions.templateId already documents). */
  templateId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

const PAGE_WIDTH = A4_BOUNDS.maxX - A4_BOUNDS.minX;
const PAGE_HEIGHT = A4_BOUNDS.maxY - A4_BOUNDS.minY;

export function SaveAsTemplateDialog({
  open,
  strokes,
  shapes,
  paper,
  templateId = null,
  onSaved,
  onCancel,
}: SaveAsTemplateDialogProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await buildPNGBlob(strokes, {
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        paper,
        shapes,
        templateId,
        // Bake onto a light background — a template thumbnail is a page
        // background, meant to read as paper, not the dark canvas chrome.
        background: '#ffffff',
      });
      const meta = createCustomTemplateMeta(trimmed, PAGE_WIDTH, PAGE_HEIGHT, Date.now());
      await putTemplateBitmap(meta.id, blob);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this page as a template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Backdrop onClose={onCancel} labelledBy="save-template-title">
      <h2 id="save-template-title" className="text-sm font-semibold text-ink-900">
        Save as template
      </h2>
      <p className="mt-1 text-xs text-ink-400">
        Saves this page's background and ink as a reusable template.
      </p>

      <label htmlFor="template-name" className="mt-4 block text-xs font-medium text-ink-400">
        Template name
      </label>
      <input
        id="template-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        className="mt-1 w-full rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm text-ink-900 outline-none focus:border-brand-500"
        placeholder="e.g. Weekly planner"
      />

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

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
          disabled={!name.trim() || saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Backdrop>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/SaveAsTemplateDialog.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `Backdrop` isn't yet exported from `Dialog.tsx` (check the auto-organization plan's Task 4, Step 1 — it may have already exported it), export it now.

- [ ] **Step 7: Commit**

```bash
git add src/components/SaveAsTemplateDialog.tsx src/components/SaveAsTemplateDialog.test.tsx src/components/Dialog.tsx
git commit -m "feat(templates): add SaveAsTemplateDialog (rasterize + register)"
```

## Task 4: Extend `TemplateGallery` to show custom templates

**Files:**
- Modify: `src/components/TemplateGallery.tsx`
- Test: `src/components/TemplateGallery.test.tsx` if it exists (`ls src/components/TemplateGallery.test.tsx 2>/dev/null`); create one if not.

**Interfaces:**
- Consumes: `listCustomTemplates()` from `../lib/customTemplates`; `getTemplateBitmap(id): Promise<Blob | null>` from `../lib/customTemplateStore`; `deleteCustomTemplate(id)` from `../lib/customTemplates`.
- Produces: no new exports — `TemplateGallery`'s existing props (`mode, selectedId, onSelect, onClose`) are unchanged; custom templates just appear as additional cards.

- [ ] **Step 1: Check for an existing test file**

Run: `ls src/components/TemplateGallery.test.tsx 2>/dev/null || echo "none — will create one"`

- [ ] **Step 2: Write/extend the test**

```tsx
// src/components/TemplateGallery.test.tsx (create if it doesn't exist; if it
// does, add this describe block to the existing file without disturbing its
// current tests)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TemplateGallery } from './TemplateGallery';

vi.mock('../lib/templates', () => ({
  loadTemplateManifest: vi.fn().mockResolvedValue({ version: 1, templates: [] }),
}));
vi.mock('../lib/customTemplates', () => ({
  listCustomTemplates: vi.fn().mockReturnValue([
    {
      id: 'ct_1',
      name: 'My planner',
      category: 'custom',
      use: 'page',
      orientation: 'portrait',
      width: 794,
      height: 1123,
      createdAt: 1000,
    },
  ]),
  deleteCustomTemplate: vi.fn(),
}));
vi.mock('../lib/customTemplateStore', () => ({
  getTemplateBitmap: vi.fn().mockResolvedValue(new Blob(['fake'], { type: 'image/png' })),
}));

// jsdom has no createObjectURL by default in some setups — stub it so the
// component's blob-URL resolution doesn't throw during the test.
beforeEach(() => {
  global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
  global.URL.revokeObjectURL = vi.fn();
});

describe('TemplateGallery — custom templates', () => {
  it('shows a custom template card alongside bundled ones', async () => {
    render(<TemplateGallery mode="page" selectedId={null} onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('My planner')).toBeInTheDocument());
  });

  it('selecting a custom template calls onSelect with its id', async () => {
    const onSelect = vi.fn();
    render(<TemplateGallery mode="page" selectedId={null} onSelect={onSelect} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('My planner'));
    fireEvent.click(screen.getByText('My planner'));
    expect(onSelect).toHaveBeenCalledWith('ct_1');
  });

  it('shows a delete affordance only on custom cards, and deletes on click', async () => {
    const { deleteCustomTemplate } = await import('../lib/customTemplates');
    render(<TemplateGallery mode="page" selectedId={null} onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('My planner'));
    fireEvent.click(screen.getByRole('button', { name: /delete "my planner"/i }));
    expect(deleteCustomTemplate).toHaveBeenCalledWith('ct_1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/TemplateGallery.test.tsx`
Expected: FAIL — no "My planner" card rendered yet.

- [ ] **Step 4: Implement the merge**

In `src/components/TemplateGallery.tsx`, add custom-template state and blob-URL resolution:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { TemplateCategory, TemplateDef } from '../lib/templates';
import { loadTemplateManifest } from '../lib/templates';
import { listCustomTemplates, deleteCustomTemplate, type CustomTemplateDef } from '../lib/customTemplates';
import { getTemplateBitmap } from '../lib/customTemplateStore';
import { TrashIcon } from './icons';
```

Add a `CATEGORY_LABELS` entry:

```tsx
const CATEGORY_LABELS: Record<TemplateCategory | 'custom', string> = {
  paper: 'Paper',
  planner: 'Planners',
  tracker: 'Trackers',
  finance: 'Finance',
  list: 'Lists',
  cover: 'Covers',
  custom: 'My templates',
};
```

Inside the component, load custom templates and resolve their blob URLs on mount:

```tsx
export function TemplateGallery({ mode, selectedId, onSelect, onClose }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<TemplateDef[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<TemplateCategory | 'custom' | 'all'>('all');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateDef[]>([]);
  const [customThumbs, setCustomThumbs] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let live = true;
    loadTemplateManifest()
      .then((m) => { if (live) setTemplates(m.templates); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []);

  const refreshCustomTemplates = () => setCustomTemplates(listCustomTemplates());
  useEffect(refreshCustomTemplates, []);

  // Resolve each custom template's stored blob into an object URL for <img>
  // src — revoked on unmount / when the set changes, same lifecycle rule as
  // any other blob-URL usage (ImageLayer likely does the same; mirror it if
  // so — grep "createObjectURL" src/components/ImageLayer.tsx first).
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    Promise.all(
      customTemplates.map(async (t) => {
        const blob = await getTemplateBitmap(t.id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return [t.id, url] as const;
      }),
    ).then((pairs) => {
      if (!live) return;
      setCustomThumbs(new Map(pairs.filter((p): p is [string, string] => p !== null)));
    });
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [customTemplates]);

  // ... existing Escape-key effect unchanged ...
```

Extend `usable`/`categories`/`visible` to fold in custom templates as `TemplateDef`-shaped entries (page-only, since `CustomTemplateDef.use` is always `'page'`):

```tsx
  const customAsTemplateDefs: TemplateDef[] = useMemo(
    () =>
      customTemplates
        .filter((t) => customThumbs.has(t.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          category: 'custom' as TemplateCategory,
          use: t.use,
          orientation: t.orientation,
          full: customThumbs.get(t.id)!,
          thumb: customThumbs.get(t.id)!,
          width: t.width,
          height: t.height,
          srcNative: [t.width, t.height],
          upscaled: false,
        })),
    [customTemplates, customThumbs],
  );

  const usable = useMemo(
    () =>
      [...(templates ?? []), ...customAsTemplateDefs].filter((t) =>
        mode === 'page' ? t.use !== 'cover' : t.use !== 'page',
      ),
    [templates, customAsTemplateDefs, mode],
  );
```

(`TemplateCategory` needs `'custom'` added to its union in `src/lib/templates.ts`, OR keep `customAsTemplateDefs`'s `category` typed as a widened local union — prefer widening `TemplateCategory` itself in `templates.ts` since `CATEGORY_LABELS` above already needs to key on it too, and two parallel category types would be worse than one slightly-widened one. Check `templates.ts`'s `TemplateCategory` export and add `| 'custom'` to it.)

Add the delete button to each custom card — extend `TemplateCard` (or add a sibling render branch) so only cards with `category === 'custom'` get a delete affordance:

```tsx
{visible.map((t) => (
  <div key={t.id} className="relative">
    <TemplateCard
      name={t.name}
      selected={selectedId === t.id}
      onClick={() => onSelect(t.id)}
    >
      <TemplateThumb src={t.thumb} landscape={t.orientation === 'landscape'} />
    </TemplateCard>
    {t.category === 'custom' && (
      <button
        type="button"
        aria-label={`Delete "${t.name}"`}
        onClick={(e) => {
          e.stopPropagation();
          deleteCustomTemplate(t.id);
          refreshCustomTemplates();
        }}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
      >
        <TrashIcon size={12} />
      </button>
    )}
  </div>
))}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/TemplateGallery.test.tsx`
Expected: PASS (3 new tests, plus any pre-existing tests in the file still green).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/TemplateGallery.tsx src/components/TemplateGallery.test.tsx src/lib/templates.ts
git commit -m "feat(templates): show custom templates in TemplateGallery, deletable"
```

## Task 5: Wire "Save as template" trigger into App.tsx

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SaveAsTemplateDialog` (Task 3); needs the current page's `strokes`, `shapes`, `paper` — check how `Workspace.tsx` exposes the live drawing content (likely via a ref or a prop callback already used for export, since `App.tsx` already drives PNG/PDF export per the Toolbar's `onExportPNG`/`onExportPDF` — follow that exact existing wiring pattern).

- [ ] **Step 1: Find how App.tsx currently gets strokes/shapes for export**

Run: `grep -n "onExportPNG\|onExportPDF\|exportPNG\|exportPDF" src/App.tsx src/components/Workspace.tsx | head -20`

This reveals the existing mechanism (likely a ref exposing `{ strokes, shapes }` or a callback prop) that Toolbar's export buttons already use — reuse the exact same access pattern for the new "Save as template" trigger, since it needs identical data (current page's strokes + shapes + paper).

- [ ] **Step 2: Add state and the trigger**

```typescript
import { SaveAsTemplateDialog } from './components/SaveAsTemplateDialog';

// inside App's component function, alongside templatePickerOpen:
const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
```

- [ ] **Step 3: Add a menu entry to trigger it**

The natural entry point is inside the existing page-template picker flow (`TemplateGallery` with `mode="page"`) — add a "Save this page as a template" button in `App.tsx`'s JSX near where `templatePickerOpen`'s `TemplateGallery` is rendered (around line 371), OR as a button inside `TemplateGallery.tsx` itself if that reads more naturally given the actual JSX layout once viewed. Prefer adding it as a small text button at the bottom of the existing `TemplateGallery` modal (mode `'page'` only) since that's where the user is already thinking about page backgrounds — pass an `onSaveCurrentPage?: () => void` prop through `TemplateGallery` if going that route, following the same "optional prop, only rendered when provided" convention `onExportMarkdown`/`onExportText` already use in `Toolbar.tsx`.

Render the dialog itself in `App.tsx`, alongside the existing `TemplateGallery` render block:

```tsx
{saveAsTemplateOpen && activePage && (
  <SaveAsTemplateDialog
    open
    strokes={/* whatever App.tsx's existing export wiring exposes, from Step 1 */}
    shapes={/* same */}
    paper={activePage.paper}
    templateId={activeTemplateId}
    onSaved={() => setSaveAsTemplateOpen(false)}
    onCancel={() => setSaveAsTemplateOpen(false)}
  />
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. In a Notebook-mode doc, draw something on a page, open the page-template picker, trigger "Save as template," name it, confirm. Reopen the picker and confirm the new custom template appears under "My templates" with a thumbnail matching what was drawn, and can be applied to a page. Delete it from the picker and confirm it disappears.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/TemplateGallery.tsx
git commit -m "feat(templates): wire Save as template trigger into the page picker"
```

## Task 6: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Manual end-to-end check**

Repeat Task 5 Step 5 in full, plus: confirm a bundled template still applies correctly (regression check — the merge in Task 4 must not have broken bundled-template selection), and confirm deleting a document that used a custom template as its page background does NOT delete the template itself (create doc → apply custom template → delete doc → reopen template picker on another doc → custom template still listed).

- [ ] **Step 4: Commit any final fixes**

If Steps 1–3 surfaced anything, fix and commit; otherwise no commit for this task.
