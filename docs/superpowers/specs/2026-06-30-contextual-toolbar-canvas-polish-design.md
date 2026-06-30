# Contextual AI Toolbar + Canvas Polish — Design

**Date:** 2026-06-30
**Status:** Approved for planning

## Overview

One sprint, two independent feature groups that build on what Stylus already
has — the lasso `select` tool, the handwriting-recognition pipeline, the
`/api/refine` Claude backend, the `StudioPanel`, the `render.ts` drawing engine,
`paper.ts`, and the profile store. No new infrastructure.

- **Feature A — Contextual lasso toolbar:** a floating menu that appears next to
  a lasso selection and offers selection-scoped actions (local edits + AI).
- **Feature B — Canvas polish:** pen types, stroke smoothing + an optional
  stabilizer, Night Mode, more paper styles, and a recent-colors row.

Explicitly **out of scope** (future sprints, not designed here): a 90-language
translate picker, a 25+ pen library, 150 templates, audio recording /
transcription, math solving / graphing, nested folders, and cloud sync.

## Feature A — Contextual lasso toolbar

### Component

`src/components/SelectionToolbar.tsx` — a floating pill positioned just above
the selection's bounding box. It reads `selection.bounds` from `useDrawing`
(world space) and converts to screen via `worldToScreen(view)` so it tracks
zoom and pan. It renders only when:

- the active tool is `select`, AND
- `selection.selectedIds` is non-empty, AND
- the selection is not mid-drag (`selection.phase !== 'moving'`).

The toolbar is presentational + dispatch only. It owns no stroke logic and no
AI logic; it calls handlers passed from `Workspace`.

### Actions (8)

Local, instant (no network):

- **Delete** — removes the selected strokes. Reuses the existing
  `selection.deleteSelected()`.
- **Duplicate** — inserts a copy of each selected stroke offset by a small fixed
  delta (e.g. +16,+16 world px), then selects the copies. New
  `duplicateSelected()` in `useDrawing`.
- **Copy** — recognizes the selection and writes the text to the clipboard
  (`navigator.clipboard.writeText`). Falls back to a toast on failure.
- **Color** — a small swatch popover (reusing the existing preset palette);
  picking a color recolors the selected strokes. New `recolorSelected(color)`
  in `useDrawing`.

AI, via recognition → `/api/refine`:

- **Convert to Text** — recognizes the selection and drops a finished text box
  onto the canvas (same placement logic as the scanner/paste path in
  `Workspace`).
- **Ask Stylus** — recognizes the selection, sends it with the new `ask`
  action, shows the answer in `StudioPanel`.
- **Translate** — recognizes the selection, sends it with the new `translate`
  action (auto-detect: non-English → English; English → a default target
  language constant), shows the result in `StudioPanel`.

### Data flow (AI actions)

```
selected strokes
  → recognize(strokes)              [existing useRecognition / recognition.ts]
  → text
  → refine(action, text)            [ai.ts → /api/refine]
  → result
  → StudioPanel (Ask, Translate)  |  text box (Convert)
```

`ask` and `translate` are added as new keys to `RefineAction`, `REFINE_ACTIONS`
(client), and the `PROMPTS` map + `Action` type (server `api/refine.ts`). No new
endpoint, no new auth — same OIDC + AI Gateway + Haiku model with fallbacks.

Translate prompt: instruct the model to detect the source language; if it is not
English, translate to English; if it is English, translate to the default
target (a single constant, e.g. Spanish) — returning only the translation.

### `useDrawing` additions

Beside the existing `selection.deleteSelected()`:

- `duplicateSelected(): void` — clones selected strokes with new ids (via
  `src/lib/id.ts`), offsets them, commits to history, selects the clones.
- `recolorSelected(color: string): void` — sets `color` on selected strokes,
  commits to history.

Both go through the same history/commit path as existing edits so undo/redo and
autosave work unchanged.

### Error handling

- Empty selection or empty recognition → existing toast / StudioPanel error
  message (no false "canvas empty" claims — mirror current `handleRecognize`).
- AI failure → the existing `refine` error surfaces in `StudioPanel`.
- Clipboard failure (Copy) → error toast.

## Feature B — Canvas polish

### 1. Pen types

Add `PenType = 'fountain' | 'ballpoint' | 'brush' | 'highlighter'` and a
`penType` setting threaded through `useDrawing` (mirrored in `settingsRef` like
the other tool settings). Per-type behavior lives in `render.ts`:

- **fountain** — pressure-driven width (current behavior), full opacity.
- **ballpoint** — uniform width (pressure ignored), full opacity.
- **brush** — tilt + pressure, heavier max width.
- **highlighter** — wide, translucent, multiply blend, drawn so it reads as
  behind the ink.

The toolbar gets a pen-type popover modeled on the existing `PaperPicker`.

### 2. Stroke smoothing + stabilizer

- **Smoothing (render):** render strokes as quadratic / Catmull-Rom splines
  instead of straight polylines in `render.ts`. Pure rendering — no input lag —
  and improves every pen. Applies to both the committed and live layers.
- **Stabilizer (capture):** an optional weighted moving-average applied to
  incoming points in `useDrawing`'s live path. Off by default; a toggle enables
  it. Default strength low enough that it never feels laggy.

### 3. Night Mode

A second theme variant (warmer, dimmer palette) on top of the existing
token-based dark theme. Toggled from the sidebar/settings, persisted via
`profile.ts`, applied as a root class that swaps the token set.

### 4. More paper styles

Add `cornell`, `staff` (music), and `isometric` to `PaperStyle` /
`PAPER_STYLES` / `paper.ts` rendering and the paper-picker swatches.

### 5. Recent colors

A small recent-colors row in the color picker, persisted via `profile.ts`.

### Persistence

Pen type, stabilizer toggle, Night Mode, and recent colors are user preferences
→ `profile.ts` (already persisted). Paper style stays per-document in the aux
store. No storage-layer changes.

## Build sequencing (4 phases, each independently shippable)

1. **Phase 1 — Local lasso actions:** `SelectionToolbar` + Delete / Duplicate /
   Copy / Color. Gets the floating-toolbar UX on screen with no AI risk.
2. **Phase 2 — AI lasso actions:** add `ask` + `translate` to `/api/refine`;
   wire Convert / Ask / Translate through recognition → refine → StudioPanel.
3. **Phase 3 — Pen types + smoothing:** per-pen rendering + spline smoothing +
   pen-type popover.
4. **Phase 4 — Stabilizer + Night Mode + paper + recent colors:** the remaining
   polish, each small and self-contained.

## Testing

- **Unit (pure, TDD):** `duplicateSelected` / `recolorSelected` geometry; the
  `ask` and `translate` request/response shapes; spline-smoothing math; per-pen
  width / opacity mapping; the new paper guides.
- **Run-the-app:** floating-toolbar positioning under zoom/pan, popovers, theme
  toggle, stabilizer feel. Existing `render.test.ts` / `paper.test.ts` patterns
  extend directly.
- Every phase ends green (build + full suite) before the next begins.
