# Accessibility Pass: Focus-Trap + Reduced-Motion + Font-Scaling (Phase 3 #19) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three accessibility gaps identified in the product audit: modals don't trap Tab focus, no animation respects `prefers-reduced-motion`, and there's no user-controlled text-size preference.

**Architecture:** Three independent, additive sub-features sharing one plan because they're small and thematically grouped, not because they're coupled:
1. **Focus trap** — a small reusable `useFocusTrap(containerRef, active)` hook wired into `Dialog.tsx`'s `Backdrop` (used by `ConfirmDialog`/`PromptDialog` and, if earlier Phase 3 plans landed, `TagSuggestionDialog`/`SaveAsTemplateDialog`) and `TemplateGallery.tsx` (which rolls its own dialog chrome rather than using `Backdrop`).
2. **Reduced motion** — a global CSS media query in `src/index.css` that neutralizes the two existing keyframe animations (`kandinsky-welcome`, `kandinsky-pulse`) and Tailwind's `animate-pulse`/`transition-*` utilities when `prefers-reduced-motion: reduce` is set, plus a JS-level check in `src/lib/confetti.ts` (a rAF physics loop can't be stopped by CSS) that no-ops the whole burst.
3. **Font scaling** — a persisted `fontScale` preference (`Profile.fontScale`, same pattern as existing `nightMode`/`stabilizer`) applied as a CSS custom property (`--font-scale`) on `html`, with a Sidebar control (small/medium/large, or a slider) alongside the existing Night Mode/stabilizer toggles.

**Tech Stack:** React, CSS `prefers-reduced-motion` media query, CSS custom properties, existing `src/lib/profile.ts` persistence pattern, Vitest + Testing Library.

## Global Constraints

- Every change here is additive/opt-in-by-OS-preference — must not visually change the app for a user who hasn't set `prefers-reduced-motion: reduce` or changed the font-scale default (100%/no scaling).
- Focus trap must not break existing Escape/Enter handling already in `Dialog.tsx` — Tab-cycling is additive to what's there, not a replacement.
- `fontScale` must use the exact same `loadProfile`/`saveProfile` merge-over-partial pattern as `nightMode`/`stabilizer` (`src/lib/profile.ts:40-47`) — never a parallel storage key.
- Reduced-motion CSS must be a genuinely global rule (one media query block), not per-component overrides scattered across 78+ existing `transition-`/`animate-pulse` usages.

---

## File Structure

- **Create `src/hooks/useFocusTrap.ts`** — reusable Tab-cycling hook.
- **Create `src/hooks/useFocusTrap.test.ts`**.
- **Modify `src/components/Dialog.tsx`** — wire `useFocusTrap` into `Backdrop`.
- **Modify `src/components/TemplateGallery.tsx`** — wire `useFocusTrap` into its own dialog root (doesn't use `Backdrop`).
- **Modify `src/index.css`** — add the `prefers-reduced-motion: reduce` global override block.
- **Modify `src/lib/confetti.ts`** — check `matchMedia('(prefers-reduced-motion: reduce)')` and no-op.
- **Modify `src/lib/profile.ts`** — add `fontScale: number` to `Profile`.
- **Modify `src/App.tsx`** — apply `--font-scale` custom property to `document.documentElement` from the persisted preference.
- **Modify `src/index.css`** — scale a base rem-relative font-size rule using `--font-scale`.
- **Modify `src/components/Sidebar.tsx`** — add a font-scale control alongside the existing Night Mode/stabilizer toggles.

## Task 1: `useFocusTrap` hook

**Files:**
- Create: `src/hooks/useFocusTrap.ts`
- Create: `src/hooks/useFocusTrap.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean): void` — while `active`, Tab/Shift+Tab cycles focus among the container's focusable descendants instead of escaping to the page behind the modal.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/hooks/useFocusTrap.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

function setupContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = `
    <button id="first">First</button>
    <input id="middle" />
    <button id="last">Last</button>
  `;
  document.body.appendChild(container);
  return container;
}

