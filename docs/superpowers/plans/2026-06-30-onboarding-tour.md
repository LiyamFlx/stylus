# Onboarding Product Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-run, replayable product tour — centered welcome card → ~5 dim+cutout spotlight steps over real toolbar features (Back/Next/Skip) → centered finish card with a brand-colored confetti burst.

**Architecture:** Pure step data (`tourSteps.ts`) + a state-machine hook (`useTour.ts`, owns first-run gate + persistence) + a renderer (`Tour.tsx`, dim/ring/card/centered-cards) + a dependency-free confetti burst (`confetti.ts`). Mounted by `App`; targets located via `data-tour` attributes added to ~4 buttons; replay row in the Sidebar.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library, Tailwind. No new dependencies.

## Global Constraints

- localStorage key: `stylus.tour.v1` (presence = tour already seen). Best-effort like `profile.ts` (wrap in try/catch; private mode just doesn't persist).
- Brand confetti colors (verbatim): `#e76f2c`, `#fa9f70`, `#ffe3d0`, `#fdc4a0`.
- Toolbar renders twice (desktop pill + mobile tray); target lookup MUST pick the **visible** `[data-tour]` element (non-zero bounding rect). Missing/hidden target → that step auto-skips.
- Escape closes the tour (= Skip).
- Dark-theme styling: follow existing overlay conventions (`bg-bg-muted`, `shadow-pop`, `backdrop-blur-pill`, `text-ink-*`, `bg-brand-500`).
- Test command: `npm test`. Single file: `npx vitest run <path>`.

---

### Task 1: Tour step data

**Files:**
- Create: `src/lib/tourSteps.ts`
- Test: `src/lib/tourSteps.test.ts`

**Interfaces:**
- Produces:
  - `interface TourStep { id: string; target?: string; title: string; body: string; placement?: 'top' | 'bottom' | 'left' | 'right' }`
  - `const TOUR_STEPS: TourStep[]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/tourSteps.test.ts
import { describe, it, expect } from 'vitest';
import { TOUR_STEPS } from './tourSteps';

describe('TOUR_STEPS', () => {
  it('starts with a centered welcome and ends with a centered finish', () => {
    expect(TOUR_STEPS[0].target).toBeUndefined();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeUndefined();
  });

  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spotlight steps target the real data-tour hooks', () => {
    const targets = TOUR_STEPS.filter((s) => s.target).map((s) => s.target);
    expect(targets).toEqual(['pen', 'select', 'convert', 'menu']);
  });

  it('every step has non-empty title and body', () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tourSteps.test.ts`
Expected: FAIL — cannot find module `./tourSteps`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/tourSteps.ts

/** One tour step. `target` omitted → a centered card (welcome / finish). */
export interface TourStep {
  id: string;
  /** `data-tour` value to spotlight; omitted = centered card. */
  target?: string;
  title: string;
  body: string;
  /** Card placement relative to the target. Defaults to 'bottom'. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Stylus',
    body: 'Your universal digital notebook. Take a 30-second tour of the essentials?',
  },
  {
    id: 'pen',
    target: 'pen',
    title: 'Write and draw',
    body: 'Use the pen with your mouse, finger, or stylus. Tap the pen again to switch between fountain, ballpoint, brush, and highlighter.',
    placement: 'bottom',
  },
  {
    id: 'select',
    target: 'select',
    title: 'Select with the lasso',
    body: 'Circle some ink to select it. A floating toolbar pops up to recolor, duplicate, or run AI on just that selection.',
    placement: 'bottom',
  },
  {
    id: 'convert',
    target: 'convert',
    title: 'Handwriting → text, and Ask Stylus',
    body: 'Turn your handwriting into typed text, or ask Stylus to explain and answer — powered by AI.',
    placement: 'bottom',
  },
  {
    id: 'menu',
    target: 'menu',
    title: 'Documents & settings',
    body: 'Your notebooks, Night Mode, the stabilizer, and this tour all live in the menu.',
    placement: 'right',
  },
  {
    id: 'finish',
    title: "You're all set!",
    body: 'That’s the tour. Start writing — everything saves on this device automatically.',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tourSteps.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tourSteps.ts src/lib/tourSteps.test.ts
git commit -m "feat: onboarding tour step data

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 2: useTour state machine + first-run gate

**Files:**
- Create: `src/hooks/useTour.ts`
- Test: `src/hooks/useTour.test.ts`

**Interfaces:**
- Consumes: `TOUR_STEPS` (Task 1).
- Produces:
```typescript
interface TourController {
  active: boolean;
  stepIndex: number;
  step: TourStep | null;       // TOUR_STEPS[stepIndex] when active, else null
  isFirst: boolean;            // stepIndex === 0
  isLast: boolean;             // stepIndex === TOUR_STEPS.length - 1
  start: () => void;           // replay: stepIndex=0, active=true
  next: () => void;            // advance; past the last step → finish()
  back: () => void;            // stepIndex = max(0, stepIndex-1)
  skip: () => void;            // mark seen + close
  finish: () => void;          // mark seen + close
  maybeAutostart: () => void;  // start() only if not seen
}
function useTour(): TourController
```
Persistence: `localStorage['stylus.tour.v1']` — set to `'1'` on skip/finish; presence means "seen".

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/useTour.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTour } from './useTour';
import { TOUR_STEPS } from '../lib/tourSteps';

describe('useTour', () => {
  beforeEach(() => localStorage.clear());

  it('starts inactive', () => {
    const { result } = renderHook(() => useTour());
    expect(result.current.active).toBe(false);
    expect(result.current.step).toBeNull();
  });

  it('maybeAutostart starts the tour when unseen, and not again once seen', () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.maybeAutostart());
    expect(result.current.active).toBe(true);
    expect(result.current.stepIndex).toBe(0);
    act(() => result.current.skip());
    expect(result.current.active).toBe(false);
    // Seen now — a second autostart is a no-op.
    act(() => result.current.maybeAutostart());
    expect(result.current.active).toBe(false);
  });

  it('next advances and finishes past the last step', () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start());
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      act(() => result.current.next());
    }
    expect(result.current.isLast).toBe(true);
    act(() => result.current.next()); // past the end → finish
    expect(result.current.active).toBe(false);
  });

  it('back clamps at the first step', () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start());
    act(() => result.current.back());
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.isFirst).toBe(true);
  });

  it('start replays even after the tour was seen', () => {
    localStorage.setItem('stylus.tour.v1', '1');
    const { result } = renderHook(() => useTour());
    act(() => result.current.start());
    expect(result.current.active).toBe(true);
    expect(result.current.stepIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useTour.test.ts`
Expected: FAIL — cannot find module `./useTour`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/hooks/useTour.ts
import { useCallback, useState } from 'react';
import { TOUR_STEPS, type TourStep } from '../lib/tourSteps';

const KEY = 'stylus.tour.v1';

function markSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // private mode / quota — best-effort, runs in-session only.
  }
}

function hasSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export interface TourController {
  active: boolean;
  stepIndex: number;
  step: TourStep | null;
  isFirst: boolean;
  isLast: boolean;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  finish: () => void;
  maybeAutostart: () => void;
}

export function useTour(): TourController {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const close = useCallback(() => {
    markSeen();
    setActive(false);
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= TOUR_STEPS.length - 1) {
        close();
        return i;
      }
      return i + 1;
    });
  }, [close]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const maybeAutostart = useCallback(() => {
    if (!hasSeen()) start();
  }, [start]);

  return {
    active,
    stepIndex,
    step: active ? (TOUR_STEPS[stepIndex] ?? null) : null,
    isFirst: stepIndex === 0,
    isLast: stepIndex === TOUR_STEPS.length - 1,
    start,
    next,
    back,
    skip: close,
    finish: close,
    maybeAutostart,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useTour.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTour.ts src/hooks/useTour.test.ts
git commit -m "feat: useTour state machine + first-run gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 3: Brand confetti burst

**Files:**
- Create: `src/lib/confetti.ts`

No unit test: it's rAF + DOM animation verified by running the app. Keep it
small and self-contained.

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/confetti.ts

const COLORS = ['#e76f2c', '#fa9f70', '#ffe3d0', '#fdc4a0'];

/**
 * Fire a one-shot confetti burst from a screen point (defaults to center).
 * Dependency-free: appends absolutely-positioned particles to <body>, animates
 * them with rAF under gravity, and removes them when they fall off-screen
 * (~1.5s). No-op outside the browser.
 */
export function fireConfetti(originX?: number, originY?: number, count = 90): void {
  if (typeof document === 'undefined') return;
  const cx = originX ?? window.innerWidth / 2;
  const cy = originY ?? window.innerHeight / 2;

  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden;';
  document.body.appendChild(container);

  interface P {
    el: HTMLElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vr: number;
  }
  const particles: P[] = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random() * 6;
    el.style.cssText = `position:absolute;width:${size}px;height:${size * 0.6}px;background:${COLORS[i % COLORS.length]};border-radius:1px;will-change:transform;`;
    container.appendChild(el);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 6 + Math.random() * 9;
    particles.push({
      el,
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 20,
    });
  }

  const gravity = 0.35;
  const start = performance.now();
  function frame(now: number): void {
    const elapsed = now - start;
    for (const p of particles) {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`;
    }
    if (elapsed < 1600) {
      requestAnimationFrame(frame);
    } else {
      container.remove();
    }
  }
  requestAnimationFrame(frame);
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/confetti.ts
git commit -m "feat: dependency-free brand confetti burst

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 4: Tour renderer component

**Files:**
- Create: `src/components/Tour.tsx`
- Test: none (visual + DOM-measurement — verified by running the app; logic is in Tasks 1–2, already tested).

**Interfaces:**
- Consumes: `TourController` (Task 2), `fireConfetti` (Task 3), `TourStep` (Task 1).
- Produces: `<Tour controller={tour} />` where `controller: TourController`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/Tour.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TourController } from '../hooks/useTour';
import { TOUR_STEPS } from '../lib/tourSteps';
import { fireConfetti } from '../lib/confetti';

interface Rect { top: number; left: number; width: number; height: number }

/** Resolve the visible [data-tour="id"] element's viewport rect, or null. */
function findTarget(id: string): Rect | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }
  }
  return null;
}

export function Tour({ controller }: { controller: TourController }) {
  const { active, stepIndex, step, isFirst, isLast, next, back, skip } = controller;
  const [rect, setRect] = useState<Rect | null>(null);
  const firedRef = useRef(false);

  // Auto-skip a targeted step whose element isn't visible (e.g. narrow viewport).
  const skipRef = useRef(false);

  // Measure the current target (and re-measure on resize/scroll).
  useLayoutEffect(() => {
    if (!active || !step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    const measure = () => setRect(findTarget(step.target!));
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, step]);

  // If a targeted step resolves to no visible element, advance past it once.
  useEffect(() => {
    if (!active || !step || !step.target) {
      skipRef.current = false;
      return;
    }
    if (rect === null && !skipRef.current) {
      skipRef.current = true;
      next();
    }
  }, [active, step, rect, next]);

  // Escape closes (= skip).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skip]);

  // Fire confetti once when the finish (last, centered) step shows.
  useEffect(() => {
    if (active && isLast && !step?.target) {
      if (!firedRef.current) {
        firedRef.current = true;
        fireConfetti();
      }
    } else {
      firedRef.current = false;
    }
  }, [active, isLast, step]);

  if (!active || !step) return null;

  const totalSpotlight = TOUR_STEPS.filter((s) => s.target).length;
  const spotlightNum = TOUR_STEPS.slice(0, stepIndex + 1).filter((s) => s.target).length;

  // Centered card (welcome / finish).
  if (!step.target) {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 max-w-sm rounded-panel border border-border bg-bg-muted p-6 text-center shadow-pop">
          <h2 className="text-2xl font-semibold text-ink-900">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">{step.body}</p>
          <div className="mt-5 flex justify-center gap-2">
            {isFirst ? (
              <>
                <button
                  type="button"
                  onClick={skip}
                  className="rounded-full px-4 py-2 text-sm font-medium text-ink-400 hover:bg-white/[0.06]"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  Start tour
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Targeted step: render nothing until measured (the effect will skip if absent).
  if (!rect) return null;

  const pad = 8;
  const ringTop = rect.top - pad;
  const ringLeft = rect.left - pad;
  const ringW = rect.width + pad * 2;
  const ringH = rect.height + pad * 2;

  // Card placement relative to the target, clamped on-screen.
  const placement = step.placement ?? 'bottom';
  const cardW = 300;
  const gap = 14;
  let cardTop = ringTop + ringH + gap;
  let cardLeft = ringLeft + ringW / 2 - cardW / 2;
  if (placement === 'top') cardTop = ringTop - gap - 150;
  if (placement === 'right') {
    cardTop = ringTop;
    cardLeft = ringLeft + ringW + gap;
  }
  if (placement === 'left') {
    cardTop = ringTop;
    cardLeft = ringLeft - gap - cardW;
  }
  cardLeft = Math.max(12, Math.min(cardLeft, window.innerWidth - cardW - 12));
  cardTop = Math.max(12, cardTop);

  return (
    <div className="fixed inset-0 z-[150]">
      {/* Four dim rectangles around the target leave it bright. */}
      <div className="absolute inset-x-0 top-0 bg-black/60" style={{ height: Math.max(0, ringTop) }} />
      <div
        className="absolute inset-x-0 bg-black/60"
        style={{ top: ringTop + ringH, bottom: 0 }}
      />
      <div
        className="absolute bg-black/60"
        style={{ top: ringTop, left: 0, width: Math.max(0, ringLeft), height: ringH }}
      />
      <div
        className="absolute bg-black/60"
        style={{ top: ringTop, left: ringLeft + ringW, right: 0, height: ringH }}
      />
      {/* Glowing ring on the target. */}
      <div
        className="pointer-events-none absolute rounded-2xl ring-2 ring-brand-500"
        style={{
          top: ringTop,
          left: ringLeft,
          width: ringW,
          height: ringH,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0), 0 0 24px 4px rgba(231,111,44,0.7)',
        }}
      />
      {/* Tooltip card. */}
      <div
        className="absolute rounded-panel border border-border bg-bg-muted p-4 shadow-pop"
        style={{ top: cardTop, left: cardLeft, width: cardW }}
      >
        <h3 className="text-base font-semibold text-ink-900">{step.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs tabular-nums text-ink-400">
            {spotlightNum} / {totalSpotlight}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skip}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-400 hover:bg-white/[0.06]"
            >
              Skip
            </button>
            {!isFirst && (
              <button
                type="button"
                onClick={back}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-white/[0.06]"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/Tour.tsx
git commit -m "feat: tour renderer (spotlight + cards + confetti)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 5: Wire into App, add data-tour hooks + sidebar replay

**Files:**
- Modify: `src/App.tsx` (instantiate `useTour`, render `<Tour>`, autostart on mount, pass replay to Sidebar)
- Modify: `src/components/Toolbar.tsx` (add `data-tour` to Pen, Select, Convert buttons)
- Modify: `src/components/Workspace.tsx` (add `data-tour="menu"` to the sidebar-opener button)
- Modify: `src/components/Sidebar.tsx` (add a "Take the tour" row + `onStartTour` prop)

**Interfaces:**
- Consumes: `useTour` (Task 2), `Tour` (Task 4).

- [ ] **Step 1: Add data-tour to the toolbar buttons**

In `src/components/Toolbar.tsx`, the Pen / Select / Convert controls are
`IconButton`/`ConvertButton`. `IconButton` doesn't forward arbitrary props, so
wrap each target in a `<span data-tour="...">` (zero-layout-impact inline
wrapper) rather than threading a prop. For the Pen button:

```tsx
      <span data-tour="pen">
        <IconButton label="Pen" active={tool === 'pen'} onClick={() => onToolChange('pen')}>
          <PenIcon />
        </IconButton>
      </span>
```

Do the same for the Select button (`data-tour="select"`) and wrap the
`<ConvertButton .../>` in `<span data-tour="convert">…</span>`.

- [ ] **Step 2: Add data-tour="menu" to the sidebar opener**

In `src/components/Workspace.tsx`, find the "Open menu" button (aria-label
"Open menu") and add `data-tour="menu"` to it.

- [ ] **Step 3: Add the replay row to the Sidebar**

In `src/components/Sidebar.tsx`, add `onStartTour: () => void;` to `SidebarProps`,
destructure it, and add a row just below the preference toggles:

```tsx
        <button
          type="button"
          onClick={onStartTour}
          className="mt-1 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-white/[0.05]"
        >
          Take the tour
        </button>
```

- [ ] **Step 4: Wire App**

In `src/App.tsx`:

```tsx
import { Tour } from './components/Tour';
import { useTour } from './hooks/useTour';
```

Inside `App`:

```tsx
  const tour = useTour();
  useEffect(() => {
    tour.maybeAutostart();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Pass replay to the Sidebar (and close it so the spotlight is visible):

```tsx
        onStartTour={() => {
          setSidebarOpen(false);
          tour.start();
        }}
```

Render `<Tour>` just before the Night-Mode overlay block (so it sits above the app):

```tsx
      <Tour controller={tour} />
```

- [ ] **Step 5: Build + full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all existing tests pass (Tasks 1–2 tests included).

- [ ] **Step 6: Manual verification (run the app)**

Run: `npm run dev`. In a fresh profile (clear localStorage):
- The centered **Welcome** card appears on load. Start tour →
- spotlight dims the screen with a glowing ring on the **Pen** button + card; Next →
- **Select**, then **Convert**, then **menu** (sidebar opener) each spotlight in turn; Back returns to the previous; Skip closes.
- The final centered **finish** card fires a brand-colored **confetti** burst.
- Reload → the tour does NOT auto-run again.
- Open the sidebar → **Take the tour** replays it (sidebar closes first).
- Narrow the window so a target hides → that step auto-skips (no empty spotlight).
- Escape closes the tour at any point.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/Toolbar.tsx src/components/Workspace.tsx src/components/Sidebar.tsx
git commit -m "feat: wire onboarding tour into the app + sidebar replay

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

## Notes for the implementer

- **Auto-skip loop guard** (Task 4): `skipRef` ensures a missing target advances
  exactly once, not repeatedly — don't remove it or a hidden target can loop.
- **Confetti fires once** (Task 4): `firedRef` gates it to a single burst per
  finish-card appearance; it resets when the finish step is no longer showing.
- **Targets render twice** (desktop + mobile toolbars): `findTarget` already
  picks the visible one by non-zero rect — keep that.
