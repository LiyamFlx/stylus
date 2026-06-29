# Kandinsky Music Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a session-only "music mode" to Stylus that turns drawn shapes into Kandinsky-style sound — a note per finished stroke (pitched by vertical position) plus a left-to-right Play sweep, with a two-palette instrument toggle.

**Architecture:** Three pure-ish lib modules under `src/lib/kandinsky/` (shape classification, pentatonic pitch mapping, lazy Tone.js audio engine), one coordinating hook `useMusicMode`, a non-invasive `onStrokeEnd` callback added to `useDrawing`, and toolbar + overlay UI in `Workspace`/`Toolbar`. Strokes and documents are untouched; music state is in-memory only.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library, Tone.js (lazy dynamic import, new dependency).

## Global Constraints

- Reuse the existing `InkPoint` and `Stroke` types from `src/types.ts` — do NOT redefine them. Classification reads only `x`/`y`.
- Stylus is dark-themed; follow existing Toolbar styling (`IconButton`, `bg-brand-500` active, `text-ink-700`).
- `tone` is a lazy dynamic import (`await import('tone')`), never a top-level import in app code, so it stays out of the main bundle.
- `Tone.start()` must be called synchronously inside a user-gesture handler (the toggle click), not inside the async stroke path (Safari autoplay).
- IDs use the existing pattern: `crypto.randomUUID()` with a string fallback. No `Math.random().substr` (deprecated).
- Test command: `npm test` (vitest run). Single file: `npx vitest run <path>`.
- Music mode adds NO persisted state and NO change to stroke storage.

---

### Task 1: Shape classification module

**Files:**
- Create: `src/lib/kandinsky/classify.ts`
- Test: `src/lib/kandinsky/classify.test.ts`

**Interfaces:**
- Consumes: `InkPoint` from `../../types`.
- Produces:
  - `type ShapeClass = 'line' | 'circle' | 'triangle' | 'square' | 'freeform'`
  - `interface ClassifiedShape { type: ShapeClass; minX: number; centerY: number }`
  - `function classifyShape(points: InkPoint[]): ClassifiedShape`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/kandinsky/classify.test.ts
import { describe, it, expect } from 'vitest';
import { classifyShape } from './classify';
import type { InkPoint } from '../../types';

function pt(x: number, y: number): InkPoint {
  return { x, y, pressure: 0.5, t: 0 };
}

// Sample a closed polygon's edges into many points (like a real stroke).
function polygon(corners: [number, number][], perEdge = 8): InkPoint[] {
  const pts: InkPoint[] = [];
  const all = [...corners, corners[0]]; // close it
  for (let i = 0; i < all.length - 1; i++) {
    const [x1, y1] = all[i];
    const [x2, y2] = all[i + 1];
    for (let s = 0; s < perEdge; s++) {
      const f = s / perEdge;
      pts.push(pt(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f));
    }
  }
  pts.push(pt(all[0][0], all[0][1]));
  return pts;
}

