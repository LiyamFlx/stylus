import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextPanel } from './TextPanel';

describe('TextPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <TextPanel open={false} status="idle" text="" error={null} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a loading state while recognizing', () => {
    render(
      <TextPanel open status="loading" text="" error={null} onClose={() => {}} />,
    );
    expect(screen.getByText(/recognizing/i)).toBeInTheDocument();
  });

  it('shows the error message on error', () => {
    render(
      <TextPanel open status="error" text="" error="OCR failed" onClose={() => {}} />,
    );
    expect(screen.getByText('OCR failed')).toBeInTheDocument();
  });

  it('shows recognized text on success', () => {
    render(
      <TextPanel open status="success" text="hello world" error={null} onClose={() => {}} />,
    );
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('shows an empty-result hint when success has no text', () => {
    render(
      <TextPanel open status="success" text="" error={null} onClose={() => {}} />,
    );
    expect(screen.getByText(/no text was recognized/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <TextPanel open status="success" text="hi" error={null} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /close panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
