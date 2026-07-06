import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toolbar } from './Toolbar';
import type { ComponentProps } from 'react';

const noop = () => {};

function renderToolbar(overrides: Partial<ComponentProps<typeof Toolbar>> = {}) {
  const props: ComponentProps<typeof Toolbar> = {
    tool: 'pen',
    color: '#000000',
    size: 4,
    penType: 'fountain',
    paper: 'notebook',
    canUndo: true,
    canRedo: true,
    isEmpty: false,
    recognizing: false,
    onToolChange: noop,
    onColorChange: noop,
    onSizeChange: noop,
    onPenTypeChange: noop,
    onPaperSelect: noop,
    onUndo: noop,
    onRedo: noop,
    onClear: noop,
    onRecognize: noop,
    onExportPNG: noop,
    onExportPDF: noop,
    musicMode: false,
    onToggleMusic: noop,
    learningMode: false,
    onToggleLearning: noop,
    playing: false,
    onPlayToggle: noop,
    palette: 'A',
    onCyclePalette: noop,
    ...overrides,
  };
  return render(<Toolbar {...props} />);
}

describe('Toolbar variants (Phase 1 item 7)', () => {
  it("'full' shows the peripheral groups", () => {
    renderToolbar({ variant: 'full' });
    expect(screen.getByRole('button', { name: /music mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeInTheDocument();
  });

  it("'minimal' hides music/learning and the pen-type picker but keeps core editing", () => {
    renderToolbar({ variant: 'minimal' });
    expect(screen.queryByRole('button', { name: /music mode/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Learning Mode/i })).toBeNull();
    // Core surface intact:
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Color /i }).length).toBeGreaterThan(0);
  });

  it("'restricted' (exam lock) renders pen + undo + unlock and nothing else", () => {
    renderToolbar({ variant: 'restricted', examLock: true, onToggleExamLock: noop });
    expect(screen.getByRole('button', { name: 'Pen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exit exam lock/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Eraser/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Clear canvas/i })).toBeNull();
  });

  it('paletteOverride closes the color set (no custom color input)', () => {
    renderToolbar({ paletteOverride: ['#2563eb', '#000000'] });
    expect(screen.getAllByRole('button', { name: /^Color /i })).toHaveLength(2);
    expect(screen.queryByLabelText(/Pick a custom color/i)).toBeNull();
  });
});
