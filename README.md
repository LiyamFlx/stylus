# Stylus — Universal Digital Ink Canvas

[![CI](https://github.com/LiyamFlx/stylus/actions/workflows/ci.yml/badge.svg)](https://github.com/LiyamFlx/stylus/actions/workflows/ci.yml)
&nbsp;![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
&nbsp;![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

A no-install, no-login digital ink canvas that works everywhere: desktop
(mouse / trackpad) and touch devices (iPad, Android tablets, Apple Pencil, any
stylus, or a finger). Open the page and start writing.

Built with **React + TypeScript + Vite**, a native **Canvas 2D** drawing
surface, the **Pointer Events API** for universal input (with pressure), and
**MyScript iink** for handwriting → text.

---

## Features

**P0 — core inking**
- ✏️ Smooth freehand strokes via Pointer Events + `requestAnimationFrame`
- 🖊️ Pressure sensitivity where the device reports it (stylus / Apple Pencil)
- 🌐 One code path for mouse, touch, stylus, and finger
- 🧽 Stroke-based eraser (erases whole strokes on contact, not pixels)
- ↩️ Stroke-based Undo / Redo (full history stack)

**P1 — productivity**
- 🔤 Handwriting → text via the MyScript iink REST API
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

## Where to add your MyScript API keys

Handwriting recognition calls the MyScript iink REST API, which requires
credentials. Without them, drawing/erasing/export all work — only the
**Recognize** button shows a "keys not configured" message.

1. Create a free developer account and get keys at
   **<https://developer.myscript.com/>** (you need an **application key** and an
   **HMAC key**).

2. Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

   ```dotenv
   # .env.local
   VITE_MYSCRIPT_APP_KEY=your-real-application-key
   VITE_MYSCRIPT_HMAC_KEY=your-real-hmac-key
   # optional — defaults to the public cloud:
   VITE_MYSCRIPT_HOST=https://cloud.myscript.com
   ```

3. Restart `npm run dev` (Vite only reads env files at startup).

The keys are consumed in **[`src/lib/myscript.ts`](src/lib/myscript.ts)**, which
reads them from `import.meta.env.*`, signs each request with HMAC-SHA512 (per
MyScript's auth scheme), and POSTs to `/api/v4.0/iink/batch`.

> [!WARNING]
> **Going to production:** Vite inlines `VITE_*` variables into the client
> bundle, so the HMAC secret would be visible to anyone who opens devtools.
> For production, move the signing + fetch into a small backend proxy and have
> the browser call *your* endpoint instead. The request body built in
> `myscript.ts` (`buildBody`) is identical — only the signing location changes.
> Never commit real keys: `.env.local` is git-ignored.

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
    useRecognition.ts  # async lifecycle for MyScript calls
  lib/
    myscript.ts      # iink REST client (HMAC auth) — keys injected here
    export.ts        # PNG + PDF export (offscreen render, code-split)
    render.ts        # canvas path/pressure rendering shared by live + export
  types.ts           # Stroke / InkPoint model, presets
  App.tsx            # composition + keyboard shortcuts
  main.tsx           # React entry
```

### Data model

A drawing is `Stroke[]`. Each `Stroke` holds `InkPoint[]` with `x`, `y`,
normalized `pressure` (0–1), and `t` (ms since the stroke began). Keeping raw
timed points means the same data feeds both smooth rendering *and* MyScript
recognition (which wants per-stroke `x[] / y[] / t[]` arrays) with no rework.

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
