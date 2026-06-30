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
