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
