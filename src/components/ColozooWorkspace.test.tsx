import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColozooWorkspace } from './ColozooWorkspace';
import { COLOZOO_BOOKS } from '../lib/colozoo/books';
import { readColozooState } from '../lib/colozoo/storage';

/**
 * Interaction smoke for the coloring workspace. jsdom has no 2D canvas context
 * (freehand ink can't paint here), but the mode's CORE loop — tap a zone → it
 * fills → stars rise → nav/undo — is pure state and fully observable. We
 * polyfill ResizeObserver + a non-zero layout so the stage (and its tappable
 * zones) actually render.
 */

let originalRO: typeof ResizeObserver | undefined;
let rectSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  originalRO = globalThis.ResizeObserver;
  // Immediately fire the observer callback so measure() runs once.
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb([], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // Give every element a 400×400 box so stagePx > 0 and the stage renders.
  rectSpy = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: 400, height: 400, left: 0, top: 0, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
});

afterEach(() => {
  rectSpy.mockRestore();
  globalThis.ResizeObserver = originalRO!;
});

function firstZone(): SVGPathElement {
  const path = document.querySelector('svg path[fill]') as SVGPathElement | null;
  if (!path) throw new Error('no zone path rendered');
  return path;
}

describe('ColozooWorkspace', () => {
  it('renders the first book/page and its palette + brushes', () => {
    render(<ColozooWorkspace documentId="d1" onOpenSidebar={() => {}} />);
    const book = COLOZOO_BOOKS[0];
    expect(screen.getByText(new RegExp(book.pages[0].name))).toBeInTheDocument();
    expect(screen.getByText('Create Happiness')).toBeInTheDocument();
    // Fill bucket is the primary CTA and starts selected.
    expect(screen.getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'true');
    // A brush and a colour are offered.
    expect(screen.getByRole('button', { name: 'Daub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cherry' })).toBeInTheDocument();
  });

  it('tapping a zone in bucket mode fills it and raises the star rating', () => {
    render(<ColozooWorkspace documentId="d1" onOpenSidebar={() => {}} />);
    // Pick a colour, then tap the first zone.
    fireEvent.click(screen.getByRole('button', { name: 'Ocean' })); // #3B82F6
    const zone = firstZone();
    expect(zone.getAttribute('fill')).toBe('transparent');

    fireEvent.pointerDown(zone);
    expect(zone.getAttribute('fill')).toBe('#3B82F6');

    // At least one zone coloured → 1★, and it's persisted.
    expect(screen.getByLabelText(/of 3 stars/)).toHaveAccessibleName('1 of 3 stars');
    const state = readColozooState('d1');
    expect(state?.fills[COLOZOO_BOOKS[0].pages[0].id]).toBeTruthy();
  });

  it('undo reverts the last fill but never lowers earned stars', () => {
    render(<ColozooWorkspace documentId="d1" onOpenSidebar={() => {}} />);
    const zone = firstZone();
    fireEvent.pointerDown(zone);
    expect(zone.getAttribute('fill')).not.toBe('transparent');
    expect(screen.getByLabelText(/of 3 stars/)).toHaveAccessibleName('1 of 3 stars');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(zone.getAttribute('fill')).toBe('transparent');
    // Celebrate-only: the star earned a moment ago stays lit.
    expect(screen.getByLabelText(/of 3 stars/)).toHaveAccessibleName('1 of 3 stars');
  });

  it('switches books and pages', () => {
    render(<ColozooWorkspace documentId="d1" onOpenSidebar={() => {}} />);
    const second = COLOZOO_BOOKS[1];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(second.name) }));
    expect(screen.getByText(new RegExp(second.pages[0].name))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText(new RegExp(second.pages[1].name))).toBeInTheDocument();
    expect(readColozooState('d1')?.bookId).toBe(second.id);
    expect(readColozooState('d1')?.pageIndex).toBe(1);
  });

  it('toggles glow mode', () => {
    render(<ColozooWorkspace documentId="d1" onOpenSidebar={() => {}} />);
    const glow = screen.getByRole('button', { name: 'Glow mode' });
    expect(glow).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(glow);
    expect(glow).toHaveAttribute('aria-pressed', 'true');
    // Glow swaps in the neon palette.
    expect(screen.getByRole('button', { name: 'Neon pink' })).toBeInTheDocument();
  });
});
