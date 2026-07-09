import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FindReplacePanel } from './FindReplacePanel';
import type { TextItem } from '../types';

const items: TextItem[] = [
  { id: 'a', x: 0, y: 0, text: 'buy milk and bread', color: '#fff', size: 16 },
  { id: 'b', x: 0, y: 0, text: 'call the milkman', color: '#fff', size: 16 },
];

describe('FindReplacePanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <FindReplacePanel open={false} texts={items} onReplaceAll={() => {}} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('counts matches across all text items, case-insensitively', async () => {
    render(<FindReplacePanel open texts={items} onReplaceAll={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Find'), 'MILK');
    expect(screen.getByText('2 matches')).toBeInTheDocument();
  });

  it('replace all rewrites every occurrence across items in one call', async () => {
    const onReplaceAll = vi.fn();
    render(<FindReplacePanel open texts={items} onReplaceAll={onReplaceAll} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Find'), 'milk');
    await userEvent.type(screen.getByLabelText('Replace with'), 'juice');
    await userEvent.click(screen.getByText('Replace all'));

    expect(onReplaceAll).toHaveBeenCalledTimes(1);
    const next = onReplaceAll.mock.calls[0][0] as TextItem[];
    expect(next.find((i) => i.id === 'a')?.text).toBe('buy juice and bread');
    expect(next.find((i) => i.id === 'b')?.text).toBe('call the juiceman');
  });

  it('replace (single) only rewrites the current match', async () => {
    const onReplaceAll = vi.fn();
    render(<FindReplacePanel open texts={items} onReplaceAll={onReplaceAll} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Find'), 'milk');
    await userEvent.type(screen.getByLabelText('Replace with'), 'juice');
    await userEvent.click(screen.getByText('Replace'));

    const next = onReplaceAll.mock.calls[0][0] as TextItem[];
    expect(next.find((i) => i.id === 'a')?.text).toBe('buy juice and bread');
    expect(next.find((i) => i.id === 'b')?.text).toBe('call the milkman');
  });

  it('disables replace/next when there are no matches', () => {
    render(<FindReplacePanel open texts={items} onReplaceAll={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Next')).toBeDisabled();
    expect(screen.getByText('Replace')).toBeDisabled();
    expect(screen.getByText('Replace all')).toBeDisabled();
  });
});
