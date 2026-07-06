import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeTabs } from './ModeTabs';

describe('ModeTabs', () => {
  it('marks the current mode as the selected tab', () => {
    render(<ModeTabs current="notebook" onSwitch={() => {}} onNew={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Notebook' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('switches to the clicked mode', () => {
    const onSwitch = vi.fn();
    render(<ModeTabs current="canvas" onSwitch={onSwitch} onNew={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Quick note' }));
    expect(onSwitch).toHaveBeenCalledWith('mobile');
  });

  it('fires onNew from the New button (distinct from the sidebar action)', () => {
    const onNew = vi.fn();
    render(<ModeTabs current="canvas" onSwitch={() => {}} onNew={onNew} />);
    fireEvent.click(screen.getByRole('button', { name: 'New document in this mode' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
