# ColoZoo Brand Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin `ColozooWorkspace` to the Colozoo brand (teal shell, wordmark, brush-family popover, named-color palette column, illustrated SVG template bar, SAVE pill) and wire Redo, Eraser, and header Share.

**Architecture:** Presentation rewrite of one component plus small logic additions in `useColoringPage` (redo stack, `clearZone`). Brand tokens centralized in a new `theme.ts`. Palette regrouped into named Core/Accent sets. Books gain inline-SVG thumbnails. The drawing engine, `render.ts`, core canvas/toolbar, and PNG export are untouched. Large presentational sub-blocks (palette column, brush card, template bar) extract into `src/components/colozoo/` if `ColozooWorkspace` grows unwieldy.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, Vite, Vitest + Testing Library (already in repo), Fredoka + Nunito web fonts.

## Global Constraints

- **Verification per task:** `npx tsc --noEmit` clean, `npx eslint <changed files>` clean (0 errors), and where a task adds/changes **logic**, a passing Vitest test. Pure-visual tasks verify via tsc + `npm run build` + a described live-drive check — do **not** snapshot Tailwind class strings.
- **Do not touch:** `src/lib/render.ts`, `src/components/Canvas.tsx`, `src/components/Toolbar.tsx`, `src/hooks/useDrawing*`, or any non-ColoZoo mode. Changes stay within ColoZoo files + `App.tsx` wiring already present.
- **Preserve behavior:** flood fill, freehand ink + textures, stars, book-complete confetti/card, shake-to-undo, `speakColorName`, `saveColozooPage`. Reskin changes *where/how* controls render, not the underlying logic.
- **Brand tokens (exact hex):** teal `#3BBAC6`, tealDeep `#2AA3AF`, red `#EF5B5B`, yellow `#FBD24E`, pink `#F49AC2`, lavender `#C3B1E1`, green `#6DBE6A`, blue `#4A90E2`, orange `#F5943B`, stage `#DFF3F1`.
- **Fonts:** load Fredoka (headings/wordmark) alongside existing Nunito. Google Fonts `<link>` injected on mode entry, same pattern as the existing Nunito loader.
- **Copy:** SAVE pill reads `SAVE MY ART!`. Palette groups read `Core Colors` / `Colozoo Accent Colors`. Wordmark is lowercase `colozoo`.
- **Kid-safe philosophy:** nothing corrects, locks, or blocks — only celebrates. Eraser is opt-in, never automatic.
- **Responsive breakpoint:** tablet layout ≥ 860px; below that, rail/brush-card/palette-column collapse to the bottom-docked strips.
- **Commit** at the end of each task with the shown message.

---

### Task 1: Brand theme tokens (`theme.ts`)

**Files:**
- Create: `src/lib/colozoo/theme.ts`
- Test: `src/lib/colozoo/theme.test.ts`

