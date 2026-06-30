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
    act(() => result.current.next());
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
