# Contextual AI Toolbar + Canvas Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contextual floating toolbar on lasso selection (local edits now, AI actions next) plus canvas polish (pen types, smoothing, Night Mode, paper, recent colors), built on Stylus's existing select tool, recognition pipeline, `/api/refine`, and render engine.

**Architecture:** Phase 1 (this plan, fully detailed) adds selection-scoped local edits — `duplicateSelected` / `recolorSelected` in `useDrawing`, a presentational `SelectionToolbar` positioned via the existing `worldToScreen(view)` over `selection.bounds`. Later phases (backlog below) add AI actions and canvas polish, each expanded to full task detail when reached.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library, Tailwind. No new dependencies.

## Global Constraints

- Reuse existing types: `Stroke`, `Bounds`, `ViewTransform` — do not redefine.
- IDs come from `src/lib/id.ts` `createId(prefix?)` — never `Math.random().substr`.
- Stroke edits commit through the existing history path (`history.set(next)` + `strokesRef.current = next` + `scheduleOverlayRender()`), mirroring `deleteSelected` (`src/hooks/useDrawing.ts:445-467`), so undo/redo + autosave work unchanged.
- Overlay/toolbar positions are WORLD-space → screen via `worldToScreen(x, y, view)` from `src/lib/geometry.ts` (the codebase's coordinate convention).
- Dark-theme styling: follow `Toolbar.tsx` conventions (`IconButton`, `bg-bg-muted/80`, `shadow-pop`, `backdrop-blur-pill`, `text-ink-700`).
- Test command: `npm test` (vitest run). Single file: `npx vitest run <path>`.

---

### Task 1: `duplicateSelected` + `recolorSelected` in useDrawing

**Files:**
- Modify: `src/hooks/useDrawing.ts` (add two callbacks; extend `SelectionState` interface at lines 41-49 and the returned `selection` object)
- Test: `src/hooks/useDrawing.selection.test.ts` (new)

**Interfaces:**
- Consumes: `Stroke` from `../types`; `createId` from `../lib/id`.
- Produces: `SelectionState` gains
  - `duplicateSelected: () => void`
  - `recolorSelected: (color: string) => void`

- [ ] **Step 1: Write the failing test**

The selection ops are currently entangled with canvas refs, so test the pure
transformation they perform by extracting it. Create
`src/lib/selectionOps.ts` logic first via its test:

```typescript
// src/hooks/useDrawing.selection.test.ts
import { describe, it, expect } from 'vitest';
import { duplicateStrokes, recolorStrokes } from '../lib/selectionOps';
import type { Stroke } from '../types';

function stroke(id: string, color = '#fff'): Stroke {
  return {
    id,
    color,
    size: 4,
    points: [
      { x: 10, y: 10, pressure: 0.5, t: 0 },
      { x: 20, y: 30, pressure: 0.5, t: 1 },
    ],
  };
}

describe('duplicateStrokes', () => {
  it('clones selected strokes with new ids, offset by (dx,dy)', () => {
    const all = [stroke('a'), stroke('b'), stroke('c')];
    const { next, newIds } = duplicateStrokes(all, new Set(['a', 'c']), 16, 16);
    expect(next).toHaveLength(5); // 3 originals + 2 clones
    expect(newIds.size).toBe(2);
    const clones = next.filter((s) => newIds.has(s.id));
    // ids are fresh (not 'a'/'c')
    expect(clones.every((s) => s.id !== 'a' && s.id !== 'c')).toBe(true);
    // first clone's first point is offset by (16,16) from 'a'
    const cloneOfA = clones[0];
    expect(cloneOfA.points[0].x).toBe(26);
    expect(cloneOfA.points[0].y).toBe(26);
    // originals untouched
    expect(next.find((s) => s.id === 'a')!.points[0].x).toBe(10);
  });

  it('returns the list unchanged when nothing is selected', () => {
    const all = [stroke('a')];
    const { next, newIds } = duplicateStrokes(all, new Set(), 16, 16);
    expect(next).toBe(all);
    expect(newIds.size).toBe(0);
  });
});

describe('recolorStrokes', () => {
  it('sets color on selected strokes only', () => {
    const all = [stroke('a', '#fff'), stroke('b', '#fff')];
    const next = recolorStrokes(all, new Set(['b']), '#ef4444');
    expect(next.find((s) => s.id === 'a')!.color).toBe('#fff');
    expect(next.find((s) => s.id === 'b')!.color).toBe('#ef4444');
  });

  it('returns the same array reference when nothing is selected', () => {
    const all = [stroke('a')];
    expect(recolorStrokes(all, new Set(), '#000')).toBe(all);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useDrawing.selection.test.ts`
Expected: FAIL — cannot find module `../lib/selectionOps`.

- [ ] **Step 3: Write the pure ops module**

```typescript
// src/lib/selectionOps.ts
import { createId } from './id';
import type { Stroke } from '../types';

/**
 * Clone the selected strokes with fresh ids, offset by (dx,dy) in world px.
 * Returns the new full list and the set of clone ids (to select them).
 * Returns the input array unchanged when the selection is empty.
 */
export function duplicateStrokes(
  all: Stroke[],
  selectedIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): { next: Stroke[]; newIds: Set<string> } {
  if (selectedIds.size === 0) return { next: all, newIds: new Set() };
  const newIds = new Set<string>();
  const clones: Stroke[] = [];
  for (const s of all) {
    if (!selectedIds.has(s.id)) continue;
    const id = createId('s_');
    newIds.add(id);
    clones.push({
      ...s,
      id,
      points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    });
  }
  return { next: [...all, ...clones], newIds };
}

/**
 * Set `color` on the selected strokes. Returns the same array reference when
 * the selection is empty (lets callers skip a no-op commit).
 */
export function recolorStrokes(
  all: Stroke[],
  selectedIds: ReadonlySet<string>,
  color: string,
): Stroke[] {
  if (selectedIds.size === 0) return all;
  return all.map((s) => (selectedIds.has(s.id) ? { ...s, color } : s));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useDrawing.selection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the ops into useDrawing**

In `src/hooks/useDrawing.ts`:

1. Add the import near the other lib imports:

```typescript
import { duplicateStrokes, recolorStrokes } from '../lib/selectionOps';
```

2. Extend `SelectionState` (after `deleteSelected: () => void;` at line ~49):

```typescript
  duplicateSelected: () => void;
  recolorSelected: (color: string) => void;
```

3. Add the two callbacks right after `deleteSelected` (after line ~467):

```typescript
  const duplicateSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const { next, newIds } = duplicateStrokes(strokesRef.current, ids, 16, 16);
    history.set(next);
    strokesRef.current = next;
    selectedIdsRef.current = newIds;
    setSelectedIds(newIds);
    scheduleOverlayRender();
  }, [history, scheduleOverlayRender]);

  const recolorSelected = useCallback(
    (color: string) => {
      const ids = selectedIdsRef.current;
      if (ids.size === 0) return;
      const next = recolorStrokes(strokesRef.current, ids, color);
      history.set(next);
      strokesRef.current = next;
      scheduleOverlayRender();
    },
    [history, scheduleOverlayRender],
  );
