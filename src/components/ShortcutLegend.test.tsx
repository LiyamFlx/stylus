import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutLegend } from './ShortcutLegend';

describe('ShortcutLegend', () => {
  it('is hidden until ? is pressed', () => {
    render(<ShortcutLegend />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on ? and closes on Escape', () => {
    render(<ShortcutLegend />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles closed on a second ? press', () => {
    render(<ShortcutLegend />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on backdrop click and via the close button', () => {
    render(<ShortcutLegend />);
    fireEvent.keyDown(window, { key: '?' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: '?' });
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open when ? is pressed while typing in a text field', () => {
    render(
      <div>
        <input aria-label="Find" />
        <ShortcutLegend />
      </div>,
    );
    const input = screen.getByLabelText('Find');
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the real shortcuts, not placeholders', () => {
    render(<ShortcutLegend />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('⌘Z / Ctrl+Z')).toBeInTheDocument();
    expect(screen.getByText('Pen')).toBeInTheDocument();
    expect(screen.getByText('P or B')).toBeInTheDocument();
  });
});
