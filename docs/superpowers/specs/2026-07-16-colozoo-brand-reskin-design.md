# ColoZoo Brand Reskin — Design Spec

**Date:** 2026-07-16
**Scope:** Reskin the ColoZoo coloring mode (`src/components/ColozooWorkspace.tsx`)
to the Colozoo brand (teal / red / yellow, wordmark, leaf motifs, product-family
brushes, named color pills). Layout follows the approved `v3` mockup.

## 1. Goal & non-goals

**Goal:** Replace the current cream/orange ColoZoo UI with a Colozoo-branded
tablet-first layout: teal shell, `colozoo` wordmark, floating brush-selection
card, right-side named-color palette, illustrated template picker in the bottom
bar, big "SAVE MY ART!" pill. Keep it simple, cool, and fun for young children.

**Non-goals (explicitly out of scope):**
- No marketing/onboarding screens ("4 steps", safety copy) — vibe only.
- Hand + Zoom tools: **dropped** (page is fixed-fit by design; dead buttons removed).
- No change to the drawing engine, `render.ts`, or the core canvas/toolbar.
- Template thumbnail art is **generated inline SVG**, not sourced image files.
- Interaction logic (flood fill, ink layer, stars, book completion, PNG export)
  is preserved — this is presentation plus three small new controls.

## 2. Layout (tablet ≥ 860px)

```
┌──────────────────────────────────────────────────────────┐
│  colozoo                                    [⚙️] [🔗]      │  teal header
├──────────────────────────────────────────────────────────┤
│ (leaf)   ┌ Brush selection ┐                    ┌ Palette┐│
│  ◉ FAB   │ 🖍️ Magic Pens   │                    │ Black  ││
│  Undo    │ 🖌️ Paint Brushes│    [ CANVAS ]       │ White  ││
│  Redo    │ 🖊️ Ceramic Mkrs │   (SVG page to     │ Red    ││
│  Eraser  │ 🎨 Fabric Paint │    color, fixed-fit)│ ...    ││
│          │ Brush size ▬▬●▬ │                    │ 🪣 🌈  ││
│ (leaf)   └─────────────────┘                    └────────┘│
├──────────────────────────────────────────────────────────┤
│ [Trucks][Animals]  ✨ SAVE MY ART! ✨  [Ocean][Bugs][Castle]│  templates
└──────────────────────────────────────────────────────────┘
```

**Regions & single responsibility (no duplication):**
- **Header** — wordmark (left); settings ⚙️ + share 🔗 (right). Settings opens a
  small menu whose only item is **Glow mode** (relocated from the toolbar).
- **Left rail** — actions only: Brush FAB, Undo, Redo, Eraser.
- **Brush card** (floating, left) — the *one* place to pick brush family + size.
  Brush families map to the existing `COLOZOO_BRUSHES` grouped under 4 labels.
- **Palette column** (right) — colors only, as **named pills** (text label on a
  colored row), grouped "Core Colors" / "Colozoo Accent Colors"; fill-bucket +
  more-colors at the bottom.
- **Bottom bar** — template/book picker (5 illustrated SVG thumbnails) with the
  **SAVE MY ART!** pill centered.

## 3. Responsive (phone < 860px)

Left rail, brush card, and palette column collapse. Fall back to the current
bottom-docked pattern: a horizontally scrollable brush+action strip and a
named-swatch strip, plus the template row. Canvas takes full width. One-handed.
The header, wordmark, and teal shell remain.

## 4. Design tokens (new: `src/lib/colozoo/theme.ts`)

Centralize the brand so no hex is loose in JSX.

```
teal      #3BBAC6   primary — header, active fills, SAVE pill, active pill ring
tealDeep  #2AA3AF   shadows / pressed
red       #EF5B5B   accent (Paint Brushes family, secondary CTA)
yellow    #FBD24E   highlights, sparkles
pink      #F49AC2   accent color pill / leaf
lavender  #C3B1E1   accent color pill / leaf
green     #6DBE6A   Lime Green pill / Ceramic family
blue      #4A90E2   Blue pill / Fabric family
orange    #F5943B   Orange pill
stage     #DFF3F1   soft mint stage behind the canvas
```

**Type:** load **Fredoka** (wordmark, headings) alongside the existing **Nunito**
(body/labels). Heavy rounding everywhere (`rounded-2xl`/`3xl`), chunky buttons,
soft shadows, springy `active:scale` on every button.

