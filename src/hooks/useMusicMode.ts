import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyShape, type ClassifiedShape } from '../lib/kandinsky/classify';
import { pitchForY } from '../lib/kandinsky/scale';
import {
  loadAudioEngine,
  startAudioContext,
  playShapeSound,
  playWelcomeFlourish,
  type PaletteId,
} from '../lib/kandinsky/audio';
import { worldToScreen, type ViewTransform } from '../lib/geometry';
import type { Stroke } from '../types';

/**
 * A shape captured for the melody. Bounds are in WORLD space (matching stroke
 * points), so they stay correct across zoom/pan; the overlay converts to screen
 * at render time. `note` is fixed at draw time from the on-screen vertical
 * position, which is what the user perceives as "high" vs "low".
 */
export interface MelodyShape extends ClassifiedShape {
  id: string;
  note: string;
}

/** Full-viewport sweep duration in ms. */
const SWEEP_MS = 3200;
/** How long a shape stays "lit" after its note fires, in ms. */
const PULSE_MS = 320;

export function useMusicMode() {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<PaletteId>('A');
  /** Playhead position in WORLD x; the overlay converts to screen. */
  const [playheadX, setPlayheadX] = useState(0);
  const [litIds, setLitIds] = useState<ReadonlySet<string>>(new Set());
  const [welcome, setWelcome] = useState(false);
  /** Set when an audio load is in flight or failed, for UI feedback. */
  const [loadError, setLoadError] = useState(false);

  const paletteRef = useRef<PaletteId>('A');
  paletteRef.current = palette;

  // The melody: every shape drawn since the mode was enabled (world-space).
  const melodyRef = useRef<MelodyShape[]>([]);
  const [, forceMelodyTick] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const headRef = useRef(0);
  const sweepStartRef = useRef(0);
  const sweepEndRef = useRef(1);
  const sweepRef = useRef<MelodyShape[]>([]);
  const litUntilRef = useRef<Map<string, number>>(new Map());
  const welcomeTimerRef = useRef<number | null>(null);
  /** Guards against double-toggle while the engine is loading. */
  const loadingRef = useRef(false);

  const stopSweep = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
    setPlaying(false);
    setPlayheadX(0);
    setLitIds(new Set());
    litUntilRef.current.clear();
  }, []);

  const toggleMusicMode = useCallback(() => {
    if (enabled) {
      setEnabled(false);
      setWelcome(false);
      if (welcomeTimerRef.current != null) clearTimeout(welcomeTimerRef.current);
      welcomeTimerRef.current = null;
      melodyRef.current = [];
      stopSweep();
      return;
    }
    if (loadingRef.current) return; // double-tap guard while loading
    loadingRef.current = true;
    setLoadError(false);
    // Enabling: load the engine, start the context inside this gesture, then
    // show the welcome moment with its chord flourish.
    loadAudioEngine()
      .then(() => {
        startAudioContext();
        setEnabled(true);
        setWelcome(true);
        playWelcomeFlourish(paletteRef.current);
        if (welcomeTimerRef.current != null) clearTimeout(welcomeTimerRef.current);
        welcomeTimerRef.current = window.setTimeout(() => {
          setWelcome(false);
          welcomeTimerRef.current = null;
        }, 2200);
      })
      .catch(() => {
        // Offline, stale-chunk 404, or CSP block — surface it instead of a
        // silent dead button.
        setLoadError(true);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [enabled, stopSweep]);

  const cyclePalette = useCallback(() => {
    setPalette((p) => (p === 'A' ? 'B' : 'A'));
  }, []);

  /** rAF sweep over [sweepStart, sweepEnd] in world x: advance the head, fire +
   *  light shapes it crosses, expire stale pulses. Stops (no loop) at the end. */
  const loop = useCallback(
    (ts: number) => {
      const width = sweepEndRef.current - sweepStartRef.current;
      const speed = width / SWEEP_MS;

      let prev: number;
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
        // First frame: open the interval just below the start so a shape sitting
        // exactly at the left edge still fires.
        prev = sweepStartRef.current - 0.001;
      } else {
        prev = headRef.current;
      }
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const next = headRef.current + speed * delta;
      headRef.current = next;

      const atEnd = next >= sweepEndRef.current;
      const windowEnd = atEnd ? sweepEndRef.current + 0.001 : next; // include the last shape

      const nowLit = litUntilRef.current;
      let changed = false;

      for (const s of sweepRef.current) {
        if (s.minX >= prev && s.minX < windowEnd) {
          playShapeSound(s.type, s.note, paletteRef.current);
          nowLit.set(s.id, ts + PULSE_MS);
          changed = true;
        }
      }
      for (const [id, until] of nowLit) {
        if (ts >= until) {
          nowLit.delete(id);
          changed = true;
        }
      }
      if (changed) setLitIds(new Set(nowLit.keys()));

      setPlayheadX(Math.min(next, sweepEndRef.current));

      if (atEnd && nowLit.size === 0) {
        stopSweep();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [stopSweep],
  );

  /** Start a from-the-start sweep across the current viewport in world x. */
  const startSweep = useCallback(
    (shapes: MelodyShape[], view: ViewTransform, screenWidth: number) => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      // Sweep the visible viewport, expressed in world x.
      const startX = view.panX;
      const endX = view.panX + screenWidth / view.scale;
      sweepStartRef.current = startX;
      sweepEndRef.current = Math.max(startX + 1, endX);
      sweepRef.current = [...shapes].sort((a, b) => a.minX - b.minX);
      headRef.current = startX;
      lastTsRef.current = null;
      litUntilRef.current.clear();
      setLitIds(new Set());
      setPlayheadX(startX);
      setPlaying(true);
      rafRef.current = requestAnimationFrame(loop);
    },
    [loop],
  );

  /**
   * A new shape was finished. Play its note once immediately, record it, then
   * replay the whole melody from the start with the sweep. `view` + screen
   * dimensions convert world coords to the on-screen position for pitch.
   */
  const handleStrokeEnd = useCallback(
    (stroke: Stroke, view: ViewTransform, screenWidth: number, screenHeight: number) => {
      if (!enabled) return;
      const c = classifyShape(stroke.points);
      // Pitch from the shape's on-screen vertical position (what the user sees
      // as high/low), not its raw world y.
      const screenCenterY = worldToScreen(c.centerX, c.centerY, view).y;
      const note = pitchForY(screenCenterY, screenHeight);
      // Key the melody entry by the stroke id so syncMelody can drop it when the
      // stroke is later deleted or undone.
      const shape: MelodyShape = { ...c, id: stroke.id, note };

      playShapeSound(shape.type, shape.note, paletteRef.current); // instant feedback
      melodyRef.current = [...melodyRef.current, shape];
      startSweep(melodyRef.current, view, screenWidth);
    },
    [enabled, startSweep],
  );

  /** Manual replay (Play button): sweep the existing melody from the start. */
  const togglePlayback = useCallback(
    (view: ViewTransform, screenWidth: number) => {
      if (playing) {
        stopSweep();
        return;
      }
      if (melodyRef.current.length === 0) return;
      startSweep(melodyRef.current, view, screenWidth);
    },
    [playing, stopSweep, startSweep],
  );

  /** Drop the melody (e.g. when the canvas is cleared). */
  const resetMelody = useCallback(() => {
    melodyRef.current = [];
    forceMelodyTick((n) => n + 1);
    stopSweep();
  }, [stopSweep]);

  /**
   * Reconcile the melody with the strokes still on the canvas. Drops melody
   * entries whose stroke was deleted or undone (no more phantom notes/pulses).
   * Keyed by stroke id, which equals the melody shape's source — see Workspace.
   */
  const syncMelody = useCallback((liveStrokeIds: ReadonlySet<string>) => {
    const before = melodyRef.current.length;
    melodyRef.current = melodyRef.current.filter((s) => liveStrokeIds.has(s.id));
    if (melodyRef.current.length !== before) forceMelodyTick((n) => n + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (welcomeTimerRef.current != null) clearTimeout(welcomeTimerRef.current);
    };
  }, []);

  return {
    enabled,
    playing,
    palette,
    playheadX,
    litIds,
    welcome,
    loadError,
    melody: melodyRef.current,
    toggleMusicMode,
    cyclePalette,
    togglePlayback,
    handleStrokeEnd,
    resetMelody,
    syncMelody,
  };
}
