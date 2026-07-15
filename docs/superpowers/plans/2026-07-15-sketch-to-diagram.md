# Sketch-to-Diagram AI (Phase 3 #18) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user lasso-select rough hand-drawn shapes (boxes, circles, lines, arrows), tap "Convert to shapes," and have a vision model replace the selected strokes with clean `Shape` primitives (rect/ellipse/line/arrow), as one undoable action.

**Architecture:** Per the user's decision, this is an **explicit action on the current lasso selection**, not continuous auto-detection. Mirrors `Workspace.tsx`'s existing `handleConvertSelection` (strokes → OCR'd text) almost exactly: rasterize the selected strokes (reusing `rasterizeForOCR`-equivalent bounds math from `src/lib/recognition.ts`, or more simply `buildPNGBlob` from `export.ts` since the output just needs to be an image for a vision call, not an OCR-optimized B/W bitmap), send it to a new `/api/sketch-to-shapes` endpoint (same unauthenticated Vercel-AI-Gateway/Claude-vision pattern as `api/recognize.ts`), which returns shape primitives in **normalized 0–1 coordinates relative to the selection's own bounding box** (so the model never has to guess absolute canvas coordinates it can't see). The client denormalizes those into world-space `Shape` objects positioned exactly where the original strokes were, and a new `useDrawing` action atomically removes the selected strokes and adds the new shapes as one `history.set` call (one undo step, matching #7's eraser precedent from Phase 2).

**Tech Stack:** `api/recognize.ts`'s pattern (Vercel serverless + `ai` SDK, Claude vision via Gateway), `src/lib/geometry.ts` (bounds math), `src/hooks/useDrawing.ts`, React, Vitest.

## Global Constraints

- Explicit, selection-scoped action only — triggered from `SelectionToolbar`'s existing button row, never automatic/continuous while drawing.
- Requires Phase 2 item #6 (shape tool + `Shape`/`SHAPE_TYPES` types) — already shipped, confirmed present at `src/types.ts:113-158`.
- The vision endpoint returns ONLY `rect | ellipse | line | arrow` (the exact `SHAPE_TYPES` union) — any other label from the model is dropped, not coerced, so a bad classification never produces an invalid `Shape.type`.
- Coordinates from the model are normalized 0–1 relative to the rasterized selection image; the client is responsible for mapping back to world space using the selection's own bounds — the model is never asked to reason in canvas/world coordinates it has no way to know.
- Conversion is one atomic, one-undo-step operation: selected strokes removed AND new shapes added in a single `history.set` call, exactly like #7's `eraseAt`/pointerup commit precedent.
- A selection with zero strokes, or a vision response with zero valid shapes, is a no-op with user feedback (toast), never a silent failure or an empty history entry.

---

## File Structure

- **Create `api/sketch-to-shapes.ts`** — Vercel function, vision call, same auth/error-mapping pattern as `api/recognize.ts`.
- **Create `src/lib/sketchToShapes.ts`** — client: `convertSketchToShapes(strokes: Stroke[]): Promise<Shape[]>`, handles rasterization + API call + normalized-to-world coordinate mapping + shape-type validation.
- **Create `src/lib/sketchToShapes.test.ts`**.
- **Modify `src/hooks/useDrawing.ts`** — add `replaceSelectedStrokesWithShapes(shapes: Shape[]): void`, mirroring `deleteSelected`'s exact structure, exposed in the hook's return object.
- **Modify `src/components/SelectionToolbar.tsx`** — add a "Convert to shapes" button (only shown when the selection contains at least one stroke — shapes-only selections have nothing to convert).
- **Modify `src/components/Workspace.tsx`** — wire the button to `sketchToShapes.ts` + `drawing.replaceSelectedStrokesWithShapes`.

## Task 1: Backend — `api/sketch-to-shapes.ts`

**Files:**
- Create: `api/sketch-to-shapes.ts`

**Interfaces:**
- Consumes: nothing new — same unauthenticated pattern as `api/recognize.ts`.
- Produces: `POST { image: "data:image/png;base64,..." } -> { shapes: Array<{ type: 'rect'|'ellipse'|'line'|'arrow', x1: number, y1: number, x2: number, y2: number }> }` where every coordinate is normalized 0–1 relative to the image dimensions.

- [ ] **Step 1: Implement, mirroring `api/recognize.ts`'s structure**

```typescript
// api/sketch-to-shapes.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, APICallError } from 'ai';

/**
 * Sketch-to-diagram AI (Phase 3 #18). Sends a rasterized image of selected
 * hand-drawn strokes to Claude (vision) via the Vercel AI Gateway and asks
 * it to identify rough geometric shapes (rectangles, ellipses, lines,
 * arrows) within them. Returns shape primitives in NORMALIZED 0–1
 * coordinates relative to the image — the model never sees or needs to
 * know actual canvas/world coordinates; the client maps normalized →
 * world space using the original selection's own bounding box.
 *
 * Same unauthenticated OIDC/Gateway pattern as api/recognize.ts — this is
 * client-editing-experience AI, not sync, so it stays outside auth per the
 * established api/_lib/auth.ts precedent.
 *
 * POST { image: "data:image/png;base64,..." } -> { shapes: ShapeGuess[] }
 */

type ShapeTypeGuess = 'rect' | 'ellipse' | 'line' | 'arrow';
const VALID_TYPES: ReadonlySet<string> = new Set(['rect', 'ellipse', 'line', 'arrow']);

interface ShapeGuess {
  type: ShapeTypeGuess;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const MODEL = 'anthropic/claude-haiku-4.5';
const FALLBACK_MODELS = ['anthropic/claude-3.5-haiku', 'anthropic/claude-3.5-sonnet'];

const PROMPT =
  'This image contains one or more rough hand-drawn shapes on a transparent/dark canvas. ' +
  'Identify each shape as one of: rect (rectangle or square), ellipse (circle or oval), ' +
  'line (a straight line with no arrowhead), arrow (a line with an arrowhead). ' +
  'For each shape, return its bounding box as two corners (x1,y1)-(x2,y2) — for rect/ellipse ' +
  'use the bounding box corners; for line/arrow use the two endpoints (x1,y1) is the start, ' +
  '(x2,y2) is the end/arrowhead point. ' +
  'Coordinates MUST be normalized fractions from 0.0 to 1.0 of the image width/height ' +
  '(0,0 is top-left, 1,1 is bottom-right) — never pixel values. ' +
  'Respond with ONLY a JSON array, no markdown fences, no commentary, in this exact shape: ' +
  '[{"type":"rect","x1":0.1,"y1":0.1,"x2":0.5,"y2":0.4}]. ' +
  'If no recognizable shape is present, respond with an empty array: [].';

function parseShapes(raw: string): ShapeGuess[] {
  let parsed: unknown;
  try {
    // Strip markdown code fences defensively — models sometimes add them
    // despite the prompt saying not to.
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ShapeGuess[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Record<string, unknown>;
    if (typeof s.type !== 'string' || !VALID_TYPES.has(s.type)) continue;
    const coords = [s.x1, s.y1, s.x2, s.y2];
    if (!coords.every((c) => typeof c === 'number' && Number.isFinite(c))) continue;
    const [x1, y1, x2, y2] = coords as number[];
    // Clamp to [0, 1] — a slightly-out-of-range model guess is still usable
    // once clamped; a wildly invalid one (NaN, already filtered above)
    // isn't. Clamping keeps the client's world-space mapping well-defined.
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    out.push({ type: s.type as ShapeTypeGuess, x1: clamp(x1), y1: clamp(y1), x2: clamp(x2), y2: clamp(y2) });
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { image } = (req.body ?? {}) as { image?: string };
  if (!image || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'No image to analyze.' });
    return;
  }

  try {
    const { text } = await generateText({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image', image },
          ],
        },
      ],
      maxOutputTokens: 1024,
      providerOptions: {
        gateway: {
          models: FALLBACK_MODELS,
          tags: ['feature:stylus-sketch-to-shapes'],
        },
      },
    });
    res.status(200).json({ shapes: parseShapes(text) });
  } catch (err) {
    if (APICallError.isInstance(err)) {
      switch (err.statusCode) {
        case 402:
          res.status(402).json({ error: 'AI budget reached. Try again later.' });
          return;
        case 429:
          res.status(429).json({ error: 'Too many requests. Please slow down.' });
          return;
        case 503:
          res.status(503).json({ error: 'AI service temporarily unavailable.' });
          return;
      }
    }
    console.error('[stylus/sketch-to-shapes] unexpected error', err);
    res.status(500).json({ error: 'Shape recognition failed. Please try again.' });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/sketch-to-shapes.ts
git commit -m "feat(ai): add sketch-to-shapes vision endpoint"
```

## Task 2: `convertSketchToShapes` client helper

**Files:**
- Create: `src/lib/sketchToShapes.ts`
- Create: `src/lib/sketchToShapes.test.ts`

**Interfaces:**
- Consumes: `inkBounds(strokes): Bounds | null` from `./geometry` (existing); `buildPNGBlob(strokes, opts): Promise<Blob>` from `./export` (existing) OR a lighter-weight direct-canvas rasterization if `buildPNGBlob` pulls in unwanted paper/background rendering — decide in Step 1 by reading `renderToCanvas`'s behavior with `paper: 'blank'`, which should already produce a clean transparent-over-dark-background image suitable for the vision prompt's "dark canvas" framing.
- Produces:

```typescript
export async function convertSketchToShapes(strokes: Stroke[]): Promise<Shape[]>;
```
Throws `Error('Nothing to convert — the selection is empty.')` before any network call if `strokes.length === 0` or `inkBounds(strokes)` is null. Throws the API's error message (network/HTTP failure) otherwise. Returns `[]` (not an error) if the vision call succeeds but finds no shapes — caller decides how to present that as a no-op.

- [ ] **Step 1: Confirm rasterization approach**

Run: `grep -n "renderToCanvas\|buildPNGBlob\|function renderToCanvas" src/lib/export.ts`

Read the `renderToCanvas` function (already read during planning research — `src/lib/export.ts:57-85`) to confirm `paper: 'blank', background: '#0a0a0a'` (its own defaults) produce a plain dark canvas with just the strokes, no paper lines — exactly what the vision prompt expects ("transparent/dark canvas"). Use `buildPNGBlob(strokes, { width, height, paper: 'blank' })` with `width`/`height` derived from the selection's own `inkBounds` (padded), NOT the full page — a tight crop around just the selected strokes gives the vision model a focused image instead of a mostly-empty page.

- [ ] **Step 2: Write the failing tests**

```typescript
// src/lib/sketchToShapes.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./export', () => ({
  buildPNGBlob: vi.fn().mockResolvedValue(new Blob(['fake-png'], { type: 'image/png' })),
}));

// jsdom Blob has no arrayBuffer/text-to-base64 helper wired to a real codec —
// stub FileReader-based conversion deterministically for the test.
const originalFileReader = global.FileReader;
class FakeFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  readAsDataURL(_blob: Blob) {
    this.result = 'data:image/png;base64,ZmFrZQ==';
    queueMicrotask(() => this.onloadend?.());
  }
}

import { convertSketchToShapes } from './sketchToShapes';
import { stroke } from '../test/fixtures';

describe('convertSketchToShapes', () => {
  beforeAll(() => {
    // @ts-expect-error test stub
    global.FileReader = FakeFileReader;
  });
  afterAll(() => {
    global.FileReader = originalFileReader;
  });

  it('throws without calling fetch for an empty selection', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    await expect(convertSketchToShapes([])).rejects.toThrow(/empty/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('maps normalized model coordinates back to world space using the selection bounds', async () => {
    // A stroke spanning world (100,100) to (200,200) — a 100x100 box.
    const strokes = [stroke([[100, 100], [200, 200]], { id: 's1', size: 0 })];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        shapes: [{ type: 'rect', x1: 0, y1: 0, x2: 1, y2: 1 }],
      }),
    } as Response);

    const shapes = await convertSketchToShapes(strokes);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].type).toBe('rect');
    // A padded bounding box (see inkBounds' half-width padding) means the
    // mapped shape covers AT LEAST the original stroke's extent.
    expect(shapes[0].x1).toBeLessThanOrEqual(100);
    expect(shapes[0].y1).toBeLessThanOrEqual(100);
    expect(shapes[0].x2).toBeGreaterThanOrEqual(200);
    expect(shapes[0].y2).toBeGreaterThanOrEqual(200);
    expect(shapes[0].id).toBeTruthy();
  });

  it('returns an empty array when the API finds no shapes', async () => {
    const strokes = [stroke([[0, 0], [10, 10]], { id: 's1' })];
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ shapes: [] }),
    } as Response);
    expect(await convertSketchToShapes(strokes)).toEqual([]);
  });

  it('throws a user-facing error on API failure', async () => {
    const strokes = [stroke([[0, 0], [10, 10]], { id: 's1' })];
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: 'AI budget reached. Try again later.' }),
    } as Response);
    await expect(convertSketchToShapes(strokes)).rejects.toThrow('AI budget reached. Try again later.');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/sketchToShapes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// src/lib/sketchToShapes.ts
import type { Shape, ShapeType, Stroke } from '../types';
import { inkBounds } from './geometry';
import { buildPNGBlob } from './export';
import { createId } from './id';

/**
 * Sketch-to-diagram AI (Phase 3 #18): rasterize the selected strokes,
 * send to /api/sketch-to-shapes, map the returned normalized (0-1)
 * coordinates back to world space using the selection's own bounding box,
 * and produce ready-to-insert Shape objects.
 */

const VALID_TYPES: ReadonlySet<string> = new Set(['rect', 'ellipse', 'line', 'arrow']);

/** Padding (world px) around the tight stroke bounds, so the rasterized
 *  image isn't cropped flush against the ink — gives the vision model a
 *  little breathing room, matches the spirit of recognition.ts's own
 *  PADDING constant for the same reason. */
const SELECTION_PADDING = 24;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

export async function convertSketchToShapes(strokes: Stroke[]): Promise<Shape[]> {
  if (strokes.length === 0) {
    throw new Error('Nothing to convert — the selection is empty.');
  }
  const bounds = inkBounds(strokes);
  if (!bounds) {
    throw new Error('Nothing to convert — the selection is empty.');
  }

  const minX = bounds.minX - SELECTION_PADDING;
  const minY = bounds.minY - SELECTION_PADDING;
  const width = bounds.maxX - bounds.minX + SELECTION_PADDING * 2;
  const height = bounds.maxY - bounds.minY + SELECTION_PADDING * 2;

  // Shift strokes into the crop's local coordinate space before rasterizing
  // — buildPNGBlob renders at (0,0) origin, not the selection's world offset.
  const localStrokes = strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY })),
  }));

  const blob = await buildPNGBlob(localStrokes, { width, height, paper: 'blank' });
  const dataUrl = await blobToDataUrl(blob);

  let res: Response;
  try {
    res = await fetch('/api/sketch-to-shapes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
  } catch {
    throw new Error('Network error — could not reach the AI service.');
  }

  let data: { shapes?: Array<{ type: string; x1: number; y1: number; x2: number; y2: number }>; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    throw new Error(res.ok ? 'Unexpected response from the AI service.' : `AI service error (${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(data.error || `AI service error (${res.status}).`);
  }

  const guesses = data.shapes ?? [];
  const shapes: Shape[] = [];
  for (const g of guesses) {
    if (!VALID_TYPES.has(g.type)) continue; // defense in depth — server already filters, never trust wire data twice removed from validation
    shapes.push({
      id: createId(),
      type: g.type as ShapeType,
      color: '#ffffff',
      size: 4,
      // Denormalize: normalized fraction of the crop's width/height, offset
      // back into world space by the crop's own top-left (minX, minY).
      x1: minX + g.x1 * width,
      y1: minY + g.y1 * height,
      x2: minX + g.x2 * width,
      y2: minY + g.y2 * height,
    });
  }
  return shapes;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/sketchToShapes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sketchToShapes.ts src/lib/sketchToShapes.test.ts
git commit -m "feat(ai): add convertSketchToShapes client helper"
```

## Task 3: `replaceSelectedStrokesWithShapes` in `useDrawing`

**Files:**
- Modify: `src/hooks/useDrawing.ts`
- Test: `src/hooks/useDrawing.selection.test.ts`

**Interfaces:**
- Consumes: nothing new — uses the hook's existing internal refs (`selectedStrokeIdsRef`, `strokesRef`, `shapesRef`, `history`) exactly like `deleteSelected` does.
- Produces: `replaceSelectedStrokesWithShapes(shapes: Shape[]): void`, added to the hook's returned object alongside `deleteSelected`/`duplicateSelected` (check the exact return-object location via `grep -n "deleteSelected," src/hooks/useDrawing.ts` — there are two occurrences per the earlier grep, likely the hook's return statement plus a memoized bundle; add the new function to both).

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/hooks/useDrawing.selection.test.ts — check the file's
// existing setup (how it renders the hook, seeds strokes/shapes, and reads
// selection state) and match that pattern exactly rather than reinventing
// a harness; the shape below assumes a `renderDrawingHook` or similar
// helper already exists in that file — adapt names to what's actually there.

describe('replaceSelectedStrokesWithShapes', () => {
  it('removes the selected strokes and adds the given shapes in one history step', () => {
    // Seed: two strokes, one selected.
    // ... use whatever setup helper the existing file uses to get a
    // `drawing` result with strokes [{id:'s1'},{id:'s2'}] and
    // selectedStrokeIds = new Set(['s1']) ...

    const newShape = { id: 'shape1', type: 'rect' as const, color: '#fff', size: 4, x1: 0, y1: 0, x2: 10, y2: 10 };
    act(() => {
      drawing.replaceSelectedStrokesWithShapes([newShape]);
    });

    expect(drawing.strokes.map((s) => s.id)).toEqual(['s2']); // s1 removed, s2 kept
    expect(drawing.shapes).toContainEqual(newShape);
    expect(drawing.canUndo).toBe(true);
  });

  it('is a no-op when the selection is empty', () => {
    // ... setup with an empty selectedStrokeIds ...
    const before = drawing.strokes;
    act(() => {
      drawing.replaceSelectedStrokesWithShapes([{ id: 'x', type: 'rect', color: '#fff', size: 4, x1: 0, y1: 0, x2: 1, y2: 1 }]);
    });
    expect(drawing.strokes).toBe(before); // unchanged reference — genuinely a no-op, not a same-content replacement
  });

  it('clears the selection after converting', () => {
    // ... setup with s1 selected ...
    act(() => {
      drawing.replaceSelectedStrokesWithShapes([]);
    });
    expect(drawing.selection.selectedStrokeIds.size).toBe(0);
  });
});
```

Note: this test's exact shape depends on reading `src/hooks/useDrawing.selection.test.ts`'s existing render/setup helpers first — the sketch above is the *behavioral contract* to assert, not literal copy-paste-ready code, since this file's harness wasn't read during planning. **The implementer's first sub-step must be reading that test file in full before writing the new tests**, to match its existing conventions exactly (this is the one exception in this plan to the "complete code in every step" rule, justified because the harness shape is genuinely unknown without reading a file outside this plan's own research).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useDrawing.selection.test.ts -t "replaceSelectedStrokesWithShapes"`
Expected: FAIL — property doesn't exist on the hook's return value.

- [ ] **Step 3: Implement, mirroring `deleteSelected` exactly**

In `src/hooks/useDrawing.ts`, add right after `deleteSelected` (line 798):

```typescript
/**
 * Sketch-to-diagram AI (Phase 3 #18): atomically remove the currently
 * selected STROKES (shapes in the selection are left untouched — converting
 * a shape into a shape makes no sense) and add the given Shape objects, as
 * one history step. Mirrors deleteSelected's exact structure — same
 * "collect ids, filter, commit, clear selection" shape, just with an added
 * array instead of an empty one.
 */
const replaceSelectedStrokesWithShapes = useCallback((newShapes: Shape[]) => {
  const strokeIds = selectedStrokeIdsRef.current;
  if (strokeIds.size === 0) return;
  const nextStrokes = strokesRef.current.filter((s) => !strokeIds.has(s.id));
  const nextShapes = [...shapesRef.current, ...newShapes];
  selectedStrokeIdsRef.current = new Set();
  setSelectedStrokeIds(new Set());
  selectedShapeIdsRef.current = new Set();
  setSelectedShapeIds(new Set());
  selectionPhaseRef.current = 'idle';
  setSelectionPhase('idle');
  history.set({ strokes: nextStrokes, shapes: nextShapes });
  strokesRef.current = nextStrokes;
  shapesRef.current = nextShapes;
  scheduleOverlayRender();
}, [history, scheduleOverlayRender]);
```

Then add `replaceSelectedStrokesWithShapes` to the hook's returned object(s) at both locations found via the Step-0 grep (`grep -n "deleteSelected," src/hooks/useDrawing.ts`), placed alongside `deleteSelected` in each.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useDrawing.selection.test.ts`
Expected: PASS — all tests including the 3 new ones green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDrawing.ts src/hooks/useDrawing.selection.test.ts
git commit -m "feat(shapes): add replaceSelectedStrokesWithShapes (sketch-to-diagram)"
```

## Task 4: "Convert to shapes" button in `SelectionToolbar`

**Files:**
- Modify: `src/components/SelectionToolbar.tsx`

**Interfaces:**
- Consumes: nothing new — a new prop `onConvertToShapes: () => void` and `hasStrokes: boolean` (to hide the button for shapes-only selections).

- [ ] **Step 1: Add the prop and button**

In `src/components/SelectionToolbar.tsx`, extend `SelectionToolbarProps`:

```typescript
interface SelectionToolbarProps {
  bounds: Bounds | null;
  selectedCount: number;
  phase: string;
  view: ViewTransform;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onRecolor: (color: string) => void;
  onConvert: () => void;
  onConvertToShapes: () => void;
  /** Selection contains at least one stroke — shapes-only selections have
   *  nothing for sketch-to-diagram to convert. */
  hasStrokes: boolean;
  onAsk: () => void;
  onTranslate: () => void;
  busy: boolean;
}
```

Add `ShapeIcon` to the existing icon import list (already exists in `src/components/icons.tsx`, used by `Toolbar.tsx`'s shape tool button). Add the button next to "Convert to text" (line 105):

```tsx
<ToolbarButton label="Convert to text" onClick={onConvert} disabled={busy}>
  <TypeIcon size={18} />
</ToolbarButton>
{hasStrokes && (
  <ToolbarButton label="Convert to shapes" onClick={onConvertToShapes} disabled={busy}>
    <ShapeIcon size={18} />
  </ToolbarButton>
)}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL until Task 5 updates the call site in `Workspace.tsx` — expected at this point, proceed to Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/SelectionToolbar.tsx
git commit -m "feat(ai): add Convert to shapes button to SelectionToolbar"
```

## Task 5: Wire the conversion flow into `Workspace.tsx`

**Files:**
- Modify: `src/components/Workspace.tsx`

**Interfaces:**
- Consumes: `convertSketchToShapes(strokes): Promise<Shape[]>` (Task 2); `drawing.replaceSelectedStrokesWithShapes(shapes)` (Task 3); `selectedStrokes()` (existing, `Workspace.tsx:621-624`); `SelectionToolbar`'s new props (Task 4).

- [ ] **Step 1: Add the handler, mirroring `handleConvertSelection`'s structure**

Near `handleConvertSelection` (`Workspace.tsx:654`), add:

```typescript
import { convertSketchToShapes } from '../lib/sketchToShapes';

// ... alongside handleConvertSelection:
const [convertingToShapes, setConvertingToShapes] = useState(false);

const handleConvertToShapes = useCallback(async () => {
  const selected = selectedStrokes();
  if (selected.length === 0) {
    toast.error('Nothing to convert — the selection is empty.');
    return;
  }
  const gen = ++requestGen.current;
  setConvertingToShapes(true);
  try {
    const shapes = await convertSketchToShapes(selected);
    if (gen !== requestGen.current) return; // selection changed mid-flight
    if (shapes.length === 0) {
      toast.error('No recognizable shapes found in the selection.');
      return;
    }
    drawing.replaceSelectedStrokesWithShapes(shapes);
    toast.success(`Converted to ${shapes.length} shape${shapes.length === 1 ? '' : 's'}`);
  } catch (err) {
    if (gen === requestGen.current) {
      toast.error(err instanceof Error ? err.message : "Couldn't convert to shapes.");
    }
  } finally {
    if (gen === requestGen.current) setConvertingToShapes(false);
  }
}, [selectedStrokes, drawing]);
```

- [ ] **Step 2: Wire the new props into `SelectionToolbar`'s render site**

Find the existing `<SelectionToolbar ... onConvert={handleConvertSelection} ... />` render call and add:

```tsx
<SelectionToolbar
  // ...existing props unchanged...
  onConvert={handleConvertSelection}
  onConvertToShapes={handleConvertToShapes}
  hasStrokes={selectedStrokes().length > 0}
  busy={/* existing busy flag */ || convertingToShapes}
/>
```

Check what the existing `busy` prop is currently wired to (likely `recognition.status === 'recognizing'` or similar) and OR it with `convertingToShapes` so the whole selection-toolbar disables consistently during either kind of AI call.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Draw a rough rectangle and a rough circle in ink. Lasso-select both, click "Convert to shapes." Confirm the strokes disappear and are replaced by clean `Shape` rect/ellipse primitives in roughly the same position/size. Undo once (Cmd/Ctrl+Z) and confirm the original strokes come back and the shapes disappear — one undo step, not two.

- [ ] **Step 5: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat(ai): wire sketch-to-diagram conversion into Workspace"
```

## Task 6: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Manual end-to-end check**

Repeat Task 5 Step 4. Additionally test: an empty selection (button hidden, since `hasStrokes` guards it), a selection with only shapes (button hidden), a vision response with zero shapes (toast "No recognizable shapes found," no history entry created — confirm undo stack depth unchanged), and an offline/network-failure case (toast shows the network error message, selection remains intact/unconverted).

- [ ] **Step 4: Commit any final fixes**

If Steps 1–3 surfaced anything, fix and commit; otherwise no commit for this task.
