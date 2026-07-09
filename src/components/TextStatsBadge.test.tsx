import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextStatsBadge } from './TextStatsBadge';
import type { TextItem } from '../types';

const item = (text: string): TextItem => ({ id: 't', x: 0, y: 0, text, color: '#fff', size: 16 });

describe('TextStatsBadge', () => {
  it('renders nothing when there are no words', () => {
    const { container } = render(<TextStatsBadge texts={[item('   ')]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows word, character, and reading-time counts', () => {
    render(<TextStatsBadge texts={[item('hello world')]} />);
    expect(screen.getByText('2 words')).toBeInTheDocument();
    expect(screen.getByText('1 min read')).toBeInTheDocument();
  });
});