```

4. Add both to the returned `selection` object (find where `deleteSelected` is
   returned in the `selection: { ... }` literal and add the two names beside it).

- [ ] **Step 6: Build + full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (existing + 4 new).

- [ ] **Step 7: Commit**

```bash
git add src/lib/selectionOps.ts src/hooks/useDrawing.selection.test.ts src/hooks/useDrawing.ts
git commit -m "feat: duplicateSelected + recolorSelected selection ops

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 2: SelectionToolbar component (local actions)

**Files:**
- Create: `src/components/SelectionToolbar.tsx`
- Modify: `src/components/icons.tsx` (add `CopyIcon`, `DuplicateIcon` if absent — check first; reuse `TrashIcon` for delete)
- Modify: `src/components/Workspace.tsx` (render it, wire handlers)
- Test: none (presentational + positioning — verified by running the app; logic lives in Task 1, already tested)

**Interfaces:**
- Consumes: `selection.bounds` (`Bounds | null`), `selection.selectedIds`, `selection.phase`, `selection.deleteSelected`, `selection.duplicateSelected`, `selection.recolorSelected` (Task 1); `worldToScreen` + `ViewTransform`; `PRESET_COLORS` from `../types`; `toast` from `../lib/toast`; `recognizeText` from `../lib/recognition` via `importChunk` (for Copy).
- Produces: `<SelectionToolbar>` rendered by `Workspace`.

