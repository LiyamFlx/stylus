# Stylus — Universal Digital Ink Canvas

[![CI](https://github.com/LiyamFlx/stylus/actions/workflows/ci.yml/badge.svg)](https://github.com/LiyamFlx/stylus/actions/workflows/ci.yml)
&nbsp;![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
&nbsp;![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

A no-install, no-login digital ink canvas that works everywhere: desktop
(mouse / trackpad) and touch devices (iPad, Android tablets, Apple Pencil, any
stylus, or a finger). Open the page and start writing.

Built with **React + TypeScript + Vite**, a native **Canvas 2D** drawing
surface, the **Pointer Events API** for universal input (with pressure), and
the browser's built-in **Handwriting Recognition API** for handwriting → text
(on-device, no API key required).

---

## Features

**P0 — core inking**
- ✏️ Smooth freehand strokes via Pointer Events + `requestAnimationFrame`
- 🖊️ Pressure sensitivity where the device reports it (stylus / Apple Pencil)
- 🌐 One code path for mouse, touch, stylus, and finger
- 🧽 Stroke-based eraser (erases whole strokes on contact, not pixels)
- ↩️ Stroke-based Undo / Redo (full history stack)

**P1 — productivity**
- 🔤 Handwriting → text via the browser's on-device Handwriting Recognition API
  (no key, no cost — see [browser support](#handwriting-recognition) below)
- 🎨 Pen toolbar: 3 thicknesses, 8 preset colors + a custom color picker
- 📤 Export to **PNG** and **PDF** (`jsPDF`)
- 💾 Auto-save to `localStorage` on every stroke; restored automatically on load

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

Handwriting → text uses the browser's built-in **[Handwriting Recognition
API](https://developer.chrome.com/docs/web-platform/handwriting-recognition)**.
It runs **on-device** — no API key, no account, no network call, no cost.
Click the **T** button in the toolbar to recognize what you've written; the
result appears in a panel at the bottom.

There is **nothing to configure** — it works out of the box where the browser
supports it.

> [!IMPORTANT]
> **Browser support is limited.** The Handwriting Recognition API ships in
> Chromium-based browsers (**Chrome / Edge**) on **ChromeOS, Windows, and
> Linux**. It is **not** available in:
> - **Safari** (so not iPad / iPhone Safari),
> - **Firefox**, or
> - in most cases **Chrome on macOS**.
>
> Everywhere it's unavailable, drawing / erasing / undo / export / auto-save
> still work fully — only the **Recognize** button shows a clear
> "not available in this browser" message instead of erroring. The check lives
> in [`isRecognitionSupported()`](src/lib/recognition.ts).

### Want recognition everywhere (incl. iPad / Safari)?

The browser API can't cover Safari/iOS. If you need cross-platform recognition,
swap [`src/lib/recognition.ts`](src/lib/recognition.ts) for a cloud service —
its public surface is just `recognizeText(strokes)` and `isRecognitionSupported()`,
so only that one file changes. Good options:

- **MyScript iink** — best accuracy for cursive & math (free dev tier,
  paid above it): <https://developer.myscript.com/>
- **Google Cloud Vision** / **Azure Ink Recognizer** — general handwriting.

For any cloud provider, proxy the call through a small backend so the API
secret never ships in the client bundle.

---

## Project structure

```
src/
  components/
    Canvas.tsx       # pure drawing surface — forwards a ref, emits pointer events
    Toolbar.tsx      # floating pill: tools / sizes / colors / undo-redo / export
    TextPanel.tsx    # handwriting-recognition output panel
    icons.tsx        # inline SVG icon set
  hooks/
    useDrawing.ts    # all pointer logic, live rendering, eraser, history wiring
    useHistory.ts    # generic stroke-based undo/redo stack
    useLocalStorage.ts # versioned auto-save / restore
    useRecognition.ts  # async lifecycle for recognition calls
  lib/
    recognition.ts   # browser Handwriting Recognition API client (no keys)
    export.ts        # PNG + PDF export (offscreen render, code-split)
    render.ts        # canvas path/pressure rendering shared by live + export
  types.ts           # Stroke / InkPoint model, presets
  App.tsx            # composition + keyboard shortcuts
  main.tsx           # React entry
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
- **Eraser undo:** an erase drag mutates a private working copy and commits a
  single history entry on pointer-up, so one drag = one undo.
- **Export bundle:** `jsPDF` is heavy, so `lib/export.ts` is dynamically
  imported on first export — it stays out of the initial page load.

---

## License

[MIT](LICENSE) © Liyam Flexer
