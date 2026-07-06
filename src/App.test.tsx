import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { PAPER_STYLES } from './types';

/**
 * Integration coverage for App's global keyboard shortcuts. The canvas itself
 * is inert in jsdom (no 2D context), but the tool-state wiring driven by the
 * window keydown handler is fully observable via the toolbar's aria-pressed.
 */
// The test env reports as desktop (see test/setup matchMedia stub), so the
// toolbar mounts its single desktop pill with all controls directly visible.
function penButton() {
  return screen.getByRole('button', { name: 'Pen' });
}
function eraserButton() {
  return screen.getByRole('button', { name: 'Eraser' });
}

describe('App keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to the pen tool', () => {
    render(<App />);
    expect(penButton()).toHaveAttribute('aria-pressed', 'true');
    expect(eraserButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('"e" selects the eraser and "p" returns to the pen', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'e' });
    expect(eraserButton()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'p' });
    expect(penButton()).toHaveAttribute('aria-pressed', 'true');
  });

  it('"b" also selects the pen (brush)', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: 'b' });
    expect(penButton()).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores tool hotkeys while typing in an input', () => {
    render(
      <div>
        <input data-testid="field" />
        <App />
      </div>,
    );
    const field = screen.getByTestId('field');
    field.focus();
    fireEvent.keyDown(field, { key: 'e' });
    expect(eraserButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not treat a modified key (Ctrl+E) as a tool hotkey', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    expect(eraserButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the empty-canvas hint on a fresh start', () => {
    render(<App />);
    expect(screen.getByText(/start writing or drawing/i)).toBeInTheDocument();
  });

  it('opens the paper picker and selects a background', () => {
    render(<App />);
    const paperBtn = () => screen.getByRole('button', { name: /^Paper:/ });
    expect(paperBtn()).toHaveAttribute('aria-label', 'Paper: Blank');

    // Opening the picker reveals every paper option.
    fireEvent.click(paperBtn());
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(PAPER_STYLES.length);

    // Selecting one applies it and closes the menu.
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Grid/i }));
    expect(paperBtn()).toHaveAttribute('aria-label', 'Paper: Grid');
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });
});