describe('useFocusTrap', () => {
  it('does nothing when inactive', () => {
    const container = setupContainer();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, false));

    const last = container.querySelector<HTMLElement>('#last')!;
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(event);
    // Not prevented — the hook is inactive, so it never called preventDefault.
    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(container);
  });

  it('wraps Tab from the last focusable element back to the first', () => {
    const container = setupContainer();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    const first = container.querySelector<HTMLElement>('#first')!;
    const last = container.querySelector<HTMLElement>('#last')!;
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(first);
    document.body.removeChild(container);
  });

  it('wraps Shift+Tab from the first focusable element back to the last', () => {
    const container = setupContainer();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    const first = container.querySelector<HTMLElement>('#first')!;
    const last = container.querySelector<HTMLElement>('#last')!;
    first.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(last);
    document.body.removeChild(container);
  });

  it('does not interfere with Tab between two middle elements', () => {
    const container = setupContainer();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    const middle = container.querySelector<HTMLElement>('#middle')!;
    middle.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(event);
    // Not the wrap case — the hook should NOT preventDefault here, letting
    // the browser's native Tab order move focus normally.
    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(container);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useFocusTrap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/hooks/useFocusTrap.ts
import { useEffect } from 'react';

/**
 * Accessibility pass (Phase 3 #19): traps Tab/Shift+Tab focus cycling within
 * a container while `active` — the gap identified in the product audit
 * ("no visible focus-trap utility... keyboard focus containment inside open
 * dialogs wasn't confirmed present"). Only intercepts the WRAP cases (Tab on
 * the last element, Shift+Tab on the first); every other Tab press is left
 * to the browser's native focus order, so this never fights normal
 * in-dialog navigation.
 *
 * Does NOT move initial focus on open — Dialog.tsx's ConfirmDialog/
 * PromptDialog already handle that themselves (confirmRef.current?.focus()
 * / inputRef.current?.focus()); this hook is purely about containment once
 * focus is somewhere inside.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null); // skip hidden elements
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [containerRef, active]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useFocusTrap.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useFocusTrap.ts src/hooks/useFocusTrap.test.ts
git commit -m "feat(a11y): add useFocusTrap hook for modal Tab containment"
```

## Task 2: Wire focus trap into `Dialog.tsx` and `TemplateGallery.tsx`

**Files:**
- Modify: `src/components/Dialog.tsx`
- Modify: `src/components/TemplateGallery.tsx`
- Test: existing test files for these components if present (`ls src/components/Dialog.test.tsx src/components/TemplateGallery.test.tsx 2>/dev/null`).

**Interfaces:**
- Consumes: `useFocusTrap(containerRef, active)` (Task 1).

- [ ] **Step 1: Wire into `Dialog.tsx`'s `Backdrop`**

In `src/components/Dialog.tsx`, add a ref to the card element and call the hook:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { buzz } from '../lib/haptics';
import { TrashIcon } from './icons';

function Backdrop({ onClose, children, labelledBy }: Backdrop) {
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, true); // Backdrop only mounts while its dialog is open

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div ref={cardRef} className="relative w-full max-w-sm rounded-panel border border-border bg-bg-subtle p-5 shadow-pop">
        {children}
      </div>
    </div>
  );
}
```

Since `Backdrop` only ever renders while its parent dialog is conditionally mounted (`{open && <ConfirmDialog .../>}`-style usage, confirmed by `ConfirmDialogProps.open` gating what's returned), `active` can be a constant `true` here — there's no "mounted but inactive" state to represent, unlike a hook used across a whole app shell.

- [ ] **Step 2: Wire into `TemplateGallery.tsx`**

`TemplateGallery` renders its own dialog chrome (`role="dialog" aria-modal="true"`) rather than using `Backdrop` (confirmed in the file read during planning — its outer `<div>` at line 74-81 has the ARIA attributes directly). Add a ref to its card `<div>` (line 82) and call the hook:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
// ... existing imports ...

export function TemplateGallery({ mode, selectedId, onSelect, onClose }: TemplateGalleryProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, true);
  // ... existing state/effects unchanged ...

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'page' ? 'Page template' : 'Notebook cover'}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-panel border border-border bg-bg-subtle shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ...existing content unchanged... */}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Open the Sidebar, trigger a delete-document confirmation (`ConfirmDialog`), press Tab repeatedly and confirm focus cycles among the dialog's own buttons without ever landing on something behind it (e.g. the Sidebar's search input). Repeat with the page-template picker (`TemplateGallery`).

