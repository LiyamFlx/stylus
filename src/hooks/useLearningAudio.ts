import { useCallback, useEffect, useRef, useState } from 'react';
import type { InkPoint } from '../types';
import {
  pointVelocity,
  smoothVelocity,
  brakingIntensity,
} from '../utils/strokeVelocity';
import {
  loadAudioEngine,
  startAudioContext,
  updateBrakeTone,
  releaseBrakeTone,
  disposeBrakeTone,
} from '../lib/kandinsky/audio';

export interface UseLearningAudioResult {
  /** Whether Learning Mode audio is on. */
  enabled: boolean;
  /** Toggle Learning Mode. Lazily loads the shared Tone engine on activation. */
  toggle: () => void;
  /** Feed each captured InkPoint — call from the pen pointermove path. */
  onSample: (point: InkPoint) => void;
  /** Reset velocity smoothing at stroke start. */
  onStrokeStart: () => void;
  /** Silence the braking tone at stroke end. */
  onStrokeEnd: () => void;
  loadError: string | null;
}

/**
 * Learning Mode audio — Velocity Audio-Braking.
 *
 * Reuses the shared Kandinsky Tone.js engine (lazy import + gesture-gated
 * context start) rather than standing up its own. The hot path is entirely
 * ref-driven: `onSample` runs per pointer event with no React state, modulating
 * a single sustained oscillator via `updateBrakeTone`. Session-only, no
 * persistence.
 */
export function useLearningAudio(): UseLearningAudioResult {
  const [enabled, setEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const enabledRef = useRef(false);
  const readyRef = useRef(false); // engine loaded + context startable
  const lastPointRef = useRef<InkPoint | null>(null);
  const smoothedRef = useRef<number | null>(null);

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      enabledRef.current = false;
      setEnabled(false);
      releaseBrakeTone();
      return;
    }
    enabledRef.current = true;
    setEnabled(true);
    setLoadError(null);
    // Load the shared engine, then resume the context inside this gesture.
    loadAudioEngine().then(
      () => {
        if (!enabledRef.current) return; // toggled off mid-load
        startAudioContext();
        readyRef.current = true;
      },
      (err: unknown) => {
        enabledRef.current = false;
        readyRef.current = false;
        setEnabled(false);
        setLoadError(err instanceof Error ? err.message : 'Failed to load audio engine');
      },
    );
  }, []);

  const onStrokeStart = useCallback(() => {
    lastPointRef.current = null;
    smoothedRef.current = null;
  }, []);

  const onSample = useCallback((point: InkPoint) => {
    if (!enabledRef.current || !readyRef.current) return;
    const prev = lastPointRef.current;
    lastPointRef.current = point;
    if (!prev) return;
    const raw = pointVelocity(prev, point);
    const smoothed = smoothVelocity(raw, smoothedRef.current);
    smoothedRef.current = smoothed;
    updateBrakeTone(brakingIntensity(smoothed));
  }, []);

  const onStrokeEnd = useCallback(() => {
    releaseBrakeTone();
    lastPointRef.current = null;
    smoothedRef.current = null;
  }, []);

  // Tear down the synth when the hook unmounts.
  useEffect(() => () => disposeBrakeTone(), []);

  return { enabled, toggle, onSample, onStrokeStart, onStrokeEnd, loadError };
}
