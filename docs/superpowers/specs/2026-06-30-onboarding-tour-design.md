# Onboarding Product Tour — Design

**Date:** 2026-06-30
**Status:** Approved for planning

## Overview

A first-run product tour that welcomes new users with a centered card, walks
them through ~5 spotlight steps over the real toolbar features (dim + cutout +
glowing ring + tooltip card with Back / Next / Skip), and ends on a centered
finish card with a brand-colored confetti burst. Auto-runs once (localStorage
gated); replayable anytime from a "Take the tour" row in the sidebar.

Layered over the app like the existing overlays (Kandinsky, Night Mode); it
touches existing UI only to add `data-tour` hooks.

## Components

- **`src/lib/tourSteps.ts`** — ordered step data (pure). Each step:
  `{ id; target?: string; title; body; placement?: 'top'|'bottom'|'left'|'right' }`.
  `target` omitted → a centered card. Steps:
  1. welcome (centered) — "Welcome to Stylus" + Start / Skip
  2. `pen` — draw with pen/finger/stylus; pen-type popover
  3. `select` — lasso to select, then Convert / Ask Stylus / Translate
  4. `convert` — turn handwriting into text / ask AI (the ✨ Convert button)
  5. `menu` — documents, Night Mode, and replay live in the sidebar
  6. finish (centered) — "You're all set!" + Done, with confetti

- **`src/hooks/useTour.ts`** — state machine: `active`, `stepIndex`,
  `start()`, `next()`, `back()`, `skip()`, `finish()`. Owns the first-run check
  and persistence (localStorage key `stylus.tour.v1`; presence = seen).
  `skip()` and `finish()` both mark seen and close.

- **`src/components/Tour.tsx`** — renderer:
  - **Spotlight overlay:** four dim rectangles around the target's bounding rect
    (leaves the target bright) + a glowing ring on the target. Recomputed on
    resize/scroll.
  - **Tooltip card:** title, body, step dots (e.g. "2 / 5"), Back (hidden on the
    first spotlight step), Next, and a Skip affordance. Positioned by the step's
    `placement` relative to the target, clamped on-screen.
  - **Centered cards:** welcome and finish, rendered centered with a dim
    backdrop (no cutout).
  - **Confetti:** fired once when the finish card appears.

- **`src/lib/confetti.ts`** — dependency-free burst: spawns ~80 absolutely
  positioned brand-colored particles with randomized velocity/rotation,
  animated via rAF, auto-removed after ~1.5s. Brand palette: `#e76f2c`,
  `#fa9f70`, `#ffe3d0`, `#fdc4a0`.

## Targeting

Each spotlight target carries a `data-tour="<id>"` attribute. The tour looks up
`[data-tour="id"]` and, because the toolbar renders twice (desktop pill +
mobile tray), picks the **visible** element (non-zero `getBoundingClientRect`).
If a target isn't found/visible (e.g. narrow viewport hides it), that step is
**skipped automatically** so the tour never points at nothing.

`data-tour` hooks to add (4): the Pen button (`pen`), Select button (`select`),
Convert button (`convert`), and the sidebar opener (`menu`).

## Wiring

- `App` mounts `<Tour>` as a sibling to the Sidebar / Night-Mode overlay and
  calls the tour's first-run trigger on mount (start only if unseen).
- A **"Take the tour"** button row in the Sidebar calls `start()` (replays
  regardless of seen state) and closes the sidebar so the spotlight is visible.

## Data flow

```
App mount → useTour.maybeAutostart() → if unseen: active=true, stepIndex=0
Tour renders step[stepIndex]:
  - centered (no target) → centered card
  - has target → resolve visible [data-tour] → dim+ring+tooltip
                 (target missing → auto-advance past it)
Next/Back → stepIndex ±1 (clamped)
Skip / reaching past last → finish(): persist seen, active=false
                                       (finish step fires confetti first)
Sidebar "Take the tour" → start(): stepIndex=0, active=true
```

## Error handling / edge cases

- **No target found** → step auto-skips (never spotlights empty space).
- **Resize / orientation change** → spotlight + card reposition via a resize
  listener; recompute the target rect each render.
- **localStorage unavailable** (private mode) → tour still runs in-session;
  "seen" just isn't persisted (best-effort, matches `profile.ts`).
- **Escape key** closes the tour (treated as Skip).

## Testing

- **Unit (pure / logic):** `useTour` state machine (start/next/back/skip/finish,
  clamping, first-run gate read/write); `tourSteps` shape (centered vs targeted,
  ordering). Persistence mocked via localStorage.
- **Run-the-app:** spotlight positioning over real buttons, card placement,
  auto-skip of a hidden target, confetti on finish, sidebar replay.

## Out of scope (YAGNI)

- Multi-page / branching tours, per-feature contextual tips after onboarding,
  analytics, i18n of step copy, a confetti library.