- [ ] **Step 5: Commit**

```bash
git add src/components/Dialog.tsx src/components/TemplateGallery.tsx
git commit -m "feat(a11y): trap Tab focus inside Dialog and TemplateGallery modals"
```

## Task 3: Global `prefers-reduced-motion` CSS override

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: nothing — pure CSS.
- Produces: a `@media (prefers-reduced-motion: reduce)` block that neutralizes the existing `kandinsky-welcome`/`kandinsky-pulse` keyframe animations and all Tailwind `transition-*`/`animate-*` utility classes app-wide.

- [ ] **Step 1: Add the override block**

Append to `src/index.css`, after the existing Kandinsky animation rules:

```css
/* ── Reduced motion (Phase 3 #19) ─────────────────────────────────────── */
/* Neutralizes every CSS transition/animation app-wide when the OS-level
   prefers-reduced-motion setting is on — covers Tailwind's transition-*/
   animate-* utility classes (78+ call sites across components, per an
   audit-time grep) plus this file's own Kandinsky keyframes, without
   touching any individual component's className. Motion caused by JS (the
   confetti burst's rAF loop) can't be stopped by CSS — see confetti.ts's
   own matchMedia check. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. In Chrome DevTools, open the Rendering tab (Cmd/Ctrl+Shift+P → "Show Rendering"), set "Emulate CSS media feature prefers-reduced-motion" to "reduce." Reload, confirm hover/active transitions on toolbar buttons are instant (no fade), and trigger the onboarding tour's Kandinsky welcome animation (if easily reachable) to confirm it no longer visibly animates.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(a11y): add global prefers-reduced-motion CSS override"
```

## Task 4: Reduced-motion check in `confetti.ts`

**Files:**
- Modify: `src/lib/confetti.ts`
- Create: `src/lib/confetti.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fireConfetti` becomes a no-op when `matchMedia('(prefers-reduced-motion: reduce)').matches` is true — checked because this is a rAF-driven JS physics loop (translate + rotate motion), not a CSS transition/animation, so Task 3's CSS override cannot touch it (the CSS rule only compresses `animation-duration`/`transition-duration`, neither of which this code path uses).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/confetti.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireConfetti } from './confetti';

