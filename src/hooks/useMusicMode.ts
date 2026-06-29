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
import type { Stroke } from '../types';

/** A shape captured for the melody, with bounds for the reaction pulse. */
export interface MelodyShape extends ClassifiedShape {
  id: string;
  note: string;
}

/** Full-canvas sweep duration in ms. */
const SWEEP_MS = 3200;
/** How long a shape stays "lit" after its note fires, in ms. */
const PULSE_MS = 320;

function shapeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function useMusicMode() {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<PaletteId>('A');
  const [playheadX, setPlayheadX] = useState(0);
  /** ids of shapes currently lit by the sweep (for the glow+pulse overlay). */
  const [litIds, setLitIds] = useState<ReadonlySet<string>>(new Set());
  /** true while the entry welcome overlay is showing. */
  const [welcome, setWelcome] = useState(false);

  const paletteRef = useRef<PaletteId>('A');
  paletteRef.current = palette;

  // The melody: every shape drawn since the mode was enabled, left-to-right
  // order doesn't matter for storage (the sweep sorts by x at play time).
  const melodyRef = useRef<MelodyShape[]>([]);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const headRef = useRef(0);
  const widthRef = useRef(1);
  /** Sorted (by minX) shapes for the current sweep. */
  const sweepRef = useRef<MelodyShape[]>([]);
  /** id -> timestamp(ms) when its pulse should clear. */
  const litUntilRef = useRef<Map<string, number>>(new Map());

  const stopSweep = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
      melodyRef.current = [];
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      setPlaying(false);
      setPlayheadX(0);
      setLitIds(new Set());
      litUntilRef.current.clear();
      return;
    }
    // Enabling: load engine, start the context inside this gesture, then show
    // the welcome moment with its chord flourish.
    void loadAudioEngine().then(() => {
      startAudioContext();
      setEnabled(true);
      setWelcome(true);
      playWelcomeFlourish(paletteRef.current);
      window.setTimeout(() => setWelcome(false), 2200);
    });
  }, [enabled]);

  const cyclePalette = useCallback(() => {
    setPalette((p) => (p === 'A' ? 'B' : 'A'));
  }, []);

  /** rAF sweep: advance the head, fire+light shapes it crosses, clear stale
   *  pulses. Stops (no loop) once the head passes the right edge. */
  const loop = useCallback((ts: number) => {
    if (lastTsRef.current == null) lastTsRef.current = ts;
    const delta = ts - lastTsRef.current;
    lastTsRef.current = ts;

    const width = widthRef.current;
    const speed = width / SWEEP_MS;
    const prev = headRef.current;
    const next = prev + speed * delta;
    headRef.current = next;

    const nowLit = litUntilRef.current;
    let changed = false;

    // Interval trigger: fire any shape whose minX is in [prev, next).
    for (const s of sweepRef.current) {
      if (s.minX >= prev && s.minX < next) {
        playShapeSound(s.type, s.note, paletteRef.current);
        nowLit.set(s.id, ts + PULSE_MS);
        changed = true;
      }
    }
    // Expire finished pulses.
    for (const [id, until] of nowLit) {
      if (ts >= until) {
        nowLit.delete(id);
        changed = true;
      }
    }
    if (changed) setLitIds(new Set(nowLit.keys()));

    setPlayheadX(Math.min(next, width));

    if (next >= width && nowLit.size === 0) {
      // Sweep done and all pulses faded — stop and wait for the next shape.
      stopSweep();
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [stopSweep]);

  /** Start a from-the-start sweep over the given shapes. */
  const startSweep = useCallback(
    (shapes: MelodyShape[], canvasWidth: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      widthRef.current = Math.max(1, canvasWidth);
      sweepRef.current = [...shapes].sort((a, b) => a.minX - b.minX);
      headRef.current = 0;
      lastTsRef.current = null;
      litUntilRef.current.clear();
      setLitIds(new Set());
      setPlaying(true);
      rafRef.current = requestAnimationFrame(loop);
    },
    [loop],
  );

  /**
   * A new shape was finished. Play its note once immediately, record it in the
   * melody, then replay the whole melody from the start with the sweep.
   */
  const handleStrokeEnd = useCallback(
    (stroke: Stroke, canvasWidth: number, canvasHeight: number) => {
      if (!enabled) return;
      const c = classifyShape(stroke.points);
      const note = pitchForY(c.centerY, canvasHeight);
      const shape: MelodyShape = { ...c, id: shapeId(), note };

      // (a) instant feedback for the shape just drawn.
      playShapeSound(shape.type, shape.note, paletteRef.current);

      // (b) add to the melody and replay from the beginning.
      melodyRef.current = [...melodyRef.current, shape];
      startSweep(melodyRef.current, canvasWidth);
    },
    [enabled, startSweep],
  );

  /** Manual replay (Play button): sweep the existing melody from the start. */
  const togglePlayback = useCallback(
    (canvasWidth: number) => {
      if (playing) {
        stopSweep();
        return;
      }
      if (melodyRef.current.length === 0) return;
      startSweep(melodyRef.current, canvasWidth);
    },
    [playing, stopSweep, startSweep],
  );

  /** Drop the melody (e.g. when the canvas is cleared). */
  const resetMelody = useCallback(() => {
    melodyRef.current = [];
    stopSweep();
  }, [stopSweep]);

  /** Current shapes with their lit state, for the reaction overlay. */
  const shapesForOverlay = useCallback(
    () => melodyRef.current.map((s) => ({ shape: s, lit: litIds.has(s.id) })),
    [litIds],
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
    litIds,
    welcome,
    toggleMusicMode,
    cyclePalette,
    togglePlayback,
    handleStrokeEnd,
    resetMelody,
    shapesForOverlay,
  };
}
