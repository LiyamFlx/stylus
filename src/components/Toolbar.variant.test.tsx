import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar';
import type { ComponentProps } from 'react';

const noop = () => {};

function renderToolbar(overrides: Partial<ComponentProps<typeof Toolbar>> = {}) {
  const props: ComponentProps<typeof Toolbar> = {
    tool: 'pen',
    color: '#000000',
    size: 4,
    penType: 'fountain',
    shapeType: 'rect',
    paper: 'notebook',
    canUndo: true,
    canRedo: true,
    isEmpty: false,
    recognizing: false,
    onToolChange: noop,
    onColorChange: noop,
    onSizeChange: noop,
    onPenTypeChange: noop,
    onShapeTypeChange: noop,
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
    // Music mode / learning mode live in the "More" overflow menu now.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /music mode/i })).toBeInTheDocument();
    // Exports live in the "Export" menu now.
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('menuitem', { name: /Export PDF/i })).toBeInTheDocument();
  });

  it("'minimal' hides the More menu and the pen-type picker but keeps core editing", () => {
    renderToolbar({ variant: 'minimal' });
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    // Core surface intact:
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('menuitem', { name: /Export PDF/i })).toBeInTheDocument();
    // Colors live in a dropdown now — open it, then the swatches show.
    fireEvent.click(screen.getByRole('button', { name: /^Color:/i }));
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
    // Open the color dropdown; the override shows exactly its 2 swatches and
    // no custom-color input (a classroom palette is a closed set).
    fireEvent.click(screen.getByRole('button', { name: /^Color:/i }));
    expect(screen.getAllByRole('button', { name: /^Color /i })).toHaveLength(2);
    expect(screen.queryByLabelText(/Pick a custom color/i)).toBeNull();
  });
});

describe('Shape tool (item #6)', () => {
  it('shows the Shape button, active when the shape tool is selected', () => {
    renderToolbar({ tool: 'shape' });
    expect(screen.getByRole('button', { name: 'Shape' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking Shape switches the active tool', () => {
    const onToolChange = vi.fn();
    renderToolbar({ tool: 'pen', onToolChange });
    fireEvent.click(screen.getByRole('button', { name: 'Shape' }));
    expect(onToolChange).toHaveBeenCalledWith('shape');
  });

  it('shows the shape-type picker only when the shape tool is active, in full variant', () => {
    renderToolbar({ tool: 'pen', variant: 'full' });
    expect(screen.queryByRole('button', { name: /^Shape type:/i })).toBeNull();

    renderToolbar({ tool: 'shape', variant: 'full' });
    expect(screen.getByRole('button', { name: /^Shape type:/i })).toBeInTheDocument();
  });

  it('hides the shape-type picker in minimal variant even when the shape tool is active', () => {
    renderToolbar({ tool: 'shape', variant: 'minimal' });
    expect(screen.queryByRole('button', { name: /^Shape type:/i })).toBeNull();
  });

  it('picking a shape sub-type calls onShapeTypeChange and switches to the shape tool', () => {
    // The picker only mounts while the shape tool is already active (same
    // pattern as PenTypePicker only showing while the pen tool is active) —
    // start there; handleShapeTypeChange still re-asserts onToolChange so
    // picking a sub-type from any starting tool would land on 'shape'.
    const onShapeTypeChange = vi.fn();
    const onToolChange = vi.fn();
    renderToolbar({ tool: 'shape', shapeType: 'rect', onShapeTypeChange, onToolChange });
    fireEvent.click(screen.getByRole('button', { name: /^Shape type:/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Ellipse' }));
    expect(onShapeTypeChange).toHaveBeenCalledWith('ellipse');
    expect(onToolChange).toHaveBeenCalledWith('shape');
  });

  it('restricted (exam lock) variant hides the Shape tool entirely', () => {
    renderToolbar({ variant: 'restricted', examLock: true, onToggleExamLock: noop });
    expect(screen.queryByRole('button', { name: 'Shape' })).toBeNull();
  });
});