- [ ] **Step 1: Add any missing icons**

Check `src/components/icons.tsx` for `CopyIcon` / `DuplicateIcon`. If missing, add (svgProps stroke style, matching the file):

```tsx
export const CopyIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const DuplicateIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    <path d="M12 11v4M10 13h4" />
  </svg>
);
```

- [ ] **Step 2: Write the component**

```tsx
// src/components/SelectionToolbar.tsx
import { useState } from 'react';
import { worldToScreen, type ViewTransform, type Bounds } from '../lib/geometry';
import { PRESET_COLORS } from '../types';
import { TrashIcon, CopyIcon, DuplicateIcon, TypeIcon, SparkleIcon, PaperIcon } from './icons';

interface SelectionToolbarProps {
  bounds: Bounds | null;
  selectedCount: number;
  phase: string;
  view: ViewTransform;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onRecolor: (color: string) => void;
  onConvert: () => void; // wired in Phase 2; pass a no-op-safe handler now
}

/**
 * Floating actions pill anchored above a lasso selection. World-space bounds →
 * screen via the live view, so it tracks zoom/pan. Hidden unless there's a
 * settled (non-moving) non-empty selection.
 */
export function SelectionToolbar({
  bounds,
  selectedCount,
  phase,
  view,
  onDelete,
  onDuplicate,
  onCopy,
  onRecolor,
  onConvert,
}: SelectionToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);

  if (!bounds || selectedCount === 0 || phase === 'moving') return null;

  // Anchor: horizontal center of the selection, just above its top edge.
  const topLeft = worldToScreen(bounds.minX, bounds.minY, view);
  const topRight = worldToScreen(bounds.maxX, bounds.minY, view);
  const centerX = (topLeft.x + topRight.x) / 2;
  const top = Math.max(8, topLeft.y - 52); // keep on-screen near the top edge

  return (
    <div
      className="pointer-events-auto absolute z-30 -translate-x-1/2"
      style={{ left: centerX, top }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-bg-muted/90 px-2 py-1.5 shadow-pop backdrop-blur-pill">
        <ToolbarButton label="Convert to text" onClick={onConvert}>
          <TypeIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Ask Stylus" onClick={onConvert /* Phase 2 swaps to Ask */}>
          <SparkleIcon size={18} />
        </ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-border-strong" aria-hidden />
        <ToolbarButton label="Copy text" onClick={onCopy}>
          <CopyIcon size={18} />
        </ToolbarButton>
        <ToolbarButton label="Duplicate" onClick={onDuplicate}>
          <DuplicateIcon size={18} />
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton label="Change color" onClick={() => setColorOpen((o) => !o)}>
            <PaperIcon size={18} />
          </ToolbarButton>
          {colorOpen && (
            <div className="absolute left-1/2 top-full z-40 mt-2 flex -translate-x-1/2 gap-1.5 rounded-panel border border-border bg-bg-muted/95 p-2 shadow-pop backdrop-blur-pill">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Recolor ${c}`}
                  onClick={() => {
                    onRecolor(c);
                    setColorOpen(false);
                  }}
                  className="h-6 w-6 rounded-full border border-border-strong transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>
        <span className="mx-0.5 h-5 w-px bg-border-strong" aria-hidden />
        <ToolbarButton label="Delete" onClick={onDelete}>
          <TrashIcon size={18} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-white/[0.06] active:bg-white/10"
    >
      {children}
    </button>
  );
}
```

Note: `SparkleIcon` currently lives inside `Toolbar.tsx` as a local function.
Export it from `icons.tsx` instead (move the existing `SparkleIcon` definition
to `icons.tsx`, export it, and import it in `Toolbar.tsx`) so both toolbars
share one glyph. If that move is undesirable, inline a small sparkle SVG in
`SelectionToolbar.tsx`.

- [ ] **Step 3: Wire into Workspace**

In `src/components/Workspace.tsx`, add the import and render the toolbar near
the other absolutely-positioned overlays (after `<TextLayer .../>`):

```tsx
import { SelectionToolbar } from './SelectionToolbar';
```

```tsx
      <SelectionToolbar
        bounds={drawing.selection.bounds}
        selectedCount={drawing.selection.selectedIds.size}
        phase={drawing.selection.phase}
        view={drawing.view}
        onDelete={drawing.selection.deleteSelected}
        onDuplicate={drawing.selection.duplicateSelected}
        onRecolor={drawing.selection.recolorSelected}
        onCopy={handleCopySelection}
        onConvert={handleRecognize}
      />
