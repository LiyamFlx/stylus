import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TourController } from '../hooks/useTour';
import { TOUR_STEPS } from '../lib/tourSteps';
import { fireConfetti } from '../lib/confetti';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

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
  // The step id the current `rect` was measured for. Guards against the
  // previous step's stale measurement leaking into the first render of the next
  // step (which would otherwise auto-skip a perfectly valid target).
  const [measuredFor, setMeasuredFor] = useState<string | null>(null);
  const firedRef = useRef(false);
  const skipRef = useRef(false);

  // Measure the current target (and re-measure on resize/scroll).
  useLayoutEffect(() => {
    if (!active || !step) return;
    skipRef.current = false;
    if (!step.target) {
      setRect(null);
      setMeasuredFor(step.id);
      return;
    }
    const measure = () => {
      setRect(findTarget(step.target!));
      setMeasuredFor(step.id);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, step]);

  // If a targeted step resolves to no visible element AFTER measuring THIS step,
  // advance past it once. The measuredFor === step.id check prevents acting on a
  // prior step's stale rect during the transition render.
  useEffect(() => {
    if (!active || !step || !step.target) return;
    if (measuredFor === step.id && rect === null && !skipRef.current) {
      skipRef.current = true;
      next();
    }
  }, [active, step, measuredFor, rect, next]);

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
                  className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Start tour
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Targeted step: render nothing until THIS step is measured (the effect will
  // skip it if the target turns out to be absent).
  if (measuredFor !== step.id || !rect) return null;

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
      <div className="absolute inset-x-0 bg-black/60" style={{ top: ringTop + ringH, bottom: 0 }} />
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
          boxShadow: '0 0 24px 4px rgba(231,111,44,0.7)',
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
              className="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
