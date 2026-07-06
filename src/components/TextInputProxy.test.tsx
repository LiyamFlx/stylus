import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextInputProxy } from './TextInputProxy';

describe('TextInputProxy (IME-safe text entry)', () => {
  it('emits full-value changes — composed/autocorrected input arrives intact', () => {
    const onChange = vi.fn();
    render(<TextInputProxy value="hell" onChange={onChange} onDone={() => {}} />);
    const ta = screen.getByTestId('text-input-proxy');
    fireEvent.change(ta, { target: { value: 'héllo 世界 🎉' } });
    expect(onChange).toHaveBeenCalledWith('héllo 世界 🎉');
  });

  it('focuses itself on mount (what summons the mobile keyboard)', () => {
    render(<TextInputProxy value="" onChange={() => {}} onDone={() => {}} />);
    expect(document.activeElement).toBe(screen.getByTestId('text-input-proxy'));
  });

  it('Escape finishes editing; typing keys are NOT synthesized', () => {
    const onDone = vi.fn();
    const onChange = vi.fn();
    render(<TextInputProxy value="" onChange={onChange} onDone={onDone} />);
    const ta = screen.getByTestId('text-input-proxy');
    fireEvent.keyDown(ta, { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
