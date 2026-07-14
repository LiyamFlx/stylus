import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSwipeNavigation } from './useSwipeNavigation';

// jsdom doesn't implement PointerEvent; the hook only reads clientX/clientY/
// pointerType, so a plain Event carrying those fields is a faithful enough
// stand-in for these DOM-dispatch tests.
function fire(
  el: HTMLElement,
  type: string,
  init: { clientX: number; clientY: number; pointerType?: string },
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number;
    clientY: number;
    pointerType: string;
  };
  event.clientX = init.clientX;
  event.clientY = init.clientY;
  event.pointerType = init.pointerType ?? 'touch';
  el.dispatchEvent(event);
}

function makeEl(width = 400) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('useSwipeNavigation', () => {
  it('does nothing when disabled', () => {
    const el = makeEl();
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: false, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 5, clientY: 100 });
    fire(el, 'pointerup', { clientX: 200, clientY: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('swiping right from the left edge calls onSwipeRight (prev page)', () => {
    const el = makeEl();
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: true, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 5, clientY: 100 });
    fire(el, 'pointerup', { clientX: 200, clientY: 100 });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('swiping left from the right edge calls onSwipeLeft (next page)', () => {
    const el = makeEl(400);
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: true, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 395, clientY: 100 });
    fire(el, 'pointerup', { clientX: 150, clientY: 100 });
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignores gestures that do not start in an edge zone', () => {
    const el = makeEl();
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: true, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 200, clientY: 100 });
    fire(el, 'pointerup', { clientX: 300, clientY: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignores short drags below the minimum distance', () => {
    const el = makeEl();
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: true, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 5, clientY: 100 });
    fire(el, 'pointerup', { clientX: 30, clientY: 100 });
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignores mostly-vertical drags', () => {
    const el = makeEl();
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: true, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 5, clientY: 100 });
    fire(el, 'pointerup', { clientX: 90, clientY: 250 });
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignores pen input — a stylus stroke near the edge must never flip the page', () => {
    // Canvas.tsx captures the pointer on drawing pointerdown, which retargets
    // but doesn't stop bubbling — this listener would otherwise still see the
    // pen's pointerup. Pen must be excluded outright, not raced against.
    const el = makeEl();
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: true, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 5, clientY: 100, pointerType: 'pen' });
    fire(el, 'pointerup', { clientX: 200, clientY: 100, pointerType: 'pen' });
    expect(onSwipeRight).not.toHaveBeenCalled();
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('ignores non-touch pointer types', () => {
    const el = makeEl();
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation({ current: el }, { enabled: true, onSwipeLeft, onSwipeRight }),
    );
    fire(el, 'pointerdown', { clientX: 5, clientY: 100, pointerType: 'mouse' });
    fire(el, 'pointerup', { clientX: 200, clientY: 100 });
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