**Interfaces:**
- Produces: `COLOZOO_THEME: { teal, tealDeep, red, yellow, pink, lavender, green, blue, orange, stage: string }`; `LEAF_SVG: { path: string; }` corner-leaf path data (two shapes: `leafA`, `leafB`); `SPARKLE_PATH: string` (four-point star `d`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/colozoo/theme.test.ts
import { describe, it, expect } from 'vitest';
import { COLOZOO_THEME, LEAF_SVG, SPARKLE_PATH } from './theme';

describe('COLOZOO_THEME', () => {
  it('exposes the exact brand hexes', () => {
    expect(COLOZOO_THEME.teal).toBe('#3BBAC6');
    expect(COLOZOO_THEME.red).toBe('#EF5B5B');
    expect(COLOZOO_THEME.stage).toBe('#DFF3F1');
  });
  it('provides leaf + sparkle vector data', () => {
    expect(LEAF_SVG.leafA).toMatch(/^M/);
    expect(LEAF_SVG.leafB).toMatch(/^M/);
    expect(SPARKLE_PATH).toMatch(/^M/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/colozoo/theme.test.ts`
Expected: FAIL — cannot resolve `./theme`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/colozoo/theme.ts
/** Colozoo brand tokens — the single source of truth for the reskin. */
export const COLOZOO_THEME = {
  teal: '#3BBAC6',
  tealDeep: '#2AA3AF',
  red: '#EF5B5B',
  yellow: '#FBD24E',
  pink: '#F49AC2',
  lavender: '#C3B1E1',
  green: '#6DBE6A',
  blue: '#4A90E2',
  orange: '#F5943B',
  stage: '#DFF3F1',
} as const;

/** Two organic leaf silhouettes for the corner motif (viewBox 0 0 100 100). */
export const LEAF_SVG = {
  leafA: 'M50 5 C20 20 10 60 45 95 C55 60 90 40 50 5Z',
  leafB: 'M50 5 C80 20 90 60 55 95 C45 60 10 40 50 5Z',
} as const;

/** Four-point sparkle star (viewBox 0 0 24 24). */
export const SPARKLE_PATH = 'M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10Z';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/colozoo/theme.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/colozoo/theme.ts src/lib/colozoo/theme.test.ts
git commit -m "feat(colozoo): brand theme tokens + leaf/sparkle vectors"
```

---

### Task 2: Grouped named palette (`palettes.ts`)

**Files:**
- Modify: `src/lib/colozoo/palettes.ts`
- Test: `src/lib/colozoo/palettes.test.ts`

**Interfaces:**
- Consumes: `NamedColor { name: string; hex: string }` (existing).
- Produces: `COLOZOO_PALETTE_GROUPS: { label: string; colors: NamedColor[] }[]` with two groups — `Core Colors` (Black, White, Brown, Primary Red, Blue, Yellow, Orange) and `Colozoo Accent Colors` (Pink, Lavender, Teal, Lime Green); `ALL_COLOZOO_COLORS: NamedColor[]` (flattened). Existing `speakColorName` and `NamedColor` stay exported. `TEMPERA_12`/`GLOW_8`/`METALLIC_2`/`paletteForBrush` remain for the ink-render/glow path (not deleted).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/colozoo/palettes.test.ts
import { describe, it, expect } from 'vitest';
import { COLOZOO_PALETTE_GROUPS, ALL_COLOZOO_COLORS } from './palettes';

describe('COLOZOO_PALETTE_GROUPS', () => {
  it('has Core and Accent groups with the branded names', () => {
    const labels = COLOZOO_PALETTE_GROUPS.map((g) => g.label);
    expect(labels).toEqual(['Core Colors', 'Colozoo Accent Colors']);
    const names = ALL_COLOZOO_COLORS.map((c) => c.name);
    expect(names).toContain('Primary Red');
    expect(names).toContain('Lime Green');
    expect(names).toContain('Teal');
  });
  it('every color has a name and a #hex', () => {
    for (const c of ALL_COLOZOO_COLORS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/colozoo/palettes.test.ts`
Expected: FAIL — `COLOZOO_PALETTE_GROUPS` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/colozoo/palettes.ts`:

```ts
/** The visible palette column: named pills grouped Core / Accent (v3 mockup). */
export const COLOZOO_PALETTE_GROUPS: { label: string; colors: NamedColor[] }[] = [
  {
    label: 'Core Colors',
    colors: [
      { name: 'Black', hex: '#212121' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Brown', hex: '#8B5E3C' },
      { name: 'Primary Red', hex: '#EF5B5B' },
      { name: 'Blue', hex: '#4A90E2' },
      { name: 'Yellow', hex: '#FBD24E' },
      { name: 'Orange', hex: '#F5943B' },
    ],
  },
  {
    label: 'Colozoo Accent Colors',
    colors: [
      { name: 'Pink', hex: '#F49AC2' },
      { name: 'Lavender', hex: '#C3B1E1' },
      { name: 'Teal', hex: '#3BBAC6' },
      { name: 'Lime Green', hex: '#6DBE6A' },
    ],
  },
];

export const ALL_COLOZOO_COLORS: NamedColor[] = COLOZOO_PALETTE_GROUPS.flatMap(
  (g) => g.colors,
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/colozoo/palettes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/colozoo/palettes.ts src/lib/colozoo/palettes.test.ts
git commit -m "feat(colozoo): grouped named palette (Core/Accent) for the column"
```

---

### Task 3: Brush-family mapping (`brushFamilies.ts`)

**Files:**
- Create: `src/lib/colozoo/brushFamilies.ts`
- Test: `src/lib/colozoo/brushFamilies.test.ts`

**Interfaces:**
- Consumes: `ColozooBrush` union + `COLOZOO_BRUSHES` from `../penProfiles`.
- Produces: `BRUSH_FAMILIES: { id: string; label: string; badge?: string; primary: ColozooBrush; members: ColozooBrush[] }[]` — `Magic Pens` (badge `Washes Out`, primary `czMarker`), `Paint Brushes` (primary `czPaintbrush`), `Ceramic Markers` (primary `czCeramic`), `Fabric Paint` (badge `3D Puffy Effect`, primary `czCrayon`); `familyForBrush(b: ColozooBrush): string` returns the family id containing `b` (falls back to `'magic-pens'`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/colozoo/brushFamilies.test.ts
import { describe, it, expect } from 'vitest';
import { BRUSH_FAMILIES, familyForBrush } from './brushFamilies';

describe('BRUSH_FAMILIES', () => {
  it('has the four Colozoo product families with primaries', () => {
    const ids = BRUSH_FAMILIES.map((f) => f.id);
    expect(ids).toEqual(['magic-pens', 'paint-brushes', 'ceramic-markers', 'fabric-paint']);
    const fabric = BRUSH_FAMILIES.find((f) => f.id === 'fabric-paint')!;
    expect(fabric.badge).toBe('3D Puffy Effect');
    expect(fabric.primary).toBe('czCrayon');
  });
  it('maps a brush back to its family', () => {
    expect(familyForBrush('czPaintbrush')).toBe('paint-brushes');
    expect(familyForBrush('czGlow')).toBe('magic-pens');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/colozoo/brushFamilies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/colozoo/brushFamilies.ts
import type { ColozooBrush } from '../penProfiles';

/** Four Colozoo product families; each maps to concrete ColozooBrush members. */
export const BRUSH_FAMILIES: {
  id: string;
  label: string;
  badge?: string;
  primary: ColozooBrush;
  members: ColozooBrush[];
}[] = [
  { id: 'magic-pens', label: 'Magic Pens', badge: 'Washes Out', primary: 'czMarker', members: ['czMarker', 'czMagicMarker', 'czGlow'] },
  { id: 'paint-brushes', label: 'Paint Brushes', primary: 'czPaintbrush', members: ['czPaintbrush', 'czDaub'] },
  { id: 'ceramic-markers', label: 'Ceramic Markers', primary: 'czCeramic', members: ['czCeramic', 'czPorcelain'] },
  { id: 'fabric-paint', label: 'Fabric Paint', badge: '3D Puffy Effect', primary: 'czCrayon', members: ['czCrayon', 'czChalk', 'czPencil', 'czColorPencil'] },
];

/** The family id owning a brush; defaults to magic-pens if unlisted. */
export function familyForBrush(b: ColozooBrush): string {
  return BRUSH_FAMILIES.find((f) => f.members.includes(b))?.id ?? 'magic-pens';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/colozoo/brushFamilies.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/colozoo/brushFamilies.ts src/lib/colozoo/brushFamilies.test.ts
git commit -m "feat(colozoo): brush-family grouping (Magic Pens/Paint/Ceramic/Fabric)"
```

---

### Task 4: Hook — `clearZone` + redo stack (`useColoringPage.ts`)

**Files:**
- Modify: `src/hooks/useColoringPage.ts`
- Test: `src/hooks/useColoringPage.test.ts`

**Interfaces:**
- Consumes: existing `ColoringPageApi` (fillZone, undoFill, fills, page…).
- Produces (added to `ColoringPageApi`): `clearZone(zoneId: string): void` (erases one zone's fill on the active page, pushes an undo entry, records prevColor); `redoFill(): boolean` (re-applies the last undone fill; false if none); `canRedo: boolean`. `undoFill` also pushes the undone action onto the redo stack; `fillZone`/`clearZone`/`switchBook` clear the redo stack.

**Note:** `clearZone` and `redoFill` reuse the existing `FillAction` shape and `settleStars`/`persist`. Stars are monotonic (existing `settleStars` never lowers them) — clearing a zone won't remove an earned star, which is intentional and kid-safe.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useColoringPage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColoringPage } from './useColoringPage';
import { COLOZOO_BOOKS } from '../lib/colozoo/books';

const book = COLOZOO_BOOKS[0];
const zoneId = book.pages[0].zones[0].id;

beforeEach(() => localStorage.clear());

describe('useColoringPage clearZone + redo', () => {
  it('clearZone removes a fill; redo re-applies an undone fill', () => {
    const { result } = renderHook(() => useColoringPage('doc-test', book.id));
    act(() => result.current.fillZone(zoneId, '#EF5B5B'));
    expect(result.current.fills[zoneId]).toBe('#EF5B5B');

    act(() => result.current.clearZone(zoneId));
    expect(result.current.fills[zoneId]).toBeUndefined();

    // undo the clear -> fill returns
    act(() => { result.current.undoFill(); });
    expect(result.current.fills[zoneId]).toBe('#EF5B5B');

    // undo the fill -> gone; redo -> back
    act(() => { result.current.undoFill(); });
    expect(result.current.fills[zoneId]).toBeUndefined();
    expect(result.current.canRedo).toBe(true);
    act(() => { result.current.redoFill(); });
    expect(result.current.fills[zoneId]).toBe('#EF5B5B');
  });

  it('a new fill clears the redo stack', () => {
    const { result } = renderHook(() => useColoringPage('doc-test2', book.id));
    act(() => result.current.fillZone(zoneId, '#4A90E2'));
    act(() => { result.current.undoFill(); });
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.fillZone(zoneId, '#FBD24E'));
    expect(result.current.canRedo).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useColoringPage.test.ts`
Expected: FAIL — `clearZone`/`redoFill`/`canRedo` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/useColoringPage.ts`:

3a. Add a redo ref beside `undoStack` (after line 60):
```ts
  const redoStack = useRef<FillAction[]>([]);
  const [, setRedoTick] = useState(0);
```

3b. Add `canRedo`, `clearZone`, `redoFill` to the `ColoringPageApi` interface (after `undoFill` on line 46):
```ts
  /** Erase one zone's fill on the active page (eraser). */
  clearZone: (zoneId: string) => void;
  /** Re-apply the last undone fill/clear. Returns false if nothing to redo. */
  redoFill: () => boolean;
  /** True when there is an undone action to re-apply. */
  canRedo: boolean;
```

3c. In `fillZone`, clear redo after pushing to undo (inside the callback, before `persist`):
```ts
      redoStack.current = [];
```

3d. Add `clearZone` after `fillZone`:
```ts
  const clearZone = useCallback(
    (zoneId: string) => {
      if (!page || fills[zoneId] === undefined) return;
      undoStack.current.push({ pageId: page.id, zoneId, prevColor: fills[zoneId] });
      redoStack.current = [];
      const nextFills = { ...fills };
      delete nextFills[zoneId];
      persist({ ...state, zoneColors: { ...state.zoneColors, [page.id]: nextFills } });
    },
    [page, fills, state, persist],
  );
```

3e. In `undoFill`, push the popped action to redo before mutating (replace the `undoStack.current.pop();` line):
```ts
    const undone = undoStack.current.pop()!;
    redoStack.current.push(undone);
    setRedoTick((t) => t + 1);
```
(and use `undone` in place of `last` for the fill math below — `undone.prevColor`, `undone.zoneId`).

3f. Add `redoFill` after `undoFill`:
```ts
  const redoFill = useCallback((): boolean => {
    if (!page) return false;
    const last = redoStack.current[redoStack.current.length - 1];
    if (!last || last.pageId !== page.id) return false;
    redoStack.current.pop();
    setRedoTick((t) => t + 1);
    // Re-apply: the action recorded prevColor, so the "current" is the value it
    // replaced. Redo restores whatever the fills were AFTER the original action:
    // recompute by toggling — if prevColor was undefined the original set a
    // color we no longer know, so redo stores the post-value on the action.
    const cur = { ...(state.zoneColors[page.id] ?? {}) };
    if (last.redoColor === undefined) delete cur[last.zoneId];
    else cur[last.zoneId] = last.redoColor;
    undoStack.current.push(last);
    persist(settleStars({ ...state, zoneColors: { ...state.zoneColors, [page.id]: cur } }, page));
    return true;
  }, [page, state, persist, settleStars]);
```

3g. Extend `FillAction` to carry the post-value so redo is exact (line 25):
```ts
interface FillAction {
  pageId: string;
  zoneId: string;
  prevColor: string | undefined;
  /** Value AFTER this action (for redo). */
  redoColor: string | undefined;
}
```
Set `redoColor` at each push site: in `fillZone` `redoColor: color`; in `clearZone` `redoColor: undefined`.

3h. Clear redo in `switchBook` (beside `undoStack.current = []`):
```ts
      redoStack.current = [];
```

3i. Export the three new members in the return object:
```ts
    clearZone,
    redoFill,
    canRedo: redoStack.current.length > 0,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useColoringPage.test.ts`
Expected: PASS (2 tests). Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useColoringPage.ts src/hooks/useColoringPage.test.ts
git commit -m "feat(colozoo): clearZone (eraser) + redo stack in useColoringPage"
```

---

### Task 5: Book thumbnails (`types.ts` + `books.ts`)

**Files:**
- Modify: `src/lib/colozoo/types.ts` (add field), `src/lib/colozoo/books.ts` (5 thumbs)
- Test: `src/lib/colozoo/books.thumbs.test.ts`

**Interfaces:**
- Produces: `ColozooBook.thumbSvg?: string` (inline SVG markup, no `<svg>` wrapper, drawn in a `0 0 64 64` viewBox). Each of the 5 books gets a flat brand-colored thumb. Component renders `thumbSvg` inside an `<svg viewBox="0 0 64 64">`, falling back to `coverEmoji`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/colozoo/books.thumbs.test.ts
import { describe, it, expect } from 'vitest';
import { COLOZOO_BOOKS } from './books';

describe('book thumbnails', () => {
  it('every book has a non-empty inline-SVG thumb', () => {
    for (const b of COLOZOO_BOOKS) {
      expect(typeof b.thumbSvg).toBe('string');
      expect(b.thumbSvg!.length).toBeGreaterThan(10);
      expect(b.thumbSvg).not.toContain('<svg');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/colozoo/books.thumbs.test.ts`
Expected: FAIL — `thumbSvg` undefined on books.

- [ ] **Step 3: Write minimal implementation**

3a. In `src/lib/colozoo/types.ts`, add to `ColozooBook` (after `coverEmoji`):
```ts
  /** Optional inline-SVG thumbnail (viewBox 0 0 64 64, no <svg> wrapper) for
   *  the template bar. Falls back to coverEmoji when absent. */
  thumbSvg?: string;
```

3b. In `src/lib/colozoo/books.ts`, add a `thumbSvg` to each of the 5 book objects. Flat brand shapes (keep simple — these are 64px chips):
```ts
// Trucks (fire-engine red body + wheels)
thumbSvg: '<rect x="8" y="26" width="40" height="20" rx="3" fill="#EF5B5B"/><rect x="30" y="18" width="18" height="14" rx="2" fill="#EF5B5B"/><rect x="34" y="21" width="10" height="7" fill="#BFE7F5"/><circle cx="18" cy="50" r="6" fill="#333"/><circle cx="44" cy="50" r="6" fill="#333"/>',
// Animals (lion face)
thumbSvg: '<circle cx="32" cy="32" r="20" fill="#F5943B"/><circle cx="32" cy="34" r="13" fill="#FBD24E"/><circle cx="25" cy="32" r="2.5" fill="#333"/><circle cx="39" cy="32" r="2.5" fill="#333"/><path d="M28 40 q4 4 8 0" stroke="#333" stroke-width="2" fill="none"/>',
// Ocean (fish)
thumbSvg: '<ellipse cx="30" cy="32" rx="18" ry="12" fill="#4A90E2"/><path d="M48 32 l10 -8 v16 z" fill="#4A90E2"/><circle cx="22" cy="30" r="2.5" fill="#fff"/><circle cx="22" cy="30" r="1.2" fill="#333"/>',
// Bugs (ladybug)
thumbSvg: '<circle cx="32" cy="34" r="18" fill="#EF5B5B"/><path d="M32 16 v36" stroke="#333" stroke-width="2"/><circle cx="24" cy="30" r="2.5" fill="#333"/><circle cx="40" cy="30" r="2.5" fill="#333"/><circle cx="26" cy="42" r="2.5" fill="#333"/><circle cx="38" cy="42" r="2.5" fill="#333"/><circle cx="32" cy="14" r="5" fill="#333"/>',
// Castle
thumbSvg: '<rect x="14" y="28" width="36" height="24" fill="#C3B1E1"/><rect x="12" y="20" width="8" height="12" fill="#C3B1E1"/><rect x="28" y="20" width="8" height="12" fill="#C3B1E1"/><rect x="44" y="20" width="8" height="12" fill="#C3B1E1"/><rect x="28" y="40" width="8" height="12" fill="#6DBE6A"/>',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/colozoo/books.thumbs.test.ts`
Expected: PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/colozoo/types.ts src/lib/colozoo/books.ts src/lib/colozoo/books.thumbs.test.ts
git commit -m "feat(colozoo): inline-SVG thumbnails for the 5 template books"
```

---

### Task 6: Font loader + shell (header, leaves, stage) in `ColozooWorkspace.tsx`

**Files:**
- Modify: `src/components/ColozooWorkspace.tsx`

**Interfaces:**
- Consumes: `COLOZOO_THEME`, `LEAF_SVG`, `SPARKLE_PATH` (Task 1); existing `saveColozooPage`, `onOpenSidebar`.

This and Tasks 7–9 are **visual** — verify via tsc + build + live-drive, no class snapshots.

- [ ] **Step 1: Load Fredoka alongside Nunito.** In the existing `useEffect` that injects the Nunito `<link>` (around line 167), change the href to also request Fredoka:
```ts
    link.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;800;900&display=swap';
```

- [ ] **Step 2: Replace the root background + header.** Swap the cream root background for the teal shell and rebuild the top bar as: lowercase `colozoo` wordmark (Fredoka, white) on the left; a settings ⚙️ button and a share 🔗 button on the right. Wire share to the existing `savePage`. Keep `onOpenSidebar` reachable (fold the ☰ into the settings menu or keep a small menu button). Add the four corner `LEAF_SVG` shapes (absolute, `pointer-events:none`, low z) tinted teal/yellow/lavender, and 2–3 `SPARKLE_PATH` stars near the header. Root `style` uses `background: COLOZOO_THEME.teal` and `fontFamily` including Fredoka for headings via a class.

- [ ] **Step 3: Add the soft mint stage** behind the coloring surface: a rounded `COLOZOO_THEME.stage` panel the canvas floats on.

- [ ] **Step 4: Settings menu** — clicking ⚙️ toggles a small popover whose only item is **Glow mode** (moves the existing `glow` toggle here). Remove the 🌙 button from the toolbar area.

- [ ] **Step 5: Verify.** Run `npx tsc --noEmit` (clean), `npx eslint src/components/ColozooWorkspace.tsx` (0 errors), `npm run build` (succeeds). Live-drive: switch to ColoZoo — teal shell, wordmark, leaves, share works, ⚙️ toggles glow.

- [ ] **Step 6: Commit**

```bash
git add src/components/ColozooWorkspace.tsx
git commit -m "feat(colozoo): teal brand shell — wordmark header, leaves, mint stage, share, glow-in-settings"
```

---

### Task 7: Left action rail + brush-family popover (`ColozooBrushCard`)

**Files:**
- Create: `src/components/colozoo/ColozooBrushCard.tsx`
- Modify: `src/components/ColozooWorkspace.tsx`

**Interfaces:**
- Consumes: `BRUSH_FAMILIES`, `familyForBrush` (Task 3); `ColozooBrush`, `penProfile`.
- Produces: `<ColozooBrushCard open brush size onPickFamily onSize onClose />` where `onPickFamily(primary: ColozooBrush)` sets the active brush to a family's primary, `size: number`, `onSize(n)` sets brush size. Rendered as a popover anchored off the FAB.

- [ ] **Step 1: Left rail.** In `ColozooWorkspace`, add the left rail (tablet ≥860px): a round brush **FAB** on top, then **Undo**, **Redo**, **Eraser** buttons (labels beneath icons). Undo → existing `undo`; Redo → `coloring.redoFill()` then also a stroke-redo path if the last undone was a stroke (mirror the undo dispatch — maintain a `redoLog` beside `markLog`); Eraser → toggles an `eraser` mode boolean. Drop Hand/Zoom entirely.

- [ ] **Step 2: Brush-size state.** Add `const [brushSize, setBrushSize] = useState(8);` and use it where strokes are built (`buildPoint` currently hardcodes `8` → use `brushSize`). Floor still respected by `penProfile`.

- [ ] **Step 3: Create `ColozooBrushCard`** — a white rounded popover: title "Brush selection", one row per `BRUSH_FAMILIES` entry (icon + label + optional badge), active row highlighted when `familyForBrush(brush) === family.id`; a "Brush size" slider bound to `size`/`onSize`. Closed by default; FAB toggles `brushCardOpen`.

- [ ] **Step 4: Wire eraser interaction.** When `eraser` mode is on, a zone tap calls `coloring.clearZone(zoneId)` instead of `fillZone`; the FAB/brush picking turns eraser off. Fill bucket vs. brush vs. eraser are mutually exclusive modes.

- [ ] **Step 5: Verify.** tsc clean, eslint 0 errors, build succeeds. Live-drive: FAB opens/closes the card; picking a family changes the brush; size slider changes stroke width; Undo/Redo round-trip a fill; Eraser clears a tapped zone.

- [ ] **Step 6: Commit**

```bash
git add src/components/colozoo/ColozooBrushCard.tsx src/components/ColozooWorkspace.tsx
git commit -m "feat(colozoo): action rail + brush-family popover, brush size, eraser, redo"
```

---

### Task 8: Named-color palette column (`ColozooPalette`)

**Files:**
- Create: `src/components/colozoo/ColozooPalette.tsx`
- Modify: `src/components/ColozooWorkspace.tsx`

**Interfaces:**
- Consumes: `COLOZOO_PALETTE_GROUPS`, `ALL_COLOZOO_COLORS` (Task 2); `speakColorName`; current `color`, `pickColor`, `fillMode`, `setFillMode`.
- Produces: `<ColozooPalette color onPick fillMode onFillMode />` — right-side white rounded column. Each group renders its `label` then named pills (colored row + text label, active pill ringed teal). Bottom: fill-bucket (`onFillMode(true)`) + a rainbow/more button (opens the existing HSB picker if wired, else no-op placeholder that is clearly cosmetic).

- [ ] **Step 1: Create `ColozooPalette`** with the two labeled groups and named pills. Pill click → `onPick(hex, name)` (which calls `speakColorName`). Fill bucket at the bottom toggles `fillMode`.

- [ ] **Step 2: Replace the bottom paint-pots strip** on tablet with this column on the right of the stage. Keep the color-name announce behavior.

- [ ] **Step 3: Point the palette source at `ALL_COLOZOO_COLORS`.** Ensure the active `color` initializes to a valid member (`ALL_COLOZOO_COLORS[0].hex` or nearest). Glow ink tinting stays a render-time concern; the picker always shows the branded named set.

- [ ] **Step 4: Verify.** tsc clean, eslint 0 errors, build succeeds. Live-drive: pills grouped Core/Accent; tapping a pill sets color and speaks the name; fill bucket toggles fill mode; filling a zone uses the chosen color.

- [ ] **Step 5: Commit**

```bash
git add src/components/colozoo/ColozooPalette.tsx src/components/ColozooWorkspace.tsx
git commit -m "feat(colozoo): named-color palette column (Core/Accent, spoken names)"
```

---

### Task 9: Template bottom bar (`ColozooTemplateBar`) + SAVE pill + responsive collapse

**Files:**
- Create: `src/components/colozoo/ColozooTemplateBar.tsx`
- Modify: `src/components/ColozooWorkspace.tsx`

**Interfaces:**
- Consumes: `COLOZOO_BOOKS`, `ColozooBook.thumbSvg` (Task 5); `coloring.bookId`, `coloring.switchBook`; `savePage` (existing).
- Produces: `<ColozooTemplateBar books activeBookId onPick onSave />` — bottom white rounded bar; illustrated thumbs (render `thumbSvg` in `<svg viewBox="0 0 64 64">`, fallback `coverEmoji`) with book titles; centered teal **SAVE MY ART!** pill calling `onSave`.

- [ ] **Step 1: Create `ColozooTemplateBar`.** Thumbs left+right of a centered SAVE pill (matches v3). Active book's thumb ringed teal. Tapping a thumb → `switchBook`.

- [ ] **Step 2: Wire it** into `ColozooWorkspace`, replacing the old book-shelf dropdown + page-dots-only footer. Keep page dots for within-book navigation (they're separate from book selection) — place them above or within the bar.

- [ ] **Step 3: Responsive collapse (<860px).** Below the breakpoint: hide the left rail, brush card (make it a bottom sheet toggled by a compact brush button), and palette column (fall back to the horizontal named-swatch strip). The template bar becomes horizontally scrollable. Canvas goes full width. Verify with a narrow window.

- [ ] **Step 4: Verify.** tsc clean, eslint 0 errors, build succeeds. Live-drive tablet: pick each of the 5 templates → canvas outline changes, active thumb ringed; SAVE MY ART! exports/shares the PNG. Narrow the window → rails collapse, still usable one-handed.

- [ ] **Step 5: Commit**

```bash
git add src/components/colozoo/ColozooTemplateBar.tsx src/components/ColozooWorkspace.tsx
git commit -m "feat(colozoo): illustrated template bar + SAVE MY ART pill + phone collapse"
```

---

### Task 10: Full-mode verification pass

**Files:** none (verification + any fixes surfaced).

- [ ] **Step 1: Whole suite.** Run `npm test` — all ColoZoo tests + existing suite pass.
- [ ] **Step 2: Types + lint + build.** `npx tsc --noEmit` clean; `npx eslint .` (0 errors — warnings from pre-existing files acceptable); `npm run build` succeeds.
- [ ] **Step 3: Live-drive checklist (user-run).** Switch to ColoZoo → pick brush family → pick named color (hear name) → fill zones → Undo/Redo round-trip → Eraser clears a zone → pick each template → glow via ⚙️ → SAVE MY ART! downloads/shares a correct PNG → narrow window collapses cleanly. Other modes (mobile/notebook/canvas) unaffected.
- [ ] **Step 4: Commit any fixes**, then the reskin is ready to merge to `main` for live deploy.

---

## Self-Review

**Spec coverage:** §2 layout → Tasks 6–9; §4 tokens → Task 1; §5 palette → Task 2 + Task 8; §6 brush families → Task 3 + Task 7; §7 Redo/Eraser/Share → Task 4 (logic) + Task 6 (share) + Task 7 (rail/eraser); §8 templates → Task 5 + Task 9; §3 responsive → Task 9 Step 3; §12 resolved decisions (eraser tap-only, redo in hook, brush card popover) → Tasks 4 & 7. Glow-in-settings → Task 6 Step 4. All covered.

**Placeholder scan:** the palette "more colors" rainbow button is explicitly marked cosmetic-if-unwired (Task 8) — not a hidden TODO. No other placeholders.

**Type consistency:** `clearZone`/`redoFill`/`canRedo` names match between Task 4 interface, implementation, and Tasks 7–9 consumers. `BRUSH_FAMILIES`/`familyForBrush` consistent Task 3 ↔ 7. `COLOZOO_PALETTE_GROUPS`/`ALL_COLOZOO_COLORS` consistent Task 2 ↔ 8. `thumbSvg` consistent Task 5 ↔ 9. `FillAction.redoColor` added in Task 4 and set at every push site.