describe('fireConfetti', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not append a confetti container when prefers-reduced-motion is set', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);

    const before = document.body.children.length;
    fireConfetti();
    expect(document.body.children.length).toBe(before);
  });

  it('appends a confetti container when reduced motion is not set', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    const before = document.body.children.length;
    fireConfetti();
    expect(document.body.children.length).toBe(before + 1);
    // Clean up the container this call appended (it self-removes after
    // ~1.6s via rAF, which doesn't run synchronously in this test).
    document.body.lastElementChild?.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/confetti.test.ts`
Expected: FAIL (or the second test passes by pre-existing behavior while the first fails, since there's no reduced-motion check yet — confirm the first test specifically fails).

- [ ] **Step 3: Add the check**

In `src/lib/confetti.ts`, add at the top of `fireConfetti`:

```typescript
export function fireConfetti(originX?: number, originY?: number, count = 90): void {
  if (typeof document === 'undefined') return;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return; // vestibular-motion trigger — respect the OS preference, no fallback animation needed for a purely decorative burst
  }
  const cx = originX ?? window.innerWidth / 2;
  // ...rest of the function unchanged...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/confetti.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/confetti.ts src/lib/confetti.test.ts
git commit -m "feat(a11y): skip confetti burst when prefers-reduced-motion is set"
```

## Task 5: `Profile.fontScale` persistence

**Files:**
- Modify: `src/lib/profile.ts`
- Test: `src/lib/profile.test.ts` if it exists (`ls src/lib/profile.test.ts 2>/dev/null`); the existing `src/lib/profile.test.ts` referenced in the survey's test-suite output confirms one exists.

**Interfaces:**
- Consumes: nothing new.
- Produces: `Profile.fontScale: number` (a multiplier, default `1`, valid range enforced on load — clamp to `[0.85, 1.5]` so a corrupted/tampered localStorage value can't break layout).

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/profile.test.ts
describe('fontScale', () => {
  it('defaults to 1', () => {
    localStorage.clear();
    expect(loadProfile().fontScale).toBe(1);
  });

  it('round-trips a saved value', () => {
    localStorage.clear();
    saveProfile({ fontScale: 1.25 });
    expect(loadProfile().fontScale).toBe(1.25);
  });

  it('clamps an out-of-range stored value on load', () => {
    localStorage.clear();
    localStorage.setItem('stylus.profile.v1', JSON.stringify({ fontScale: 3 }));
    expect(loadProfile().fontScale).toBe(1.5);
    localStorage.setItem('stylus.profile.v1', JSON.stringify({ fontScale: 0.1 }));
    expect(loadProfile().fontScale).toBe(0.85);
  });

  it('falls back to 1 for a non-numeric stored value', () => {
    localStorage.clear();
    localStorage.setItem('stylus.profile.v1', JSON.stringify({ fontScale: 'huge' }));
    expect(loadProfile().fontScale).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/profile.test.ts -t "fontScale"`
Expected: FAIL — `fontScale` is `undefined`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/profile.ts — full updated file
/**
 * Local user profile (no account, no backend). Just a display name kept in
 * localStorage so the sidebar can greet the user and show an avatar.
 */

export interface Profile {
  name: string;
  /** Warm, dimmed low-light view to reduce late-night eye strain. */
  nightMode: boolean;
  /** Damp jitter on the live stroke for steadier handwriting. */
  stabilizer: boolean;
  /** UI text-size multiplier (Phase 3 #19 accessibility pass). 1 = default;
   *  clamped to [0.85, 1.5] on load so a corrupted/tampered stored value
   *  can never break layout beyond a readable range. */
  fontScale: number;
}

const KEY = 'stylus.profile.v1';
const DEFAULT: Profile = { name: 'You', nightMode: false, stabilizer: false, fontScale: 1 };
const FONT_SCALE_MIN = 0.85;
const FONT_SCALE_MAX = 1.5;

function clampFontScale(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT.fontScale;
  return Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, n));
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      name:
        typeof parsed.name === 'string' && parsed.name.trim()
          ? parsed.name
          : DEFAULT.name,
      nightMode: parsed.nightMode === true,
      stabilizer: parsed.stabilizer === true,
      fontScale: clampFontScale(parsed.fontScale),
    };
  } catch {
    return DEFAULT;
  }
}

/**
 * Persist a profile. Accepts a partial and MERGES over the stored value, so a
 * caller (or an older, stale tab) that only knows some fields can't clobber the
 * others back to defaults.
 */
export function saveProfile(profile: Partial<Profile>): void {
  try {
    const merged: Profile = { ...loadProfile(), ...profile };
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // ignore (private mode / quota)
  }
}

/** Up-to-two-letter avatar initials derived from the name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/profile.test.ts`
Expected: PASS — all tests including the 4 new ones green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/profile.ts src/lib/profile.test.ts
git commit -m "feat(a11y): add fontScale to the persisted profile"
```

## Task 6: Apply `--font-scale` custom property

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Profile.fontScale` (Task 5).
- Produces: `document.documentElement.style.setProperty('--font-scale', String(fontScale))`, and a CSS rule making `html`'s base font-size respond to it.

- [ ] **Step 1: Add the CSS custom property consumer**

In `src/index.css`, change the `html`/root font-size handling. Since no explicit `html { font-size: ... }` rule currently exists (confirmed — `src/index.css` was read in full during planning and has none, meaning the browser default 16px applies), add one that reads the custom property:

```css
:root {
  color-scheme: dark;
  --font-scale: 1;
}

html {
  /* Phase 3 #19: user-controlled text-size preference. Every Tailwind
     `text-*` utility and any bare `rem` value scales with this, since rem
     units are always relative to the ROOT font-size — the one place this
     needs to be set for the whole app to respond. */
  font-size: calc(16px * var(--font-scale));
}
```

- [ ] **Step 2: Set the custom property from `App.tsx`**

In `src/App.tsx`, near the existing `nightMode`/`stabilizer` state (line 39-40):

```typescript
const [fontScale, setFontScale] = useState(() => loadProfile().fontScale);

