# Voice-to-Text Capture (Phase 3 #17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user dictate a note via the Web Speech API and have the transcribed text dropped into the canvas as a finished text box, using the exact same pipeline the Scanmarker scanner already uses.

**Architecture:** `Workspace.tsx` already has a `handleScan(scannedText: string)` callback that drops a finished `TextItem` at a staggered position near the top of the current viewport (used today by `useScanmarkerScanner`). Voice input needs exactly the same shape: a hook wrapping the browser's `SpeechRecognition` API that calls an `onResult(text: string)` callback when a phrase is finalized. Build `useVoiceInput(onResult)` mirroring `useScanmarkerScanner(onScan)`'s structure (connection/session state, toast feedback, graceful "unsupported" detection), wire it into `Workspace.tsx` exactly like the scanner (`handleScan` reused as the `onResult` callback — no new text-insertion logic needed), and add a mic button to `ToolbarInputMethods.tsx` next to the existing scanner/stylus buttons, hidden when `SpeechRecognition` isn't available (Safari/Firefox lack it; Chrome/Edge have it) — same "hidden when unsupported" convention already used for WebHID/Web Bluetooth.

**Tech Stack:** Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`, browser-native, no library), React, existing `TextItem` pipeline, Vitest with a mocked `SpeechRecognition` global.

## Global Constraints

- No new backend, no new API route, no new dependency — the Web Speech API is browser-native (already how the audit's "voice-to-text" gap is scoped: client-only, matches the product's offline-first identity better than a server transcription API would).
- Must degrade invisibly on unsupported browsers (Safari desktop lacks `SpeechRecognition`, and browsers other than Chrome/Edge vary) — the mic button simply doesn't render, exactly like `InputMethodGroup` already does for WebHID/Web Bluetooth via `isWebHIDAvailable`/`isWebBluetoothAvailable` guards.
- Reuse `handleScan` (`Workspace.tsx:409-420`) as the text-insertion path — do not write a second "drop a finished text box" implementation. If a distinct entry point is genuinely needed (e.g. different toast copy), wrap `handleScan`, don't duplicate its body.
- Mirror `useScanmarkerScanner`'s hook shape (`isAvailable`, `isConnected`/`isListening`, `connect`/`start`, `disconnect`/`stop`, toast on result) so `ToolbarInputMethods.tsx`'s existing `ToolbarBtn` component can render the mic button with zero new button-chrome code.
- Must request microphone permission only on explicit user action (clicking the mic button) — never on mount, matching the existing scanner/stylus hooks' `connect()`-on-click pattern.

---

## File Structure

- **Create `src/hooks/useVoiceInput.ts`** — the Web Speech API wrapper, structured like `src/hooks/useScanmarkerScanner.ts`.
- **Create `src/hooks/useVoiceInput.test.ts`** — unit tests with a mocked `SpeechRecognition`.
- **Modify `src/components/ToolbarInputMethods.tsx`** — add `IconMic`, a `VoiceButton`, and wire it into `InputMethodGroup`'s render (extend `InputMethodGroupProps` with a `voice` field).
- **Modify `src/components/Workspace.tsx`** — instantiate `useVoiceInput(handleScan)` alongside the existing `scanner`/`stylus` hooks, pass it through to `InputMethodGroup`.

## Task 1: `useVoiceInput` hook

**Files:**
- Create: `src/hooks/useVoiceInput.ts`
- Create: `src/hooks/useVoiceInput.test.ts`

**Interfaces:**
- Consumes: `toast` from `../lib/toast` (existing, used identically by `useScanmarkerScanner`); the browser's `SpeechRecognition`/`webkitSpeechRecognition` global (feature-detected, not imported).
- Produces:

```typescript
export interface UseVoiceInputReturn {
  isAvailable: boolean;
  isListening: boolean;
  start: () => void;
  stop: () => void;
}
export function useVoiceInput(onResult: (text: string) => void): UseVoiceInputReturn;
```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/hooks/useVoiceInput.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceInput } from './useVoiceInput';

vi.mock('../lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/** Minimal fake SpeechRecognition — enough surface to drive the hook's
 *  event handlers without pulling in a real speech engine (impossible in
 *  jsdom/CI anyway; the Web Speech API has no headless test double). */
class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  static instances: FakeSpeechRecognition[] = [];
  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }
}

describe('useVoiceInput', () => {
  const originalSR = (window as unknown as Record<string, unknown>).SpeechRecognition;

  beforeEach(() => {
    FakeSpeechRecognition.instances = [];
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeSpeechRecognition;
  });

  afterEach(() => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = originalSR;
  });

  it('reports unavailable when SpeechRecognition is not present', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    expect(result.current.isAvailable).toBe(false);
  });

  it('reports available when SpeechRecognition is present', () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    expect(result.current.isAvailable).toBe(true);
  });

  it('start() begins listening and calls recognition.start()', () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);
    expect(FakeSpeechRecognition.instances[0].start).toHaveBeenCalled();
  });

  it('calls onResult with the final transcript and stops listening on end', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useVoiceInput(onResult));
    act(() => result.current.start());

    const instance = FakeSpeechRecognition.instances[0];
    act(() => {
      instance.onresult?.({
        results: [[{ transcript: 'buy milk tomorrow' }]],
        resultIndex: 0,
      });
    });
    expect(onResult).toHaveBeenCalledWith('buy milk tomorrow');

    act(() => instance.onend?.());
    expect(result.current.isListening).toBe(false);
  });

  it('stop() calls recognition.stop()', () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    act(() => result.current.start());
    const instance = FakeSpeechRecognition.instances[0];
    act(() => result.current.stop());
    expect(instance.stop).toHaveBeenCalled();
  });

  it('surfaces a toast on recognition error without throwing', () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    act(() => result.current.start());
    const instance = FakeSpeechRecognition.instances[0];
    expect(() => act(() => instance.onerror?.({ error: 'not-allowed' }))).not.toThrow();
    expect(result.current.isListening).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useVoiceInput.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/hooks/useVoiceInput.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../lib/toast';

/**
 * Voice-to-text capture (Phase 3 #17) via the browser-native Web Speech API.
 * No library, no backend call — matches the product's offline-first
 * identity better than a server transcription round-trip would, and mirrors
 * useScanmarkerScanner's shape exactly (isAvailable / isListening / start /
 * stop, toast feedback) so ToolbarInputMethods' existing button chrome needs
 * zero new patterns to render it.
 *
 * `onResult` fires once per finalized phrase (not interim/partial results —
 * dropping a text box per interim guess would spam the canvas with
 * corrections). Each finalized phrase is delivered as its own callback,
 * exactly like the Scanmarker scanner's onScan.
 */

// Not in lib.dom.d.ts (Web Speech API is still non-standard) — minimal shape
// this hook actually uses, both the standard and legacy-webkit-prefixed
// constructor.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike> & { isFinal?: boolean }>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as SpeechRecognitionCtor | undefined)
    ?? (w.webkitSpeechRecognition as SpeechRecognitionCtor | undefined)
    ?? null;
}

export interface UseVoiceInputReturn {
  isAvailable: boolean;
  isListening: boolean;
  start: () => void;
  stop: () => void;
}

export function useVoiceInput(onResult: (text: string) => void): UseVoiceInputReturn {
  const Ctor = getSpeechRecognitionCtor();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const start = useCallback(() => {
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const isFinal = (result as { isFinal?: boolean }).isFinal !== false;
        if (!isFinal) continue;
        const transcript = result[0]?.transcript?.trim();
        if (transcript) onResultRef.current(transcript);
      }
    };
    recognition.onerror = (e) => {
      setIsListening(false);
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        toast.error('Microphone access denied.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        toast.error(`Voice input error: ${e.error}`);
      }
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [Ctor]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return {
    isAvailable: Ctor !== null,
    isListening,
    start,
    stop,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useVoiceInput.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useVoiceInput.ts src/hooks/useVoiceInput.test.ts
git commit -m "feat(voice): add useVoiceInput Web Speech API hook"
```