function circle(cx: number, cy: number, r: number, n = 40): InkPoint[] {
  const pts: InkPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

describe('classifyShape', () => {
  it('classifies a straight diagonal as a line', () => {
    const pts: InkPoint[] = [];
    for (let i = 0; i <= 40; i++) pts.push(pt(i * 5, i * 5));
    expect(classifyShape(pts).type).toBe('line');
  });

  it('classifies a round closed loop as a circle', () => {
    expect(classifyShape(circle(200, 200, 80)).type).toBe('circle');
  });

  it('classifies a 3-corner closed loop as a triangle', () => {
    const tri = polygon([[100, 300], [300, 300], [200, 100]]);
    expect(classifyShape(tri).type).toBe('triangle');
  });

  it('classifies a 4-corner closed loop as a square', () => {
    const sq = polygon([[100, 100], [300, 100], [300, 300], [100, 300]]);
    expect(classifyShape(sq).type).toBe('square');
  });

  it('reports minX and centerY from the bounding geometry', () => {
    const sq = polygon([[100, 100], [300, 100], [300, 300], [100, 300]]);
    const r = classifyShape(sq);
    expect(r.minX).toBeCloseTo(100, 0);
    expect(r.centerY).toBeGreaterThan(150);
    expect(r.centerY).toBeLessThan(250);
  });

  it('treats <3 points as a line without throwing', () => {
    expect(classifyShape([pt(0, 0)]).type).toBe('line');
    expect(classifyShape([]).type).toBe('line');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kandinsky/classify.test.ts`
Expected: FAIL — cannot find module `./classify`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/kandinsky/classify.ts
import type { InkPoint } from '../../types';

export type ShapeClass = 'line' | 'circle' | 'triangle' | 'square' | 'freeform';

export interface ClassifiedShape {
  type: ShapeClass;
  /** Leftmost x of the stroke — used as the playhead trigger position. */
  minX: number;
  /** Vertical center — mapped to pitch. */
  centerY: number;
}

/** Squared distance from point p to segment p1→p2. */
function sqSegDist(p: InkPoint, p1: InkPoint, p2: InkPoint): number {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}

/** Ramer–Douglas–Peucker simplification; returns the kept corner points. */
function rdp(points: InkPoint[], epsilon: number): InkPoint[] {
  if (points.length <= 2) return points;
  let maxSq = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = sqSegDist(points[i], points[0], points[end]);
    if (d > maxSq) {
      index = i;
      maxSq = d;
    }
  }
  if (maxSq > epsilon * epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [points[0], points[end]];
}

/** Normalized radius variance about the centroid (0 = perfect circle). */
function circleVariance(points: InkPoint[], cx: number, cy: number): number {
  const dists = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const avg = dists.reduce((s, d) => s + d, 0) / dists.length;
  const variance = dists.reduce((s, d) => s + (d - avg) ** 2, 0) / dists.length;
  return variance / (avg * avg || 1);
}

export function classifyShape(points: InkPoint[]): ClassifiedShape {
  if (points.length < 3) {
    return { type: 'line', minX: points[0]?.x ?? 0, centerY: points[0]?.y ?? 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }
  const centerX = sumX / points.length;
  const centerY = sumY / points.length;
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const start = points[0];
  const end = points[points.length - 1];
  const endpointsDist = Math.hypot(start.x - end.x, start.y - end.y);

  // Closed-loop gate: endpoints near each other relative to the shape's size.
  const isClosed =
    endpointsDist < diag * 0.25 || (points.length > 20 && endpointsDist < 30);

  if (!isClosed) {
    return { type: diag > 150 ? 'line' : 'freeform', minX, centerY };
  }

  if (circleVariance(points, centerX, centerY) < 0.04) {
    return { type: 'circle', minX, centerY };
  }

  // Corner count on the closed path. RDP keeps the duplicated closing point,
  // so a triangle simplifies to 4 kept points and a square to 5.
  const simplified = rdp(points, diag * 0.08);
  const corners = simplified.length - 1;
  if (corners === 3) return { type: 'triangle', minX, centerY };
  if (corners === 4) return { type: 'square', minX, centerY };

  return { type: 'freeform', minX, centerY };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kandinsky/classify.test.ts`
Expected: PASS (6 tests). If triangle/square miss by one corner, adjust the `corners` comparison to match the fixtures — the test fixtures are the source of truth.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kandinsky/classify.ts src/lib/kandinsky/classify.test.ts
git commit -m "feat: shape classification for Kandinsky music mode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 2: Pentatonic pitch mapping

**Files:**
- Create: `src/lib/kandinsky/scale.ts`
- Test: `src/lib/kandinsky/scale.test.ts`

**Interfaces:**
- Produces: `function pitchForY(centerY: number, canvasHeight: number): string`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/kandinsky/scale.test.ts
import { describe, it, expect } from 'vitest';
import { pitchForY } from './scale';

describe('pitchForY', () => {
  it('maps the top of the canvas to the highest note', () => {
    expect(pitchForY(0, 600)).toBe('A5');
  });

  it('maps the bottom of the canvas to the lowest note', () => {
    expect(pitchForY(600, 600)).toBe('C3');
  });

  it('is monotonic: higher on screen (smaller Y) is never a lower note index', () => {
    const order = ['C3','D3','E3','G3','A3','C4','D4','E4','G4','A4','C5','D5','E5','G5','A5'];
    let prev = -1;
    for (let y = 600; y >= 0; y -= 20) {
      const idx = order.indexOf(pitchForY(y, 600));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it('clamps out-of-range Y and guards zero height', () => {
    expect(pitchForY(-50, 600)).toBe('A5');
    expect(pitchForY(9999, 600)).toBe('C3');
    expect(pitchForY(100, 0)).toBe('C3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kandinsky/scale.test.ts`
Expected: FAIL — cannot find module `./scale`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/kandinsky/scale.ts

/** C-major pentatonic across three octaves, low → high. */
const PENTATONIC_SCALE = [
  'C3', 'D3', 'E3', 'G3', 'A3',
  'C4', 'D4', 'E4', 'G4', 'A4',
  'C5', 'D5', 'E5', 'G5', 'A5',
] as const;

/**
 * Maps a shape's center-Y to a pentatonic note. Top of canvas (Y=0) → highest
 * note; bottom (Y=height) → lowest. Clamped; zero/negative height → lowest.
 */
export function pitchForY(centerY: number, canvasHeight: number): string {
  if (canvasHeight <= 0) return PENTATONIC_SCALE[0];
  const normalized = Math.max(0, Math.min(1, centerY / canvasHeight));
  const inverted = 1 - normalized; // top = 1 = highest
  const index = Math.floor(inverted * PENTATONIC_SCALE.length);
  return PENTATONIC_SCALE[Math.min(index, PENTATONIC_SCALE.length - 1)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kandinsky/scale.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kandinsky/scale.ts src/lib/kandinsky/scale.test.ts
git commit -m "feat: pentatonic Y-to-pitch mapping for music mode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 3: Add the `tone` dependency and the lazy audio engine

**Files:**
- Modify: `package.json` (add `tone` to dependencies)
- Create: `src/lib/kandinsky/audio.ts`

**Interfaces:**
- Consumes: `ShapeClass` from `./classify`.
- Produces:
  - `type PaletteId = 'A' | 'B'`
  - `async function loadAudioEngine(): Promise<void>`
  - `function startAudioContext(): void` — call inside the toggle click.
  - `function playShapeSound(shape: ShapeClass, note: string, palette: PaletteId): void`

No unit test: this module wraps Tone.js audio I/O and is verified by running the app (Task 7). Keep it thin so the testable logic stays in Tasks 1–2.

- [ ] **Step 1: Install Tone.js**

Run: `npm install tone`
Expected: `tone` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Write the audio engine**

```typescript
// src/lib/kandinsky/audio.ts
import type * as ToneNS from 'tone';
import type { ShapeClass } from './classify';

export type PaletteId = 'A' | 'B';

// Per-shape instruments. Percussion (triangle) is unpitched; the rest take a note.
type ShapeInstruments = Record<ShapeClass, { triggerAttackRelease: (...args: never[]) => unknown }>;

let Tone: typeof ToneNS | null = null;
let engines: Record<PaletteId, ShapeInstruments> | null = null;

/**
 * Lazily import Tone.js and build both instrument palettes. Idempotent. Does
 * NOT start the audio context (must happen in a user gesture — see
 * startAudioContext).
 */
export async function loadAudioEngine(): Promise<void> {
  if (Tone) return;
  const mod = await import('tone');
  Tone = mod;

  engines = {
    A: {
      line: new mod.PolySynth(mod.Synth, { oscillator: { type: 'triangle' }, envelope: { release: 0.6 } }).toDestination(),
      freeform: new mod.PolySynth(mod.Synth, { oscillator: { type: 'sawtooth' }, envelope: { release: 0.5 } }).toDestination(),
      circle: new mod.PolySynth(mod.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.1, release: 0.8 } }).toDestination(),
      square: new mod.PolySynth(mod.Synth, { oscillator: { type: 'square' }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.2, release: 0.1 } }).toDestination(),
      triangle: new mod.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.08, sustain: 0 } }).toDestination(),
    } as unknown as ShapeInstruments,
    B: {
      line: new mod.PolySynth(mod.FMSynth, { modulationIndex: 3, envelope: { release: 0.4 } }).toDestination(),
      freeform: new mod.PolySynth(mod.FMSynth, { envelope: { release: 0.4 } }).toDestination(),
      circle: new mod.PolySynth(mod.AMSynth, { harmonicity: 2, envelope: { attack: 0.1, release: 1 } }).toDestination(),
      square: new mod.PolySynth(mod.Synth, { oscillator: { type: 'pulse' }, envelope: { attack: 0.01, release: 0.1 } }).toDestination(),
      triangle: new mod.MembraneSynth({ envelope: { attack: 0.001, decay: 0.1, sustain: 0 } }).toDestination(),
    } as unknown as ShapeInstruments,
  };
}

/** Resume the audio context. Call from inside a user-gesture handler. */
export function startAudioContext(): void {
  if (Tone && Tone.context.state !== 'running') {
    void Tone.start();
  }
}

/** Play one shape's note. No-op if the engine hasn't finished loading. */
export function playShapeSound(shape: ShapeClass, note: string, palette: PaletteId): void {
  if (!engines) return;
  const inst = engines[palette][shape] ?? engines[palette].line;
  if (shape === 'triangle') {
    (inst.triggerAttackRelease as (dur: string) => unknown)('16n');
  } else {
    (inst.triggerAttackRelease as (note: string, dur: string) => unknown)(note, '8n');
  }
}
```

- [ ] **Step 3: Verify the project still type-checks and builds**

Run: `npm run build`
Expected: build succeeds; `tone` is code-split (only loaded via dynamic import). If TS complains about Tone option types, keep the `as unknown as ShapeInstruments` casts — the instrument objects only need `triggerAttackRelease` here.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/kandinsky/audio.ts
git commit -m "feat: lazy Tone.js audio engine with two palettes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 4: `useMusicMode` hook

**Files:**
- Create: `src/hooks/useMusicMode.ts`
- Test: `src/hooks/useMusicMode.test.ts`

**Interfaces:**
- Consumes: `classifyShape` (Task 1), `pitchForY` (Task 2), `loadAudioEngine`/`startAudioContext`/`playShapeSound`/`PaletteId` (Task 3), `Stroke` from `../types`.
- Produces:
```typescript
interface MusicMode {
  enabled: boolean;
  playing: boolean;
  palette: PaletteId;
  playheadX: number;       // current sweep x, 0 when idle
  toggleMusicMode: () => void;   // lazy-loads engine + starts context, then flips enabled
  cyclePalette: () => void;
  togglePlayback: (strokes: Stroke[], canvasWidth: number) => void;
  handleStrokeEnd: (stroke: Stroke, canvasHeight: number) => void;
  stop: () => void;
}
function useMusicMode(): MusicMode
```

Behavior tested in isolation (audio mocked): toggle lazily loads then enables; `handleStrokeEnd` no-ops when disabled and plays when enabled; `cyclePalette` flips A↔B. The rAF sweep + interval trigger are verified by running the app (Task 7), not unit-tested.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/hooks/useMusicMode.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const loadAudioEngine = vi.fn().mockResolvedValue(undefined);
const startAudioContext = vi.fn();
const playShapeSound = vi.fn();

vi.mock('../lib/kandinsky/audio', () => ({
  loadAudioEngine: (...a: unknown[]) => loadAudioEngine(...a),
  startAudioContext: (...a: unknown[]) => startAudioContext(...a),
  playShapeSound: (...a: unknown[]) => playShapeSound(...a),
}));

import { useMusicMode } from './useMusicMode';
import type { Stroke } from '../types';

function lineStroke(): Stroke {
  return {
    id: 'x',
    color: '#fff',
    size: 4,
    points: Array.from({ length: 30 }, (_, i) => ({ x: i * 5, y: i * 5, pressure: 0.5, t: 0 })),
  };
}

describe('useMusicMode', () => {
  beforeEach(() => {
    loadAudioEngine.mockClear();
    startAudioContext.mockClear();
    playShapeSound.mockClear();
  });

  it('starts disabled and silent', () => {
    const { result } = renderHook(() => useMusicMode());
    expect(result.current.enabled).toBe(false);
    result.current.handleStrokeEnd(lineStroke(), 600);
    expect(playShapeSound).not.toHaveBeenCalled();
  });

  it('toggling lazily loads the engine, starts the context, and enables', async () => {
    const { result } = renderHook(() => useMusicMode());
    await act(async () => {
      result.current.toggleMusicMode();
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(loadAudioEngine).toHaveBeenCalledTimes(1);
    expect(startAudioContext).toHaveBeenCalledTimes(1);
  });

  it('plays a note on stroke end while enabled', async () => {
    const { result } = renderHook(() => useMusicMode());
    await act(async () => {
      result.current.toggleMusicMode();
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    act(() => result.current.handleStrokeEnd(lineStroke(), 600));
    expect(playShapeSound).toHaveBeenCalledTimes(1);
    expect(playShapeSound).toHaveBeenCalledWith('line', expect.any(String), 'A');
  });

  it('cyclePalette flips A <-> B', async () => {
    const { result } = renderHook(() => useMusicMode());
    expect(result.current.palette).toBe('A');
    act(() => result.current.cyclePalette());
    expect(result.current.palette).toBe('B');
    act(() => result.current.cyclePalette());
    expect(result.current.palette).toBe('A');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useMusicMode.test.ts`
Expected: FAIL — cannot find module `./useMusicMode`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/hooks/useMusicMode.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyShape } from '../lib/kandinsky/classify';
import { pitchForY } from '../lib/kandinsky/scale';
import {
  loadAudioEngine,
  startAudioContext,
  playShapeSound,
  type PaletteId,
} from '../lib/kandinsky/audio';
import type { Stroke } from '../types';

/** One shape queued for the Play sweep. */
interface SweepShape {
  type: ReturnType<typeof classifyShape>['type'];
  minX: number;
  note: string;
}

/** Full canvas sweep duration in ms. */
const SWEEP_MS = 4000;

export function useMusicMode() {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<PaletteId>('A');
  const [playheadX, setPlayheadX] = useState(0);

  const paletteRef = useRef<PaletteId>('A');
  paletteRef.current = palette;

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const headRef = useRef(0);
  const sweepRef = useRef<SweepShape[]>([]);
  const widthRef = useRef(1);

  const toggleMusicMode = useCallback(() => {
    if (enabled) {
      setEnabled(false);
      setPlaying(false);
      setPlayheadX(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    // Enabling: load engine, then start the context inside this gesture.
    void loadAudioEngine().then(() => {
      startAudioContext();
      setEnabled(true);
    });
  }, [enabled]);

  const cyclePalette = useCallback(() => {
    setPalette((p) => (p === 'A' ? 'B' : 'A'));
  }, []);

  const handleStrokeEnd = useCallback(
    (stroke: Stroke, canvasHeight: number) => {
      if (!enabled) return;
      const c = classifyShape(stroke.points);
      const note = pitchForY(c.centerY, canvasHeight);
      playShapeSound(c.type, note, paletteRef.current);
    },
    [enabled],
  );

  const stop = useCallback(() => {
    setPlaying(false);
    setPlayheadX(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
  }, []);

  const loop = useCallback((ts: number) => {
    if (lastTsRef.current == null) lastTsRef.current = ts;
    const delta = ts - lastTsRef.current;
    lastTsRef.current = ts;

    const width = widthRef.current;
    const speed = width / SWEEP_MS;
    const prev = headRef.current;
    let next = prev + speed * delta;
    const wrapped = next >= width;
    if (wrapped) next -= width;
    headRef.current = next;

    // Interval trigger: fire any shape whose minX is in [prev, next).
    for (const s of sweepRef.current) {
      const hit = wrapped
        ? s.minX >= prev || s.minX < next // crossed the right edge
        : s.minX >= prev && s.minX < next;
      if (hit) playShapeSound(s.type, s.note, paletteRef.current);
    }

    setPlayheadX(next);
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const togglePlayback = useCallback(
    (strokes: Stroke[], canvasWidth: number, canvasHeight: number) => {
      if (playing) {
        stop();
        return;
      }
      widthRef.current = Math.max(1, canvasWidth);
      sweepRef.current = strokes.map((st) => {
        const c = classifyShape(st.points);
        return { type: c.type, minX: c.minX, note: pitchForY(c.centerY, canvasHeight) };
      });
      headRef.current = 0;
      lastTsRef.current = null;
      setPlaying(true);
      rafRef.current = requestAnimationFrame(loop);
    },
    [playing, stop, loop],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    enabled,
    playing,
    palette,
    playheadX,
    toggleMusicMode,
    cyclePalette,
    togglePlayback,
    handleStrokeEnd,
    stop,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useMusicMode.test.ts`
Expected: PASS (4 tests). jsdom has no rAF timing concerns here because the sweep isn't exercised by these tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMusicMode.ts src/hooks/useMusicMode.test.ts
git commit -m "feat: useMusicMode hook (live notes + playhead sweep)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 5: Add an `onStrokeEnd` callback to `useDrawing`

**Files:**
- Modify: `src/hooks/useDrawing.ts` (options interface + pen-commit branch in `endGesture`, ~lines 30-36 and 666-668)

**Interfaces:**
- Produces: `UseDrawingOptions` gains `onStrokeEnd?: (stroke: Stroke) => void`, fired immediately after a pen stroke commits to history.

No new unit test — covered by existing `useDrawing`/`App` tests (must stay green) and exercised live in Task 7.

- [ ] **Step 1: Add the option to the interface**

In `src/hooks/useDrawing.ts`, extend `UseDrawingOptions`:

```typescript
interface UseDrawingOptions {
  tool: Tool;
  color: string;
  size: number;
  paper: PaperStyle;
  /** localStorage key for this document's strokes. */
  storageKey?: string;
  /** Fired the moment a pen stroke commits — used for live music feedback. */
  onStrokeEnd?: (stroke: Stroke) => void;
}
```

- [ ] **Step 2: Destructure it in the hook signature**

Add `onStrokeEnd` to the destructured params of `useDrawing({ ... })`.

- [ ] **Step 3: Mirror it in a ref so the gesture handler reads the latest**

Just below the existing `settingsRef` mirror, add:

```typescript
  const onStrokeEndRef = useRef<UseDrawingOptions['onStrokeEnd']>(onStrokeEnd);
  onStrokeEndRef.current = onStrokeEnd;
```

- [ ] **Step 4: Fire it at the pen-commit point**

In `endGesture`, in the `// ── pen ──` branch, right after `strokesRef.current = next;` (currently line ~668):

```typescript
      const next = [...strokesRef.current, live];
      history.set(next);
      strokesRef.current = next;
      onStrokeEndRef.current?.(live);
```

- [ ] **Step 5: Verify existing tests still pass and it builds**

Run: `npm test && npm run build`
Expected: all existing tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDrawing.ts
git commit -m "feat: onStrokeEnd callback in useDrawing for music feedback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 6: Toolbar controls (music toggle, play, palette)

**Files:**
- Modify: `src/components/Toolbar.tsx` (props + a new control group)
- Modify: `src/components/icons.tsx` (add `MusicIcon`, `PlayIcon`, `StopIcon` — match existing icon style)

**Interfaces:**
- Consumes: `PaletteId` from `../lib/kandinsky/audio`.
- Produces: `ToolbarProps` gains:
```typescript
  musicMode: boolean;
  onToggleMusic: () => void;
  playing: boolean;
  onPlayToggle: () => void;
  palette: PaletteId;
  onCyclePalette: () => void;
```

- [ ] **Step 1: Add the three icons**

In `src/components/icons.tsx`, add (same 24×24 stroke style as existing icons):

```tsx
export function MusicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export function PlayIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function StopIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
```

- [ ] **Step 2: Extend ToolbarProps and destructure**

Add the six props above to `ToolbarProps`, and destructure them in `Toolbar(props)`.

- [ ] **Step 3: Add a music control group inside `controls`**

Add this just before the closing `</>` of the `controls` fragment (after the export buttons), so it sits at the end of the pill:

```tsx
      <Divider />
      <IconButton
        label={musicMode ? 'Turn music mode off' : 'Turn music mode on'}
        active={musicMode}
        onClick={onToggleMusic}
      >
        <MusicIcon />
      </IconButton>
      {musicMode && (
        <>
          <IconButton
            label={playing ? 'Stop' : 'Play soundscape'}
            active={playing}
            disabled={isEmpty}
            onClick={onPlayToggle}
          >
            {playing ? <StopIcon /> : <PlayIcon />}
          </IconButton>
          <button
            type="button"
            title={`Sound palette ${palette} — tap to switch`}
            aria-label={`Sound palette ${palette}, tap to switch`}
            onClick={onCyclePalette}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/[0.06]"
          >
            <span
              className="h-5 w-5 rounded-full border border-border-strong"
              style={{
                background:
                  palette === 'A'
                    ? 'linear-gradient(90deg, #22c55e 50%, #3b82f6 50%)'
                    : 'linear-gradient(90deg, #a855f7 50%, #ec4899 50%)',
              }}
            />
          </button>
        </>
      )}
```

- [ ] **Step 4: Update the icon import line**

Add `MusicIcon, PlayIcon, StopIcon` to the existing import from `./icons`.

- [ ] **Step 5: Build to verify types/markup**

Run: `npm run build`
Expected: succeeds. (Workspace doesn't pass the new props yet, so TS will error there — that's expected and fixed in Task 7. If you want a clean build at this step, make the six props optional with defaults; otherwise proceed to Task 7 which wires them.)

- [ ] **Step 6: Commit**

```bash
git add src/components/Toolbar.tsx src/components/icons.tsx
git commit -m "feat: music-mode toolbar controls (toggle, play, palette)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

### Task 7: Wire music mode into Workspace + playhead overlay

**Files:**
- Modify: `src/components/Workspace.tsx` (use the hook, pass `onStrokeEnd`, pass toolbar props, render the playhead)

**Interfaces:**
- Consumes: `useMusicMode` (Task 4), the `onStrokeEnd` option (Task 5), the new `Toolbar` props (Task 6).

- [ ] **Step 1: Add imports**

At the top of `Workspace.tsx`, add the hook import and include `Stroke` in the types import (replace the existing `../types` import line):

```tsx
import { useMusicMode } from '../hooks/useMusicMode';
import type { PaperStyle, PenSize, Stroke, TextItem, Tool } from '../types';
```

- [ ] **Step 2: Instantiate the hook and wire `onStrokeEnd`**

Ordering matters: `music` and the height ref must be declared BEFORE `useDrawing`, because the `onStrokeEnd` closure reads them. The closure references the ref (not `drawing`), so there's no use-before-declare cycle.

Replace the existing `const drawing = useDrawing({...});` and `const recognition = useRecognition();` region with:

```tsx
  const music = useMusicMode();
  const canvasHeightRef = useRef(0);

  const drawing = useDrawing({
    tool,
    color,
    size,
    paper,
    storageKey: inkKey(documentId),
    onStrokeEnd: (stroke: Stroke) => {
      music.handleStrokeEnd(stroke, canvasHeightRef.current || window.innerHeight);
    },
  });
  const recognition = useRecognition();
```

- [ ] **Step 3: Keep the canvas height ref current**

Add this effect (canvas size is owned by `useDrawing`'s DPR sizing, so read `clientHeight`):

```tsx
  useEffect(() => {
    const update = () => {
      canvasHeightRef.current =
        drawing.canvasRef.current?.clientHeight ?? window.innerHeight;
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [drawing.canvasRef]);
```

- [ ] **Step 4: Pass the music props to `<Toolbar>`**

Add to the `<Toolbar ... />` element:

```tsx
        musicMode={music.enabled}
        onToggleMusic={music.toggleMusicMode}
        playing={music.playing}
        onPlayToggle={() => {
          const el = drawing.canvasRef.current;
          music.togglePlayback(
            drawing.strokes,
            el?.clientWidth ?? window.innerWidth,
            el?.clientHeight ?? window.innerHeight,
          );
        }}
        palette={music.palette}
        onCyclePalette={music.cyclePalette}
```

- [ ] **Step 5: Render the playhead overlay**

Just before `<BrandFooter />` near the end of the returned JSX:

```tsx
      {music.enabled && music.playing && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-brand-400/80"
          style={{ left: `${music.playheadX}px` }}
        />
      )}
```

- [ ] **Step 6: Type-check, build, and run the full suite**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 7: Manual verification (run the app)**

Run: `npm run dev`, open the app, then:
- Toggle the music note button → it activates (engine loads).
- Draw a line, a circle, a triangle, a square → each makes a distinct sound; higher strokes sound higher-pitched.
- Press Play → a vertical bar sweeps left→right, shapes fire as it passes them, and it loops.
- Tap the bi-color palette button → sounds change character; the swatch colors flip.
- Toggle music off → Play/palette controls disappear, no sound on drawing.

- [ ] **Step 8: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat: wire Kandinsky music mode into the workspace

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q3ixpzJiHpxPNQJD4LgTVH"
```

---

## Notes for the implementer

- **Triangle/square corner count** (Task 1) is the one spot most likely to need a small tweak. Trust the test fixtures: if a clean triangle classifies as `square`, adjust the `corners` comparison and the RDP epsilon factor together until all five fixtures pass. Do not loosen the tests to match a wrong implementation.
- **Latency** (Task 5): firing `onStrokeEnd` synchronously at the commit point is deliberate — keep it synchronous so the note plays the instant the pen lifts.
- **Frame drops** (Task 4): the `[prev, next)` interval check (with wrap handling) is what prevents missed notes; do not change it to an exact-position match.
