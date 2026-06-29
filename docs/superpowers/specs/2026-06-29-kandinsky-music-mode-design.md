# Kandinsky "Music" Mode — Design

**Date:** 2026-06-29
**Status:** Approved for planning

## Overview

A canvas toggle that turns Stylus's drawing surface into a Chrome Music
Lab–style Kandinsky instrument. When the mode is on:

- Each finished stroke is classified into a shape and plays a note
  **immediately** on stroke-end (live acoustic feedback), pitched by where the
  shape sits vertically.
- A **Play** button sweeps a vertical playhead left → right across the canvas;
  each shape fires as the bar crosses its left edge, and the bar **loops** back
  to the left when it reaches the right edge.
- A **bi-color toggle** swaps between two instrument palettes.

Drawing, documents, and storage are unchanged. Music is a **layered,
session-only** mode: the user's ink is never altered, and no new state is
persisted.

## Model

### Shapes (5 classes)

`line | circle | triangle | square | freeform`

Classification runs on stroke-end over the stroke's `InkPoint[]`:

- **Closed-loop test:** start point ≈ end point (within a distance threshold)
  gates the geometric classes. Open paths are `line` or `freeform`.
- **Corner count (RDP):** Ramer–Douglas–Peucker simplification of a closed path;
  3 corners → `triangle`, 4 → `square`.
- **Roundness:** for a closed path, low variance of point-to-centroid radius →
  `circle`.
- Otherwise: open path → `line` (low max-deviation from the start→end chord) or
  `freeform`.

The geometry helpers port from the Kandinsky standalone clone
(`isLine`/`isCircle`/`rdp`), extended with a `square` case (RDP corner count 4).

### Pitch (Y → pentatonic)

The shape's center-Y is normalized against canvas height and mapped to an index
in a **hardcoded pentatonic scale**:

- `Y = 0` (top) → highest note in the scale.
- `Y = height` (bottom) → lowest note.

Pentatonic guarantees any combination sounds harmonious.

### Time (X → playhead)

Each shape carries its **min-X** (left bound). On Play, a vertical bar sweeps at
a fixed tempo. A shape's note fires when the bar crosses its min-X. The bar
loops at the right edge until stopped.

**Frame-drop safety:** the trigger checks whether a shape's min-X falls in the
half-open interval `[prevPlayheadX, currPlayheadX)` for the frame, rather than an
exact match — so a dropped frame never swallows a note. The same interval logic
handles the loop-wrap edge.

## Components

1. **`src/lib/kandinsky/classify.ts`** — pure `classifyShape(points): Shape`
   plus geometry helpers (closed-loop, RDP, roundness, line-deviation). No side
   effects. Unit-tested.

2. **`src/lib/kandinsky/scale.ts`** — pure `pitchForY(centerY, height): Note`
   (pentatonic mapping). Unit-tested.

3. **`src/lib/kandinsky/audio.ts`** — lazy Tone.js engine. `loadAudio()`
   dynamically imports `tone` (npm dependency, lazy via the existing
   `importChunk` pattern, after a user gesture so Web Audio may start). Two
   palettes mapping the 5 shapes to instruments:

   | Shape    | Palette A (organic)        | Palette B (electronic)     |
   | -------- | -------------------------- | -------------------------- |
   | line     | sustained string/wind synth| bright FM pluck            |
   | circle   | vocal "ah" choir           | resonant bell tone         |
   | square   | staccato brass-like stab   | 8-bit chiptune synth       |
   | triangle | acoustic snare/percussion  | electronic drum / hi-hat   |
   | freeform | (same instrument as line)  | (same instrument as line)  |

   Exposes `playShape(shape, note, palette)`.

4. **`src/hooks/useMusicMode.ts`** — owns `enabled`, `palette` (A/B), `playing`,
   the loaded engine, and the playhead rAF loop (sweep + interval-based per-shape
   trigger + loop-wrap). Exposes `toggle()`, `cyclePalette()`, `play()`,
   `stop()`, and `noteForStroke(stroke)` for the live per-stroke sound.

5. **Playhead overlay** — a thin absolutely-positioned vertical bar rendered over
   the canvas while playing, animated by the rAF loop. No canvas-internal
   changes.

6. **`useDrawing` change** — add an optional `onStrokeEnd?(stroke)` callback
   fired the moment a stroke commits, so `Workspace` can play the live note with
   near-zero latency without the music layer reaching into drawing internals.
   (Exact commit point confirmed when reading `useDrawing` during planning.)

7. **Toolbar additions** — a **music toggle** IconButton (note icon). When
   enabled, a **Play/Stop** button and the **bi-color palette toggle** appear.
   New `ToolbarProps`: `musicMode`, `onToggleMusic`, `playing`, `onPlayToggle`,
   `palette`, `onCyclePalette`. Play/palette controls are hidden or disabled when
   the canvas is empty.

## Data Flow

- **Draw:** pointer-up → stroke commits in `useDrawing` → `onStrokeEnd(stroke)` →
  `Workspace`, if music on, calls
  `playShape(classify(stroke), pitchForY(centerY, height), palette)`
  immediately (zero added latency).
- **Play:** `play()` starts a rAF sweep over `[0, canvasWidth]`. Each frame, any
  shape whose min-X lies in `[prevX, currX)` fires its note; at the right edge
  the bar wraps to 0 and continues until `stop()`.

No persisted state is added. Strokes are stored exactly as today.

## Out of Scope (YAGNI)

- Visual shape-snapping to clean SVGs and circle "blinking eyes" — would alter
  the user's handwriting in a notes app. Sound-only keeps the mode faithful
  *musically* without touching ink.
- Per-document persistence of the music toggle (session-only).
- A third palette (the bi-color toggle is binary by design).
- A separate snapshot export (Stylus already exports PNG/PDF).

## Testing

- **Unit (pure, deterministic):** `classifyShape` with line / circle / triangle /
  square / freeform point fixtures; `pitchForY` for top / middle / bottom (and
  monotonicity: higher Y → lower note).
- **Manual / run-the-app:** audio engine and playhead loop (Tone is mocked in
  unit tests; real audio + the sweeping bar are verified by running Stylus).