**Motif:** four organic leaf SVGs bleeding from the corners; a few white
four-point sparkle vectors near the header and SAVE pill. Decorative,
`pointer-events:none`, `z` below chrome.

## 5. Color palette reconciliation

Replace the per-brush palette swap (Tempera 12 / Glow 8 / Metallic 2 as the
*visible* set) with **one named set** shown in the column, grouped:

- **Core Colors:** Black, White, Brown, Primary Red, Blue, Yellow, Orange
- **Colozoo Accent Colors:** Pink, Lavender, Teal, Lime Green

Names are retained and still spoken aloud via `speakColorName` (existing feature).
`palettes.ts` gains a `COLOZOO_PALETTE: { group, colors: NamedColor[] }[]`
structure; `paletteForBrush` is simplified/retired for the visible palette
(glow's neon set still applies as the *rendered* ink colors when glow is on, but
the pill column stays the named brand set for consistency — glow tints happen at
draw time, not by swapping the picker).

## 6. Brush families

Group the existing `COLOZOO_BRUSHES` under 4 product-family rows in the card:
- **Magic Pens** → marker-type brushes (czMarker, czMagicMarker, czGlow)
- **Paint Brushes** → czPaintbrush, czDaub
- **Ceramic Markers** → czCeramic, czPorcelain
- **Fabric Paint** → czCrayon, czChalk, czPencil, czColorPencil

Selecting a family sets the active brush to that family's primary member.
Optional decorative badges: "Washes Out" (Magic Pens), "3D Puffy Effect"
(Fabric Paint) — static labels, no behavior.

## 7. New wired controls (cheap only)

- **Redo** — add a redo stack mirroring the existing `markLog`/undo. On undo,
  push the undone mark onto a redo stack; Redo re-applies it; any new mark clears
  the redo stack. Covers both stroke and fill marks.
- **Eraser** — a mode: tapping a filled zone clears its fill (`undoFill`-style
  removal by zone id → new `clearZone(id)` on the hook); dragging over ink erases
  strokes it crosses (or, simplest v1: eraser clears the last stroke under a tap —
  decide in plan). Records into markLog so undo/redo still work.
- **Share** (header 🔗) — calls existing `saveColozooPage(...)` (PNG export +
  native share/download). Same function the completion screen uses.

**Cosmetic:** none — Hand/Zoom removed entirely rather than faked.

## 8. Templates (bottom bar)

Each `ColozooBook` gains an optional `thumbSvg?: string` (inline SVG markup, no
`<svg>` wrapper), authored flat/brand-colored: fire-truck, lion, fish, ladybug,
castle. Bottom bar renders these as rounded thumbnails; tapping switches the book
via the existing `coloring.switchBook`. Falls back to `coverEmoji` if `thumbSvg`
is absent. Star/completion behavior unchanged.

## 9. Data-flow & preserved behavior

Unchanged: `useColoringPage` hook (fills, stars, book/page nav, completion),
freehand ink canvas + `drawStroke` textures, `saveColozooPage`, shake-to-undo,
"Nice!" stamp, book-complete confetti card, `speakColorName`. The reskin rewires
*where* controls render and *what* they look like; the hooks/logic stay.

## 10. Files touched

- `src/lib/colozoo/theme.ts` — **new**: brand tokens + leaf/sparkle SVG snippets.
- `src/lib/colozoo/palettes.ts` — grouped named palette; Fredoka note.
- `src/lib/colozoo/books.ts` — add `thumbSvg` to each book (5 inline SVGs).
- `src/lib/colozoo/types.ts` — `ColozooBook.thumbSvg?: string`.
- `src/hooks/useColoringPage.ts` — add `clearZone(id)` + redo support (or a
  thin redo layer in the component; decide in plan).
- `src/components/ColozooWorkspace.tsx` — the reskin (largest change). If it
  grows too big, extract `ColozooPalette`, `ColozooBrushCard`, `ColozooTemplateBar`
  as sibling components under `src/components/colozoo/`.

## 11. Verification

- tsc clean, eslint clean, `npm run build` succeeds.
- Live drive (user): switch to ColoZoo → pick brush family → pick named color
  (hear name) → fill zones → Redo/Eraser work → pick a template → Save. Phone
  width collapses cleanly. Glow reachable via ⚙️.
- No regression to other modes (mobile/notebook/canvas).

## 12. Open decisions deferred to the plan

- Eraser precision (tap-clears-fill only vs. also stroke-erase on drag).
- Whether redo lives in the hook or the component.
- Whether the brush card is a permanent panel or a popover off the FAB on tablet.
