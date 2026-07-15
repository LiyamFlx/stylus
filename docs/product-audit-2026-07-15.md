# Stylus — Product Audit
*Prepared 2026-07-15, against the codebase at commit `39a912f`, live at stylus-flxx.vercel.app*

This audit is grounded in a direct reading of the codebase (not assumptions about a "typical" stylus app). Where I say a feature exists, I've confirmed it in code. Where I say it's missing, I've grepped for it and found nothing. File:line references are included for the technical sections so any claim here is checkable.

---

## 1. Product Strategy Audit

**What the codebase actually is today:** a well-built, single-device, offline-only stylus notebook with real pressure/tilt input, a genuinely good rendering pipeline, working OCR, and one AI text-refinement feature — with **zero collaboration, zero cross-device sync, zero accounts, and zero cloud storage** (confirmed: no backend, no login, no sync code anywhere — `documents.ts:6-22`).

**Is the vision clear?** Partially. "Pen and paper into a powerful digital workspace" is a fine tagline, but the product as built is closer to "a very good local scratch notebook" than "a workspace." A workspace implies your data travels with you and connects to other work; this app's data lives in one browser's localStorage and dies with that browser profile.

**Why would someone choose this over GoodNotes or Apple Notes?** Today, honestly: they mostly wouldn't, unless they specifically want a **no-account, no-cloud, browser-based** tool — e.g., a shared classroom computer, a locked-down enterprise machine, or someone who doesn't want another app store install. That's a real but narrow niche. GoodNotes/Notability/OneNote all have iCloud/Google-account sync, PDF annotation, and years of tuned pen feel on native platforms. This app cannot currently compete on "better handwriting experience" (input handling is genuinely solid — see §3 — but it's still a browser canvas, not a native PencilKit surface) or on "better organization" (flat docs + folders vs. established competitors' notebook hierarchies).

**What's the killer feature, actually?** The strongest, most differentiated thing in the codebase right now is the **"Refine with Claude" AI studio** (`lib/ai.ts`) — OCR your handwriting, then Polish/Fix grammar/Summarize/To-do-list/Formal/Casual/Ask/Translate it, powered by a real Claude backend, not a mock. None of GoodNotes, Notability, or Apple Notes ship anything like this today baked into the writing flow. This is the actual wedge — not "another handwriting app," but "the handwriting app where your notes talk back."

**Is it solving a painful problem?** The pen-and-paper-to-digital-text problem, yes — genuinely, via real OCR + real LLM refinement. The "digital notebook that feels like paper" problem — table stakes, competently done, not differentiated.

**Is the target audience correct?** The listed target audience (students, researchers, designers, engineers, professionals) is too broad for a pre-sync, pre-account, single-device product. **Students** are the only segment for whom "no login, notes stay on this device, and my AI turns messy handwriting into a clean summary/to-do list" is a complete, believable pitch today. Researchers, professionals, and teams will bounce hard off "there is no sync" the moment they try to open their notes on a second device.

**Product risks:**
- **No sync is not a feature, it's a blocker for every segment except "one device, one browser, temporary use."** Every competitor benchmark syncs. This is the single biggest gap in the audit.
- **localStorage as the only storage layer** (~5–10MB browser quota) is a ticking clock, not a design choice that scales — see §11.
- **The AI wedge is currently invisible in positioning.** Nothing in the onboarding tour or marketing framing leads with it as *the* reason to pick this app over GoodNotes.

**Product Strategy Score: 4/10** — strong technical foundation, unclear/unconvincing reason to choose this over entrenched competitors for any segment beyond "no-install browser notebook," and the one genuinely differentiated feature (AI refinement) isn't the spine of the positioning.

---

## 2. User Experience Audit

**First launch / onboarding**: A real 6-step spotlight tour exists (`lib/tourSteps.ts`) — welcome → pen (cycling fountain/ballpoint/brush/highlighter) → select (lasso + floating toolbar) → convert (handwriting→text + "Ask Stylus") → menu (docs, Night Mode, stabilizer) → finish ("everything saves on this device automatically"). It auto-triggers once via a localStorage flag and can be manually restarted. This is good — it's short (30-second framing), touches the AI feature, and is honest about the local-only storage model in its own closing copy rather than hiding it.

**Can a new user tell how to...**
- **Create a notebook?** Yes — `NewDocDialog` has three clearly-labeled mode cards (Canvas: "Infinite space for sketching and thinking"; Notebook: "A4 pages, ruled paper... Made for class"; Quick note: "Typing-first capture, phone-shaped") with a device-appropriate suggestion pre-highlighted.
- **Write?** Yes, pen is the default/obvious tool.
- **Organize?** Partially. Folders + tags exist and are functional, but there's no "recents" view and no favorites/pinning (confirmed absent — §5 in the org audit). A user with 50+ notes has folders and search only.
- **Export?** Yes, via toolbar icons, but the *range* of export (PNG/PDF/multi-page-A4-PDF/Markdown/plain text) is not discoverable — there's no menu grouping "Export" as a category, just five separate icon buttons in a long toolbar.
- **Use AI?** Discoverable via the tour's "convert" step and the sparkle Convert button, but the *breadth* of what the AI can do (8 actions total, 2 of which — Ask and Translate — are hidden inside the selection toolbar rather than the main Studio panel) is not obvious without hunting.

**Friction points identified:**
1. **No storage-usage indicator anywhere.** A user approaching the localStorage quota gets a silently-swallowed write failure (`documents.ts:124-130`, console.warn only) — this is a genuine risk of *silent data loss* with zero user-facing warning, and it's the single worst UX gap in the whole audit.
2. **Keyboard shortcuts are entirely undiscoverable** — real shortcuts exist (undo/redo, tool switching, delete, escape) but there is no shortcut legend/help panel anywhere in the UI (confirmed via grep — zero user-facing shortcut UI).
3. **No "jump to page N" and no drag-to-reorder pages** in notebook mode — for anyone building a 20+ page notebook, navigation is prev/next or scrolling a thumbnail rail only.
4. **The toolbar is doing too much.** Full variant carries pen/eraser/select/text/size/color/paper/undo/redo/clear/input-methods/convert/PNG/PDF/Markdown/text-export/music-mode/learning-mode/replay/find-replace/exam-lock/hide-chrome — that's over 20 distinct controls in one bar (mitigated by a minimal variant on mobile, but desktop/tablet full mode is dense).

---

## 3. Stylus Experience Audit

This is the strongest part of the product, and it's worth being specific about *why*, because generic "the pen doesn't feel native" complaints about web apps are usually not true here.

**Input pipeline** (`useDrawing.ts`): unified Pointer Events for mouse/touch/pen (not separate touch/mouse code paths, which is the right architecture). **Pressure** is read directly from `e.pressure` and drives real per-point stroke width via each pen profile's `widthFor()` curve — this is not faked or simulated from velocity. **Tilt** (`tiltX`/`tiltY`) is read and converted to an opacity multiplier (pencil-on-its-side shading effect), gated to `pointerType === 'pen'` only. **Coalesced events** are pulled via `getCoalescedEvents()` to capture every OS-level sample between animation frames — a real, non-obvious performance-correctness detail that most hobby canvas apps skip, and it matters a lot on 120Hz pens (Apple Pencil Pro, Wacom).

**Palm rejection**: time-window based (200ms after pen lift, touch is ignored) plus a hard rule that while a pen stroke is in flight, all touch input is completely inert — this correctly prevents a resting palm from hijacking the two-finger-pinch path. It is *not* shape/contact-area based (no touch-radius heuristics), which is what iPadOS/Apple Pencil-tuned apps do natively — so there could still be edge cases (e.g., a very deliberate two-finger palm placement while not actively drawing) that this temporal-only approach doesn't catch. This is a real, if narrow, gap versus GoodNotes/Notability on iPad.

**Rendering feel**: strokes are drawn as **quadratic Béziers through per-segment midpoints** (a lightweight Catmull-Rom approximation), with a *separate*, optional capture-time stabilizer (exponential pull toward the previous smoothed point, off by default). This two-stage approach — jitter damping at capture, curve smoothing at render — is the correct architecture and is genuinely close to what native apps do. Six pen profiles (fountain/ballpoint/brush/highlighter/pencil/neon) each have distinct pressure-response curves and opacity, not just different colors/widths.

**Does it feel like paper, glass, or a browser app?** Based on the architecture: closer to "glass with real pressure feedback" than "generic browser canvas." It will not feel identical to PencilKit on iPad (no OS-level pen prediction/latency compensation, which Apple's stack does at the OS level and a web canvas fundamentally cannot access) — but the fundamentals (pressure, tilt-as-shading, coalesced sampling, Bézier smoothing, optional stabilizer) are all present and correctly wired, which most competitors in the "web-based drawing app" category do not bother to get right.

**What's missing:**
- **No shape tool** — confirmed absent from the `Tool` type entirely (`pen | eraser | text | select`). Concepts, Notability, and OneNote all have at least basic shape recognition/snapping.
- **No true Apple Pencil / Surface Pen "hover" preview** (the cursor-before-touch preview some styli support via `pointerrawupdate`/hover events) — not found in the pointer handling.
- **Eraser is whole-stroke, not partial** — contact deletes the entire stroke, not just the touched segment. GoodNotes/Notability both support "precision erase" (partial stroke erasing) as standard.
- Bluetooth stylus support (`useBluetoothStylus.ts`) is real but narrow: it identifies pen brand by device name and shows battery level — it does **not** feed anything back into the drawing pipeline (confirmed: pressure/tilt still come exclusively from Pointer Events, Bluetooth is a side-channel for identity/battery UI only).

**Stylus Experience Score: 7/10** — the core pipeline is unusually well-built for a web app and this deserves to be said plainly; it loses points to missing partial-erase, missing shape tools, and the inherent latency ceiling of a browser canvas vs. native OS pen stacks.

---

## 4. Canvas Engine Audit

**Zoom/pan**: Canvas mode 0.1–8x, Notebook/Mobile 0.5–4x (`modes.ts:62,73,84`) — sensible per-mode ranges (infinite canvas needs deep zoom-out, paginated modes don't). Notebook pan is vertical-only and horizontally glued/centered, correctly modeling "scrolling a physical page" rather than free 2D drift.

**Selection**: free-form lasso select works and is tested. Move/translate of a selection works, committed as one undo step. **Duplicate** and **bulk recolor** of a selection work.

**What's missing — and this is a real gap**: **no resize or rotate of a selection.** `SelectionToolbar.tsx` draws decorative corner handles on the selection rectangle, but there is zero hit-testing or drag logic wired to them (confirmed via grep — zero matches for rotate/resize logic in `geometry.ts` or the selection toolbar). This means once you've drawn something, you can move it or delete it, but you cannot scale a sketch up, shrink a diagram, or rotate a shape — a basic, expected capability in Concepts, Procreate, and even Apple Notes' selection tool. This is arguably a bigger practical gap than the missing shape tool.

**Performance/culling**: legitimately well-engineered. Viewport culling via a `WeakMap`-cached per-stroke bounding box, checked against a world-space visible rect before any draw call — strokes outside are skipped entirely, and the cache auto-frees on stroke deletion (WeakMap semantics) with no manual invalidation bugs possible. There's a real test (`render.cull.test.ts`) proving a 5,000-stroke mostly-offscreen document issues <10% of the draw calls of an unculled render, and that panning cost stays roughly flat as document size grows 4x. **This is not a spatial index** (no quadtree/R-tree) — it's a linear scan with cached AABB checks — which is fine at "one notebook page's worth of ink" scale but would degrade on a genuinely huge single infinite-canvas document (tens of thousands of strokes in view simultaneously). Given Canvas mode is explicitly infinite and single-array (not paginated like Notebook mode), this is the one place culling architecture could eventually become a real bottleneck — worth flagging even though current tests show it holds up fine at 20k strokes.

**Undo/redo**: whole-array snapshots (not diffs), capped at 200 steps, with an explicit code comment flagging the real risk: up to 32 full page histories can be held in memory at once during notebook page-flip caching, and an unbounded stack would be O(n²) in a long session. The cap addresses this, but 32 concurrent full histories is still a meaningful memory ceiling on lower-end devices — worth monitoring, not urgent.

**Canvas Engine Score: 7/10** — culling and undo are genuinely well-thought-through with tests to back the claims; missing resize/rotate is a real functional gap that undercuts "powerful workspace" positioning.

---

## 5. Notebook System Audit

**Actual structure**: Folder (nestable to unbounded depth) → Document → Pages (Notebook mode only, flat list, no sections). This is **not** a notebook→section→page hierarchy like OneNote — it's closer to a flat, foldered file system with one level of page-pagination inside notebook-mode documents specifically.

**Search**: real and works — full-text search across document titles, tags, and **recognized/typed text content** (not raw ink strokes, since ink has no text representation until OCR'd or typed). It's an on-demand linear scan, explicitly commented as "fine at local-notes volume, revisit with a real index if this becomes visibly slow" — a reasonable, honest engineering tradeoff for the current scale, but a real problem at high note counts (§ below).

**Organization primitives present**: folders (nestable), tags (free-form, searchable). **Absent**: favorites/starring/pinning, and any dedicated "recent documents" view (the only recency signal is folder-sort-by-updatedAt and mode-switching reopening the last-touched doc in that mode — no actual Recents UI surface).

**Templates**: 14 bundled templates across 6 categories (paper/planner/tracker/finance/list/cover), manifest-driven, applicable at doc-cover, doc-default-page, or per-page level. **No user-created/custom template capability** — you cannot upload your own template or save a page as a reusable template. This is a real gap versus GoodNotes' custom-template ecosystem, which many power users (especially planners/bullet-journal users) consider essential.

**Can users manage 10 / 1,000 / 10,000 notes?**
- **10 notes**: no problem, folders + search comfortably handle this.
- **1,000 notes**: search remains correct but starts to strain — it's a linear scan across every document's title/tags/full recognized-text content on every keystroke (debounced via `useMemo`, but still O(n) per query). Likely still usable, but noticeably not instant.
- **10,000 notes**: this breaks down in two independent ways simultaneously — (1) search becomes a real linear-scan bottleneck across potentially megabytes of recognized text, and (2) **localStorage itself will simply run out of space** long before reaching 10,000 real notebooks with any meaningful ink content, given the ~5–10MB browser-origin quota (see §11). The "10,000 notes" scenario is not a search-algorithm problem for this app — it's a storage-architecture ceiling that will be hit first.

**Notebook System Score: 5/10** — organization is functional and honestly engineered for today's scale, but has no favorites/recents, no custom templates, and a storage/search architecture that will not survive the "power user with years of notes" scenario without a real backend.

---

## 6. UI/UX Design Audit

**Visual design**: uses a verified, consistent dark-mode design token system (Tailwind config: `bg`/`bg-subtle`/`bg-muted`/`border`/`border-strong`/`ink-{900,800,700,400}`/`brand-{50-800}`/`danger`), explicitly noted in the codebase as matched to a sibling product's palette for brand consistency. This session's work also closed real WCAG AA contrast failures (danger text and white-on-brand-500 CTAs were both under the 4.5:1 minimum) and wired up dormant 44px touch-target infrastructure that existed but wasn't activated. Typography and spacing follow a coherent scale (11px–15px range for UI chrome, consistent border-radius tokens: `md`/`lg`/`panel`).

**Component quality**: genuinely high for a solo/small-team project — popover-based color/paper pickers instead of permanently-inline swatches (frees toolbar width), a floating contextual selection toolbar, backdrop-blur pill chrome consistent across toolbar/PageNav/mode-tabs. This is not "browser prototype" territory; the visual craft is closer to a considered design system than a hobby project.

**Where it reads as "browser app" rather than "premium native app":**
- **Toolbar density on desktop/tablet** — 20+ controls in one horizontal bar is a web-app pattern; native apps (GoodNotes, Notability) use nested/contextual toolbars that show fewer options at once.
- **No native-feeling contextual menus** (right-click / long-press menus) found — interactions are exclusively toolbar-button and popover driven, which is more "web app" than "OS-native app" in feel.
- **Keyboard shortcuts exist but are entirely invisible** — a premium product surfaces its power-user affordances; this one hides them completely.

**UI/UX Design Score: 7/10** for visual craft and consistency; the interaction model (toolbar-and-popover only, no contextual menus, hidden shortcuts) is the main thing separating it from "feels like an Apple-quality native app."

---

## 7. Toolbar and Writing Tool Audit

Tools present: pen (6 sub-types: fountain/ballpoint/brush/highlighter/pencil/neon), eraser (whole-stroke only), text, select/lasso. **No shape tool.** Size picker (3 presets), color picker (8 presets + custom hex + HSB wheel + EyeDropper in Canvas mode, closed 4-color palette in Notebook mode for classroom use), paper/template picker.

**Tool switching**: fast, single-tap, no sub-menu drilling for the common case (pen/eraser/select/text are always one tap away). Pen *type* switching (fountain vs. brush etc.) requires opening the pen-type popover — an extra step versus, say, a favorites row.

**Customization**: color and paper choices persist per editing-prefs (sticky across sessions). **No favorite/pinned-tools row**, **no recent-colors-used strip beyond the fixed 8-swatch preset grid**, **no per-notebook default tool memory** beyond the mode-level default (`defaultTool` in `ModeConfig`).

**Recommendations**: add a shape tool (even basic rect/circle/line/arrow with optional snap would close a real competitive gap against Concepts/OneNote); add partial-stroke erasing; consider a "favorites" row of the last-3-used pen types for faster switching without opening the popover.

---

## 8. AI Features Audit

**What exists today** (all confirmed, real, backend-connected — not mocked):
- **OCR**: Tesseract.js, WASM, lazy-loaded on first use (not bundled at startup — good perf hygiene).
- **AI refinement** (`lib/ai.ts` → `/api/refine` → Claude via Vercel AI Gateway): 8 actions — Polish, Fix grammar, Summarize, To-do list, Formal, Casual, Ask (free-form Q&A), Translate. 20-second hard timeout, real error surfacing (no silent mock fallback).

**Opportunities ranked by impact vs. difficulty** (1–10 scale, my estimate given the existing architecture):

| Feature | Impact | Difficulty | Rationale |
|---|---|---|---|
| Surface "Ask"/"Translate" in the main Studio panel, not just selection toolbar | 6 | 2 | Already built server-side; pure UI discoverability fix |
| Handwriting search (search raw ink via OCR index, not just typed text) | 8 | 6 | Currently search only covers typed/converted text; OCR-indexing ink at write-time (background job) would be a real differentiator vs. GoodNotes' search |
| AI auto-organization (suggest folder/tags from content) | 6 | 4 | Backend refine pipeline already exists; this is a new prompt + a UI moment (e.g. on save) |
| Sketch-to-diagram cleanup (redraw rough shapes as clean vector shapes) | 7 | 8 | Requires vision-capable model call + a shape-tool foundation that doesn't exist yet (§3, §4) — blocked on shape tool work first |
| AI flashcard generation from notes | 5 | 3 | Same refine-pipeline pattern as existing actions, new action type |
| AI-generated page/section summaries surfaced in the notebook list | 7 | 4 | High retrieval value for "10,000 notes" scale users; needs a persisted summary field + background trigger |
| Voice-to-text note capture | 5 | 5 | Net-new capability, Web Speech API or a transcription endpoint |

**The single highest-leverage AI move**: make **handwriting search** (not just typed-text search) real. Today, if you write "meeting notes" in ink and never run OCR/convert on it, it is **invisible to search** — confirmed in the codebase, search only scans `TextItem.text`, never raw strokes. This directly undercuts the "your notes talk back" positioning this audit recommends leaning into (§1) — the AI wedge is undermined if the search bar can't find your handwritten content at all.

---

## 9. PDF and Document Annotation Audit

**Export is genuinely strong**: PNG, single-page PDF, true-multi-page-A4-PDF (world-coordinate-accurate, 1:1 mapping so ink lands exactly where it sat on the page), Markdown (text boxes only, bold/italic preserved), plain text. All bypass viewport culling to guarantee complete output. This is more export format variety than most competitors offer out of the box.

**What's completely absent**: **PDF import.** There is no PDF-parsing library, no PDF-annotation-overlay capability, nothing. Confirmed via search — zero `pdf.js` or equivalent import. This means Stylus cannot do the single most common "digital notebook" workflow after "write on blank paper": **import a lecture slide deck / research paper / contract and annotate on top of it.** GoodNotes, Notability, and LiquidText all built their core value proposition around exactly this. This is arguably the largest single feature gap in the entire audit relative to the stated competitive set — bigger than sync, arguably, because it's a hard blocker for the "researcher" and "professional" segments the product claims to target (§1).

**Also absent**: signatures, comment/markup layers distinct from ink, any concept of "import a document as a background layer."

---

## 10. Performance Audit

**Rendering**: two-canvas architecture (static committed layer + overlay live-stroke layer), both rAF-coalesced so multiple triggers per frame collapse into one paint — correct, standard-practice architecture. Coalesced pointer-event sampling captures every OS sample between frames rather than dropping intermediate points, which matters for smooth high-refresh-rate pen input.

**Culling**: proven via test to keep per-frame draw-call count roughly flat as document size grows (5k→20k strokes, <2.5x cost growth for 4x strokes), with a documented 25ms/frame budget target at 20k strokes averaged over 30 frames. Paper guides (procedural grid/ruled/dots/isometric — isometric alone is ~670 segments) are rendered once to a cached offscreen bitmap rather than re-stroked every frame.

**Bottlenecks identified**:
1. **No spatial index for culling** — linear scan with cached AABB checks holds up at tested scale (20k strokes) but has no architectural ceiling protection for a genuinely enormous single infinite-canvas document.
2. **localStorage read/write on every save is synchronous and can block** — no explicit async/IndexedDB migration path for the core stroke data (only image blobs went to IndexedDB, specifically because they'd blow the localStorage quota — the same quota pressure applies to a heavily-inked document's own stroke JSON).
3. **Undo history**: up to 32 full page histories cached simultaneously during notebook page-flip — a real memory ceiling on low-end devices with large notebooks, capped but not eliminated.

**Mobile performance**: this session's work added touch-target/contrast fixes but did not change the rendering architecture — the same rAF/culling pipeline serves mobile, which should perform comparably to desktop for equivalent stroke counts, modulo mobile GPU/CPU headroom.

**Offline capability**: genuinely solid — service worker precaches the full app shell + fonts + all 14 template webp assets (~2.3MB precache) so the app is fully offline-usable including templates on first-ever offline load (not just "app loads, but images are broken").

---

## 11. Technical Architecture Audit

**Framework**: React 18 + TypeScript + Vite, Tailwind for styling. No state-management library (React state/context, hooks) — appropriate for the current scope, would need reconsideration if the data model grows (e.g., real-time collab state).

**Canvas**: plain 2D Canvas API, no WebGL/OffscreenCanvas. This is a real architectural ceiling for extreme scale (Procreate/Figma-tier documents with 100k+ objects), but is not a near-term problem given current culling headroom and target use case (handwritten notebooks, not massive design files).

**Storage/data model**: **localStorage exclusively for all structured data** (docs, strokes, folders, tags), **IndexedDB only for image blobs** (added specifically because images would exceed the localStorage quota — the same pressure will eventually hit heavily-inked text-heavy documents too, just later). No backend, no database, no auth, no sync — confirmed exhaustively (zero collab/sync/socket code found anywhere in the codebase).

**Could this support 10 users? 10,000? 10 million?**
- **10 users**: yes, trivially — it's client-only, there's no server to scale.
- **10,000 users**: yes, from an infrastructure standpoint (static hosting, no backend load) — but this framing is slightly misleading, because "10,000 users" isn't the actual constraint. Each user's *own* data is capped by their browser's localStorage quota regardless of how many other users exist. The product could have 10 million installs and each individual user would still hit the same ~5-10MB-per-origin wall on their own device once their notes accumulate.
- **10 million users**: same answer — infrastructure scales trivially (it's a static PWA), but **the product has no accounts, no backend, and no sync, so "10 million users" would mean 10 million completely isolated, unsynced, quota-capped local databases**. This is the architecture question that matters most: the current design is not "not yet scaled," it's **architecturally incompatible with being anyone's primary, durable, cross-device notebook** until a real backend + accounts + sync layer is built. Everything else in this audit (search quality, organization, AI features) is downstream of this decision.

---

## 12. Mobile and Tablet Experience Audit

This session's own work is directly relevant here, so I'll be specific about what changed and what remains.

**What's solid**: unified Pointer Events handling means touch/pen/mouse all go through one correct code path (no separate degraded touch-only mode). `useVisualViewport` correctly compensates for the iOS on-screen-keyboard-shrinks-100vh problem via a `--vvh` CSS variable rather than the common broken `100vh` approach. Portrait-only enforcement for Mobile mode is gated correctly (coarse-pointer + narrow-viewport check, not a blanket "any landscape" rule that would wrongly nag desktop users). Palm rejection (§3) works correctly for tablet use with a stylus.

**What this session fixed**: 44px touch targets were architecturally present (`LargeTargetsContext`) but dead-wired to an unused toolbar-position config — now actually active on the mobile tray. WCAG AA contrast failures on CTA buttons and error text. Mobile-appropriate `inputMode`/`type`/`enterKeyHint` on text inputs. Edge-zone swipe-to-navigate pages (touch-only, deliberately excludes pen after a regression review caught a pen-vs-swipe conflict). Per-thumbnail skeleton loading in the template gallery. Offline-status reassurance badge.

**What's still missing for tablet specifically**: no Apple Pencil hover-preview support (not accessible from a web canvas without OS-level integration, so this is more "known ceiling" than "gap to fix"). No orientation-aware toolbar reflow beyond the portrait-lock in Mobile mode — Canvas/Notebook modes on a rotated tablet get the same toolbar regardless of orientation.

**Desktop**: mouse interaction works (pressure defaults to 0.5, sensible), keyboard shortcuts exist but are hidden (§2). No dedicated "desktop power user" affordances beyond the existing full-toolbar variant.

**Score for this category specifically: 7/10** — genuinely above-average technical foundation for a web app, with this session's fixes closing real, concrete gaps; the remaining gap is more "native-app polish ceiling" than "unaddressed bugs."

---

## 13. Accessibility Audit

**What's implemented**: pervasive `aria-label`s on icon-only buttons (confirmed across Toolbar/PageNav/FindReplacePanel/Sidebar), `aria-pressed`/`aria-expanded`/`aria-current` used correctly on toggle/expandable/current-item controls, `role="dialog" aria-modal="true"` on modals, `aria-live="polite"` on the toast system and the new offline badge. This session closed real WCAG AA contrast failures (two genuine violations found and fixed, not cosmetic).

**Gaps**: no visible focus-trap utility found for modals (Escape-to-close exists everywhere, but keyboard focus containment inside open dialogs wasn't confirmed present). No font-scaling/text-size user preference found. No explicit screen-reader-only live-region announcements for canvas-specific state changes (e.g., "stroke undone," "page 3 of 12" beyond the visual PageNav counter). Motor accessibility for the *drawing surface itself* is inherently limited by the medium (a canvas is fundamentally a fine-motor-input surface) — no alternate-input drawing mode (e.g., click-to-place-points) was found as a fallback.

**Accessibility Score: 5/10** — solid baseline ARIA/contrast hygiene, but no dedicated accessibility feature work (focus trapping, font scaling, reduced-motion preference) beyond what naturally falls out of using semantic HTML and this session's contrast/touch-target pass.

---

## 14. Monetization and Business Model Audit

Given the current architecture (no accounts, no backend, no sync), monetization is genuinely constrained until that foundation exists — you cannot sell a "Pro" tier gated on cloud sync if there is no cloud. Recommended sequencing:

- **Free tier (today's product)**: local-only, full drawing/OCR/export, capped AI refinement calls (e.g., N/month) as the natural metering point given the existing `/api/refine` backend already has to pay per-call to the model provider.
- **Pro subscription** (requires backend work first): unlocked once sync exists — cross-device access, unlimited AI refinement, custom templates, PDF import/annotation.
- **Education plans**: the closed 4-color notebook palette and exam-lock feature (confirmed in `modes.ts`/`Toolbar.tsx` — pen+undo-only restricted toolbar) show the codebase already has classroom-specific design thinking; a school/institution tier bundling exam-lock + bulk device management is a natural extension of existing code, not new architecture.
- **AI credits**: given `/api/refine` already meters per-call to a real LLM provider, a credits model (rather than flat unlimited) is the technically honest choice — the cost is real and per-use.
- **Templates marketplace**: blocked on building custom-template creation/upload first (§5) — currently there's nothing for creators to sell.

**What users would actually pay for, ranked**: (1) cross-device sync — the single highest-value unlock once built; (2) PDF import/annotation — unlocks the researcher/professional segment entirely; (3) unlimited AI refinement — direct extension of the existing wedge feature; (4) custom templates — smaller but real (planner/bullet-journal community).

---

## 15. Feature Gap Analysis

| Feature | Current State | Competitors | Priority | Difficulty |
|---|---|---|---|---|
| Cross-device sync | Absent (local-only, confirmed no backend) | All benchmarks have it | P0 | High |
| PDF import/annotation | Absent (export-only) | GoodNotes, Notability, LiquidText core feature | P0 | High |
| Storage-quota warning UI | Absent (silent console.warn on write failure) | N/A (competitors don't hit this ceiling, cloud-backed) | P0 | Low |
| Handwriting search (raw ink) | Absent (typed/OCR'd text only) | GoodNotes searches handwriting | P1 | Medium |
| Selection resize/rotate | Absent (decorative handles only, no logic) | Concepts, Procreate, Apple Notes | P1 | Medium |
| Shape tool | Absent from Tool type entirely | Concepts, OneNote, Notability | P1 | Medium |
| Partial-stroke erase | Absent (whole-stroke deletion only) | GoodNotes, Notability | P1 | Low-Medium |
| Discoverable keyboard shortcuts | Exist but zero UI surfacing | N/A, but expected of a "premium" desktop-capable tool | P1 | Low |
| Favorites/pinning + Recents view | Absent | Most competitors | P2 | Low |
| Custom/user templates | Absent (bundled-only) | GoodNotes | P2 | Medium |
| Drag-to-reorder / jump-to-page | Absent (prev/next + thumbnail-click only) | OneNote, GoodNotes | P2 | Low |
| Sketch-to-diagram AI cleanup | Absent | Novel — no benchmark has this well-executed | P2 (differentiator, not table-stakes) | High |

---

## 16. Final Product Scorecard

| Category | Score /10 |
|---|---|
| Product vision | 4 |
| UX | 6 |
| UI design | 7 |
| Stylus experience | 7 |
| Canvas engine | 7 |
| Performance | 7 |
| AI capabilities | 6 |
| Organization | 5 |
| Mobile experience | 7 |
| Competitive position | 3 |

**Overall read**: the *engineering* is consistently good-to-strong across almost every technical dimension checked in this audit (input handling, rendering, culling, undo, export, offline). The *product* is held back almost entirely by one architectural decision (no backend/accounts/sync) and one missing core workflow (PDF import/annotation) — both of which are strategy/scope decisions, not signs of weak execution. This is a well-built local notebook that is not yet a competitive cloud-native workspace product.

---

## Top 20 Improvements Required

Ranked by user impact × business impact × feasibility, most critical first.

**1. Storage-quota warning UI**
*Problem*: localStorage write failures are silently swallowed (console.warn only) — a user can lose new content with zero notification.
*Why it matters*: silent data loss is the single worst thing a notes app can do; it's a trust-destroying bug, not a missing feature.
*Recommended solution*: surface a toast (existing `toast.error()` infrastructure already available) on write failure, plus a proactive storage-usage indicator (e.g., in Sidebar profile area) once usage crosses ~80% of estimated quota.
*Expected impact*: prevents silent data loss; high trust impact.
*Implementation complexity*: Low — the toast system and storage read paths both already exist.

**2. Cross-device sync (accounts + backend)**
*Problem*: the product cannot be anyone's primary notebook if notes don't leave one browser.
*Why it matters*: this is the precondition for the Pro tier, the professional/researcher segments, and basic user trust that their work is safe.
*Recommended solution*: add auth (e.g., Clerk, per the skills available in this environment) + a real backend data store, with local-first sync (write locally first, sync in background) to preserve the current offline-first feel rather than regressing it.
*Expected impact*: unlocks nearly every other roadmap item and the entire paid tier.
*Implementation complexity*: High — genuinely the biggest single engineering investment in this list.

**3. PDF import + annotation**
*Problem*: cannot annotate an existing document — the single most common "digital notebook" use case after blank-page writing.
*Why it matters*: hard-blocks the researcher/professional/student-with-readings segments entirely.
*Recommended solution*: integrate `pdf.js` for rendering, treat each PDF page as a background layer under a notebook page (the codebase already supports per-page background templates architecturally — this is a natural extension of that pattern, not a new concept).
*Expected impact*: closes the largest single competitive gap identified in this audit.
*Implementation complexity*: High.

**4. Handwriting search (index raw ink, not just typed text)**
*Problem*: search is blind to anything you wrote in ink and never converted/typed.
*Why it matters*: undermines the "AI-native notebook" positioning — the search bar should find everything you wrote.
*Recommended solution*: background OCR indexing on save (already have Tesseract.js wired), store recognized text alongside strokes for search purposes without requiring the user to manually run Convert.
*Expected impact*: makes the existing OCR investment pay off across the whole product, not just the Studio panel.
*Implementation complexity*: Medium.

**5. Selection resize + rotate**
*Problem*: selected ink can be moved and deleted, but not scaled or rotated — decorative handles exist with no logic behind them.
*Why it matters*: basic expected capability once you've drawn something; currently the biggest functional canvas gap.
*Recommended solution*: wire the existing (currently decorative) corner handles to actual scale/rotate transforms on the selected stroke set.
*Expected impact*: closes a fundamental "editing" gap in the canvas engine.
*Implementation complexity*: Medium.

**6. Shape tool**
*Problem*: no shape primitive exists in the tool model at all.
*Why it matters*: diagrams/sketches/annotations regularly need clean rectangles, circles, lines, arrows.
*Recommended solution*: add a `shape` tool with basic snap-to-angle rectangle/ellipse/line/arrow, stored as a distinct primitive (or a constrained stroke) so it composes with existing selection/export.
*Expected impact*: closes a competitive gap vs. Concepts/OneNote/Notability.
*Implementation complexity*: Medium.

**7. Partial-stroke (precision) erase**
*Problem*: eraser deletes whole strokes on contact, never a segment.
*Why it matters*: standard, expected behavior in every serious competitor; whole-stroke erase feels crude by comparison.
*Recommended solution*: split a stroke into two at the eraser contact point(s) rather than deleting the entire object.
*Expected impact*: meaningful feel upgrade for a core daily interaction.
*Implementation complexity*: Low-Medium.

**8. Surface Ask/Translate in the main Studio panel**
*Problem*: two of eight AI actions are hidden in the selection toolbar only.
*Why it matters*: cheap, high-leverage discoverability fix for the product's actual differentiator.
*Recommended solution*: add both as chips in `StudioPanel.tsx`'s `REFINE_ACTIONS` alongside the existing six.
*Expected impact*: makes the AI wedge feel more complete with near-zero engineering cost.
*Implementation complexity*: Low.

**9. Discoverable keyboard shortcuts**
*Problem*: real shortcuts exist but are entirely invisible to users.
*Why it matters*: cheap trust/polish signal that the product is "premium," not a prototype; helps power users adopt faster.
*Recommended solution*: a `?`-triggered or menu-accessible shortcut legend; tooltips on toolbar buttons showing their shortcut.
*Expected impact*: low cost, real "feels considered" polish gain.
*Implementation complexity*: Low.

**10. Favorites/pinning + a Recents view**
*Problem*: no way to pin important notes or see a dedicated recent-activity list.
*Why it matters*: standard organizational primitive missing from an otherwise solid folder+tag+search system.
*Recommended solution*: add a `pinned: boolean` (or `pinnedAt`) field to `DocMeta`, surface a Sidebar "Pinned" and "Recent" section above the folder tree.
*Expected impact*: meaningfully improves navigation at 100+ note scale, cheap to build.
*Implementation complexity*: Low.

**11. Custom/user-created templates**
*Problem*: only the 14 bundled templates are usable; no way to upload or save-as-template.
*Why it matters*: real gap for planner/bullet-journal power users, and a precondition for a templates marketplace revenue line.
*Recommended solution*: "Save this page as a template" action storing a user-scoped template alongside the bundled manifest.
*Expected impact*: closes a specific, named competitive gap and unlocks a monetization line.
*Implementation complexity*: Medium.

**12. Drag-to-reorder pages + jump-to-page**
*Problem*: notebook pages can only be navigated prev/next or via thumbnail-click; no reorder, no numeric jump.
*Why it matters*: friction grows linearly with notebook length; a 40-page notebook is meaningfully harder to navigate today than in any competitor.
*Recommended solution*: drag-and-drop in the thumbnail rail (reindex on drop), plus a numeric input in the page-count pill.
*Expected impact*: real quality-of-life fix for long notebooks.
*Implementation complexity*: Low-Medium.

**13. AI auto-organization suggestions**
*Problem*: no AI-assisted tagging/foldering — organization is 100% manual today.
*Why it matters*: extends the existing AI wedge into the organization pain point directly (§5's biggest weakness).
*Recommended solution*: on save (or on-demand), suggest tags/folder based on recognized content via the existing refine pipeline.
*Expected impact*: differentiates organization, not just writing/export.
*Implementation complexity*: Medium.

**14. AI page/section summaries in the notebook list**
*Problem*: no way to see "what's in this notebook" without opening it.
*Why it matters*: high retrieval value at scale — directly addresses the "10,000 notes" scalability weakness identified in §5.
*Recommended solution*: generate and cache a one-line AI summary per document, surfaced in Sidebar list rows.
*Expected impact*: meaningful scale/retrieval improvement, reinforces AI positioning.
*Implementation complexity*: Medium.

**15. Contextual right-click/long-press menus**
*Problem*: all interaction is toolbar-and-popover; no native-feeling contextual menus.
*Why it matters*: one of the specific things separating "feels like a premium native app" from "feels like a web app," per §6.
*Recommended solution*: add a contextual menu on right-click (desktop) / long-press (touch) for common per-object actions (delete, duplicate, recolor) as a faster path than the floating selection toolbar.
*Expected impact*: interaction-model polish, meaningful "feel" upgrade.
*Implementation complexity*: Medium.

**16. Toolbar decluttering (contextual/nested grouping)**
*Problem*: 20+ controls in one bar on desktop/tablet full mode.
*Why it matters*: density undercuts the "premium, considered" feel this audit otherwise credits the product with.
*Recommended solution*: group export formats behind one "Export" menu, and consider a secondary/overflow row for less-frequent actions (music mode, learning mode, replay) rather than flat inline.
*Expected impact*: cleaner first impression, reduces cognitive load.
*Implementation complexity*: Medium (UI restructuring, not new capability).

**17. Voice-to-text note capture**
*Problem*: no audio-input capture path exists.
*Why it matters*: net-new capture modality competitors are increasingly adding (Notability has long had audio-linked notes).
*Recommended solution*: Web Speech API or a transcription endpoint alongside the existing text/OCR pipeline.
*Expected impact*: net-new capability, moderate differentiation.
*Implementation complexity*: Medium.

**18. Sketch-to-diagram AI cleanup**
*Problem*: no way to have AI clean up a rough hand-drawn shape into a crisp vector.
*Why it matters*: none of the named competitors do this well today — genuine differentiation opportunity, not table-stakes catch-up.
*Recommended solution*: vision-capable model call on a selected region, output mapped to the new shape-tool primitives (item 6) — explicitly sequenced *after* the shape tool exists.
*Expected impact*: potentially the single most differentiating feature on this list if executed well — but genuinely hard and worth treating as a bet, not a commitment.
*Implementation complexity*: High.

**19. Focus-trap + reduced-motion + font-scaling accessibility pass**
*Problem*: baseline ARIA/contrast is solid, but modal focus containment, reduced-motion preference, and font-scaling weren't confirmed present.
*Why it matters*: closes real accessibility gaps beyond what naturally fell out of this session's contrast/touch-target work.
*Recommended solution*: add a focus-trap utility for `Dialog.tsx`/`TemplateGallery.tsx` modals, respect `prefers-reduced-motion`, and support OS-level text-scaling without layout breakage.
*Expected impact*: meaningful for motor/vision-impaired users currently underserved.
*Implementation complexity*: Medium.

**20. Education/institution tier packaging**
*Problem*: classroom-specific features (exam-lock, closed palette) exist in code but aren't packaged as a distinct offering.
*Why it matters*: the codebase already did the hard part (exam-lock, restricted toolbar, closed 4-color palette) — this is a packaging/business-model gap, not an engineering one.
*Recommended solution*: bundle existing exam-lock/notebook-mode features into a named "Classroom" tier with basic device/roster management once accounts exist (sequenced after item 2).
*Expected impact*: opens the education segment with minimal new engineering.
*Implementation complexity*: Low (once accounts exist).

---

## 90-Day Product Roadmap

### Phase 1 (Days 1–30) — Critical fixes
Focus: close the "this could silently break on me" risks and the cheapest highest-leverage wins.
- Storage-quota warning UI (#1)
- Surface Ask/Translate in the Studio panel (#8)
- Discoverable keyboard shortcuts (#9)
- Favorites/pinning + Recents view (#10)
- Drag-to-reorder pages + jump-to-page (#12)
- Begin architecture/spike work for accounts + backend (design only, not shipped — this unblocks Phase 2/3)

### Phase 2 (Days 31–60) — Competitive features
Focus: close the gaps that block entire user segments from choosing this product at all.
- Cross-device sync — ship an MVP (auth + basic sync, even if not fully real-time/conflict-resolved yet) (#2)
- PDF import + annotation MVP (#3)
- Selection resize + rotate (#5)
- Shape tool (#6)
- Partial-stroke erase (#7)

### Phase 3 (Days 61–90) — Differentiation features
Focus: build the things competitors don't have, on top of the now-solid foundation.
- Handwriting search (index raw ink) (#4)
- AI auto-organization suggestions (#13)
- AI page/section summaries in the notebook list (#14)
- Custom/user templates (#11) + begin templates-marketplace groundwork
- Sketch-to-diagram AI cleanup — first prototype/bet, not a full ship (#18)

---

## Final Question

**"If this product wanted to become the world's best AI-native stylus notebook platform, what would it need to build that competitors do not currently have?"**

Every competitor in the benchmark set (GoodNotes, Notability, Apple Notes, OneNote, Concepts, Nebo, LiquidText) treats AI as a bolt-on feature added to an already-mature notebook product. None of them were built AI-first, and it shows: their AI features (where they exist at all) live in a separate menu, operate on a static snapshot of your notes, and don't shape the core writing/organization loop.

Stylus's actual advantage, if it commits to it, is that it can build the **opposite** architecture from day one, because it's small enough to still choose:

1. **Search that understands ink, not just text** — today's gap (§8, §15 item #4) is the seed of this: if handwriting is OCR-indexed continuously in the background (not on manual conversion), the notebook becomes queryable the way no competitor's is. "Find every page where I wrote about the Henderson project" should work whether you typed it or scrawled it in cursive.

2. **AI that organizes *as you write*, not after.** Auto-tagging, auto-foldering, and auto-summarization (§15 items #13, #14) running continuously in the background — turning the notebook from "a pile you have to search" into "a system that already knows what's in it" — is something none of the benchmark products do natively, because their information architectures (rigid notebook→section→page trees) predate AI and weren't designed for it. Stylus's flatter, tag+folder+search model is actually a *better* substrate for this than OneNote's rigid hierarchy.

3. **Sketch understanding, not just handwriting recognition.** OCR-to-text is table stakes (Nebo already does this well). The genuinely open ground is a model that understands a rough diagram or flowchart sketch and can clean it up, extract its structure (nodes/edges), or answer questions about it — turning the "convert" action from "handwriting → text" into "any mark → structured, queryable knowledge." This directly requires the shape-tool foundation (§15 item #6) to exist first, so it's correctly sequenced in Phase 3, but it's the feature that would make this genuinely unlike anything currently on the market rather than "GoodNotes with a chatbot bolted on."

The honest sequencing constraint is that none of this matters if the underlying data doesn't sync (§15 item #2) — an AI-native notebook that lives and dies on one browser tab is a demo, not a platform. Sync is the unglamorous precondition; the three points above are the actual differentiation once it exists.