```

Add `handleCopySelection` beside the existing `handleRecognize` in Workspace:

```tsx
  const handleCopySelection = useCallback(async () => {
    const ids = drawing.selection.selectedIds;
    const selected = drawing.strokes.filter((s) => ids.has(s.id));
    if (selected.length === 0) return;
    try {
      const { recognizeText } = await importChunk(() => import('../lib/recognition'));
      const { text } = await recognizeText(selected);
      if (!text.trim()) {
        toast.error('Nothing to copy — no handwriting recognized in the selection.');
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('Copied recognized text');
    } catch {
      toast.error("Couldn't copy — recognition or clipboard failed.");
    }
  }, [drawing.selection.selectedIds, drawing.strokes]);
```

This uses the existing `recognizeText(strokes) => Promise<{ text: string }>`
(`src/lib/recognition.ts:178`) loaded via the existing `importChunk` helper —
the same path `useRecognition` uses — so no change to `useRecognition` is needed.
`importChunk` is already imported in `Workspace.tsx`; `toast` is imported there
from the Kandinsky work.

- [ ] **Step 4: Build + run the app**

Run: `npm run build && npm test`
Expected: build + tests pass.

Manual: `npm run dev` → select the `select` tool, lasso some ink. The pill
appears above the selection. Duplicate offsets a copy; Color recolors; Delete
removes; Copy puts recognized text on the clipboard. Zoom and pan — the pill
stays anchored to the selection.

- [ ] **Step 5: Commit**

```bash
git add src/components/SelectionToolbar.tsx src/components/icons.tsx src/components/Workspace.tsx src/components/Toolbar.tsx
git commit -m "feat: contextual selection toolbar with local actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

## Backlog — later phases (expand to full task detail when reached)

These are sequenced and scoped; each becomes its own set of TDD tasks (like
Tasks 1–2) when Phase 1 is merged and reviewed.

### Phase 2 — AI lasso actions
- Add `ask` and `translate` to `RefineAction` + `REFINE_ACTIONS` (`src/lib/ai.ts`)
  and to `Action` + `PROMPTS` (`api/refine.ts`). Translate prompt auto-detects:
  non-English → English; English → a default target constant.
- Swap the toolbar's Ask button to a real Ask handler (recognize → `refine('ask')`
  → `StudioPanel`); add a Translate button (recognize → `refine('translate')` →
  `StudioPanel`). Convert drops a text box (reuse the scanner/paste placement).
- Tests: request/response shape for the two new actions; prompt-key presence.

### Phase 3 — Pen types + smoothing
- `PenType = 'fountain' | 'ballpoint' | 'brush' | 'highlighter'`; thread a
  `penType` setting through `useDrawing` (mirror in `settingsRef`); per-type
  width/opacity/blend in `render.ts`. Pen-type popover modeled on `PaperPicker`.
- Spline (quadratic / Catmull-Rom) stroke rendering in `render.ts` for committed
  + live layers.
- Tests: per-pen width/opacity mapping; smoothing math (control-point output).

### Phase 4 — Stabilizer, Night Mode, paper, recent colors
- Optional weighted-average stabilizer on the live capture path in `useDrawing`
  (off by default; toggle persisted to `profile.ts`).
- Night Mode: alternate token set + root class, toggled in the sidebar,
  persisted to `profile.ts`.
- Paper: add `cornell`, `staff`, `isometric` to `PaperStyle` / `PAPER_STYLES` /
  `paper.ts` + picker swatches.
- Recent colors: recents row in the color picker, persisted to `profile.ts`.
- Tests: paper-guide additions; stabilizer smoothing function; recents
  dedupe/cap logic.
