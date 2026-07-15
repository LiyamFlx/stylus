# Stylus — Universal Digital Ink Canvas

[![CI](https://github.com/LiyamFlx/stylus/actions/workflows/ci.yml/badge.svg)](https://github.com/LiyamFlx/stylus/actions/workflows/ci.yml)
&nbsp;![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
&nbsp;![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

**Write every thought. On every device.**

A no-install, no-login digital ink canvas that works everywhere: desktop
(mouse / trackpad) and touch devices (iPad, Android tablets, Apple Pencil, any
stylus, or a finger). Open the page and start writing.

Stylus is part of the **Scanmarker** product family and shares its visual
identity — dark-first theme, Inter typography, and the `#e76f2c` brand accent.

Built with **React + TypeScript + Vite**, a native **Canvas 2D** drawing
surface, the **Pointer Events API** for universal input (with pressure), and
**Tesseract.js** (in-browser OCR) for handwriting → text — runs on every
device, no API key required.

See [`CHANGELOG.md`](CHANGELOG.md) for what's shipped recently.

---

## Features

**P0 — core inking**
- ✏️ Smooth freehand strokes via Pointer Events + `requestAnimationFrame`
- 🖊️ Pressure sensitivity where the device reports it (stylus / Apple Pencil)
- 🌐 One code path for mouse, touch, stylus, and finger
- 🧽 Stroke-based eraser — splits a stroke at the contact point instead of
  deleting the whole thing, so erasing through the middle of a long stroke
  leaves both remaining ends intact (still one undo step per erase drag)
- ↩️ Stroke-based Undo / Redo (full history stack)
- ▭ Shape tool (rectangle / ellipse / line / arrow) with move, resize, and
  rotate

**P1 — productivity**
- 🔤 Handwriting → text via Claude vision (primary) with in-browser OCR
  (Tesseract.js) as an offline fallback — see [details](#handwriting-recognition)
- 🎨 Pen toolbar: multiple pen types, thicknesses, 8 preset colors + a
  custom color picker / HSB wheel
- 📤 Export menu: **PNG**, **PDF** (`jsPDF`), **Markdown**, and plain text
- 💾 Auto-save to `localStorage` on every stroke; restored automatically on
  load
- 📁 Folders, tags, and full-text search across documents
- 🗂️ Notebook page templates (bundled manifest) with a picker gallery
- ☁️ Optional sync: sign in with Clerk to back up documents/pages to
  Postgres and pick them up on another device (see
  [`docs/adr/002-backend-sync-architecture.md`](docs/adr/002-backend-sync-architecture.md))

---

## Quick start

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:5173>). The dev server
binds to your LAN (`host: true` in `vite.config.ts`) so you can open the
**Network** URL on a real iPad or Android tablet on the same Wi-Fi to test
stylus / touch input.

### Build for production

```bash
npm run build     # type-checks, then builds to dist/
npm run preview   # serve the production build locally
```

---

## Handwriting recognition

Handwriting → text uses **[Tesseract.js](https://github.com/naptha/tesseract.js)**,
a WebAssembly OCR engine that runs **entirely in the browser**. No API key, no
account, no paid service. Click the **T** button in the toolbar to recognize
what you've written; the result appears in a panel at the bottom.

**There is nothing to configure, and it works on every modern browser** —
including Safari, iPad, and Chrome on macOS. The OCR language model (~a few MB)
is downloaded once from a CDN on first use and cached by the browser afterward,
so the first recognition is a little slower than subsequent ones.

How it works: `recognizeText(strokes)` (in
[`src/lib/recognition.ts`](src/lib/recognition.ts)) rasterizes the ink into a
clean bitmap and first tries **Claude vision** via `/api/recognize`
(a Vercel serverless function on the Vercel AI Gateway, no API key in
client code). If that's unavailable — offline, backend down, or the AI
budget is reached — it falls back to the same in-browser Tesseract.js OCR
engine the app originally shipped with, so recognition still works with no
network at all.

> [!NOTE]
> The Tesseract fallback is strongest on **neat / printed** handwriting;
> very fast or messy **cursive** is harder for OCR. Claude vision (the
> primary path) handles cursive and messier handwriting much better when a
> network connection is available.

---

## Design system

Stylus matches the **Scanmarker** app's visual identity so it feels like a
sibling tab in the same product. Tokens were extracted from the Scanmarker
build (not guessed) and live in [`tailwind.config.js`](tailwind.config.js):

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0a0a0a` | canvas / page background |
| `bg-subtle` / `bg-muted` | `#111113` / `#18181b` | cards / elevated surfaces |
| `border` / `border-strong` | `#27272a` / `#3f3f46` | dividers, surface borders |
| `ink-900…400` | `#fafafa` → `#a1a1aa` | text, from primary to muted labels |
| `brand-500` | `#e76f2c` | primary accent / active tool / CTA |
| `brand-600` / `brand-700` | `#cc5b1f` / `#a6481b` | hover / eyebrow labels |

- **Type:** Inter (UI/body) + JetBrains Mono, self-hosted via Fontsource — same
  families Scanmarker ships. Headings heavy, body clean, labels muted/uppercase.
- **Dark-first**, no light-mode toggle in the MVP (matches the family default).
- **Icons:** outline style, 2px stroke (Lucide-equivalent).
- **No gradients.** Branding: lowercase `stylus` wordmark, orange app mark,
  "A Scanmarker product" footer.

---

## Project structure

The app has grown well past the original P0/P1 scope below (folders, tags,
search, shapes, templates, sync); this list covers the files most worth
knowing first, not the full tree — browse `src/` for the rest.

```
src/
  components/
    Canvas.tsx       # pure drawing surface — forwards a ref, emits pointer events
    Toolbar.tsx      # floating pill: tools / sizes / colors / undo-redo / export
    Sidebar.tsx      # documents, folders, tags, search, profile settings
    Workspace.tsx    # per-document/page composition: drawing + text + images
    TextPanel.tsx    # handwriting-recognition output panel
    Brand.tsx        # wordmark + subtitle header and "A Scanmarker product" footer
    icons.tsx        # inline SVG icon set
  hooks/
    useDrawing.ts    # all pointer logic, live rendering, eraser, shapes, history
    useHistory.ts    # generic undo/redo stack
    useLocalStorage.ts # versioned auto-save / restore
    useRecognition.ts  # async lifecycle for recognition calls
    useSync.ts       # background push/pull against the Postgres sync backend
  lib/
    recognition.ts   # handwriting recognition — Claude vision primary, Tesseract fallback
    recognitionError.ts # error type (split out so it doesn't pull in the engine)
    export.ts        # PNG / PDF / Markdown / text export (offscreen render, code-split)
    render.ts        # canvas path/pressure rendering shared by live + export
    geometry.ts       # hit-testing, bounds, eraser-split, shape transforms
    documents.ts      # local document/folder/page index (localStorage)
    syncApi.ts / syncQueue.ts # sync client (see docs/adr/002-backend-sync-architecture.md)
  types.ts           # Stroke / Shape / TextItem / InkPoint model, presets
  App.tsx            # composition + keyboard shortcuts
  main.tsx           # React entry
api/
  refine.ts          # AI text refinement (polish/grammar/summarize/…)
  recognize.ts       # Claude vision handwriting recognition
  sync/*.ts          # document/page push-pull + migration-status routes
```

### Data model

A drawing is `Stroke[]`. Each `Stroke` holds `InkPoint[]` with `x`, `y`,
normalized `pressure` (0–1), and `t` (ms since the stroke began). Keeping raw
timed points means the same data feeds both smooth rendering *and* the
handwriting recognizer (which consumes per-point `{ x, y, t }`) with no rework.

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `P` / `B` | Pen |
| `E` | Eraser |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + Shift + Z` or `Ctrl + Y` | Redo |

---

## Mobile / touch notes

- The canvas sets `touch-action: none` so finger drags draw ink instead of
  scrolling or pinch-zooming the page.
- `index.html` ships a locked viewport (`user-scalable=no`, `viewport-fit=cover`)
  and PWA-style status-bar meta tags for a full-bleed feel on iOS/Android.
- The canvas is rendered at `devicePixelRatio` for crisp ink on retina screens.
- On narrow screens the toolbar collapses to a single menu button that expands
  into an icon tray.

---

## Tech notes

- **Rendering:** committed strokes are repainted into a DPR-scaled 2D context;
  the in-progress stroke is drawn on top each animation frame for low latency.
  Pointer `getCoalescedEvents()` is used so fast strokes stay smooth.
- **Eraser undo:** an erase drag mutates a private working copy — splitting
  strokes at contact points rather than deleting them outright — and commits
  a single history entry on pointer-up, so one drag = one undo regardless of
  how many strokes or split points it touched.
- **Lazy heavy deps:** `jsPDF` (export) and `tesseract.js` (OCR) are both
  dynamically imported on first use, so neither bloats the initial page load —
  the canvas boots fast and the engines load only when you export or recognize.

---

## License

[MIT](LICENSE) © Liyam Flexer

<!-- deploy connectivity check: 2026-06-30T15:00Z -->