## Task 2: Mic button in `ToolbarInputMethods`

**Files:**
- Modify: `src/components/ToolbarInputMethods.tsx`

**Interfaces:**
- Consumes: `UseVoiceInputReturn` from `../hooks/useVoiceInput` (Task 1).
- Produces: `InputMethodGroupProps` gains a `voice: UseVoiceInputReturn` field; a new `VoiceButton` component (not exported — internal to this file, same visibility as `ScannerButton`/`StylusButton`).

- [ ] **Step 1: Add the mic icon**

In `src/components/ToolbarInputMethods.tsx`, add alongside `IconScanner`/`IconStylus`:

```tsx
function IconMic(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M4 9v1a6 6 0 0012 0V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 16v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Add `VoiceButton` and wire it into `InputMethodGroup`**

```tsx
import type { UseVoiceInputReturn } from '../hooks/useVoiceInput';

interface InputMethodGroupProps {
  scanner: UseScanmarkerScannerReturn;
  stylus: UseBluetoothStylusReturn;
  voice: UseVoiceInputReturn;
}

export function InputMethodGroup({
  scanner,
  stylus,
  voice,
}: InputMethodGroupProps): React.ReactElement | null {
  if (!scanner.isWebHIDAvailable && !stylus.isWebBluetoothAvailable && !voice.isAvailable) {
    return null;
  }
  return (
    <>
      <Divider />
      {scanner.isWebHIDAvailable && <ScannerButton scanner={scanner} />}
      {stylus.isWebBluetoothAvailable && <StylusButton stylus={stylus} />}
      {voice.isAvailable && <VoiceButton voice={voice} />}
    </>
  );
}