useEffect(() => {
  document.documentElement.style.setProperty('--font-scale', String(fontScale));
}, [fontScale]);

const handleFontScaleChange = useCallback((next: number) => {
  setFontScale(next);
  saveProfile({ fontScale: next });
}, []);
```

Place `handleFontScaleChange` alongside the existing `handleToggleNightMode`/`handleToggleStabilizer`-style handlers (found via `grep -n "saveProfile" src/App.tsx` — match their exact naming convention rather than the placeholder names above).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL until Task 7 wires `fontScale`/`handleFontScaleChange` into `Sidebar`'s props — expected at this point in the plan; proceed to Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/App.tsx
git commit -m "feat(a11y): apply --font-scale custom property from persisted preference"
```

## Task 7: Font-scale control in Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `fontScale: number` and `onFontScaleChange: (scale: number) => void` as new `SidebarProps` fields, alongside the existing `nightMode`/`onToggleNightMode` pair (same wiring pattern).

- [ ] **Step 1: Locate the existing Night Mode/stabilizer toggle UI**

Run: `grep -n "nightMode\|stabilizer\|onToggleNightMode\|onToggleStabilizer" src/components/Sidebar.tsx`

Find where these render as toggle switches/buttons in the Sidebar's settings section — the font-scale control goes right after them.

- [ ] **Step 2: Add the prop and control**

Extend `SidebarProps`:

```typescript
interface SidebarProps {
  // ...existing fields...
  fontScale: number;
  onFontScaleChange: (scale: number) => void;
}
```

Add three preset buttons (simpler and more discoverable than a slider for a rarely-touched setting) near the existing Night Mode toggle:

```tsx
const FONT_SCALE_PRESETS: { label: string; value: number }[] = [
  { label: 'A', value: 0.85 },
  { label: 'A', value: 1 },
  { label: 'A', value: 1.25 },
];

// ... in the settings section JSX, near nightMode's toggle:
<div className="flex items-center justify-between px-3 py-2">
  <span className="text-sm text-ink-900">Text size</span>
  <div className="flex gap-1" role="group" aria-label="Text size">
    {FONT_SCALE_PRESETS.map((preset, i) => (
      <button
        key={preset.value}
        type="button"
        aria-pressed={fontScale === preset.value}
        aria-label={['Small', 'Medium', 'Large'][i]}
        onClick={() => onFontScaleChange(preset.value)}
        className={[
          'rounded-lg px-2 py-1 font-semibold transition-colors',
          i === 0 ? 'text-xs' : i === 1 ? 'text-sm' : 'text-base',
          fontScale === preset.value
            ? 'bg-brand-600 text-white'
            : 'bg-bg-muted text-ink-400 hover:text-ink-900',
        ].join(' ')}
      >
        {preset.label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Wire the App.tsx render site**

At `Sidebar`'s render call in `App.tsx`, add:

```tsx
<Sidebar
  // ...existing props...
  fontScale={fontScale}
  onFontScaleChange={handleFontScaleChange}
/>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Open the Sidebar, click each text-size preset, confirm the whole app's text visibly scales (toolbar labels, sidebar text, dialog text — anything using `rem`-based Tailwind `text-*` classes). Reload the page and confirm the choice persisted.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat(a11y): add text-size control to Sidebar"
```

## Task 8: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Manual end-to-end check**

Repeat the manual verification steps from Tasks 2, 3, 4, and 7 in one pass: focus-trap in both dialog types, reduced-motion emulation suppressing transitions and confetti, and font-scale presets changing and persisting text size. Additionally check that increasing font scale to the maximum preset doesn't visibly break the toolbar layout (buttons overflowing, text clipping) — if it does, note it as a follow-up rather than blocking this task, since layout-robustness-at-max-scale is a deeper responsive-design concern beyond this plan's scope.

- [ ] **Step 4: Commit any final fixes**

If Steps 1–3 surfaced anything, fix and commit; otherwise no commit for this task.