// ─── Voice button ──────────────────────────────────────────────────────────────

function VoiceButton({ voice }: { voice: UseVoiceInputReturn }): React.ReactElement {
  const handleClick = () => {
    if (voice.isListening) {
      voice.stop();
    } else {
      voice.start();
    }
  };

  return (
    <ToolbarBtn
      label="Voice input"
      tooltip={voice.isListening ? 'Listening… click to stop' : 'Dictate a note'}
      active={voice.isListening}
      pulse={voice.isListening}
      onClick={handleClick}
    >
      <IconMic />
    </ToolbarBtn>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL until Task 3 updates the `InputMethodGroup` call site in `Workspace.tsx` to pass the new required `voice` prop — this is expected at this point in the plan; proceed to Task 3 before re-checking.

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolbarInputMethods.tsx
git commit -m "feat(voice): add mic button to ToolbarInputMethods"
```

## Task 3: Wire `useVoiceInput` into Workspace

**Files:**
- Modify: `src/components/Workspace.tsx`

**Interfaces:**
- Consumes: `useVoiceInput(onResult)` (Task 1); reuses `handleScan` (existing, `Workspace.tsx:409-420`) as the `onResult` callback — voice-dictated text lands exactly where scanned text does (staggered near top of viewport, as a finished text box).

- [ ] **Step 1: Import and instantiate the hook**

In `src/components/Workspace.tsx`, near where `scanner`/`stylus` are instantiated (`const scanner = useScanmarkerScanner(handleScan);` / `const stylus = useBluetoothStylus();`, around line 422-423):

```typescript
import { useVoiceInput } from '../hooks/useVoiceInput';

// ... alongside the existing scanner/stylus instantiation:
const voice = useVoiceInput(handleScan);
```

`handleScan` is defined above this point in the file (line 409) and is a `useCallback` with stable identity across `color`/`size` changes only — same dependency shape `useScanmarkerScanner(handleScan)` already relies on, so reusing it here needs no new memoization work.

- [ ] **Step 2: Pass `voice` through to `InputMethodGroup`**

At the existing render site (around line 1010-1012):

```tsx
inputMethodGroup={
  <InputMethodGroup scanner={scanner} stylus={stylus} voice={voice} />
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — the `voice` prop Task 2 made required is now supplied.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` in a Chromium-based browser (Chrome/Edge — Safari lacks `SpeechRecognition`). Confirm the mic button appears in the toolbar's input-methods group. Click it, grant microphone permission when prompted, say a short phrase, confirm a text box appears near the top of the canvas with the transcribed words. Click again to stop listening.

- [ ] **Step 5: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat(voice): wire useVoiceInput into Workspace via the existing scan pipeline"
```

## Task 4: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Manual cross-browser check**

Repeat Task 3 Step 4 in Chrome/Edge (should work). Open the app in Safari or Firefox (if available) and confirm the mic button is simply absent from the toolbar — no error, no broken layout, matching how the scanner/stylus buttons already behave on browsers without WebHID/Web Bluetooth.

- [ ] **Step 4: Commit any final fixes**

If Steps 1–3 surfaced anything, fix and commit; otherwise no commit for this task.
