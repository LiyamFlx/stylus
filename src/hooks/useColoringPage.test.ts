import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColoringPage } from './useColoringPage';
import { COLOZOO_BOOKS } from '../lib/colozoo/books';

const book = COLOZOO_BOOKS[0];
const zoneId = book.pages[0].zones[0].id;

beforeEach(() => localStorage.clear());

describe('useColoringPage clearZone + redo', () => {
  it('clearZone removes a fill; redo re-applies an undone fill', () => {
    const { result } = renderHook(() => useColoringPage('doc-test', book.id));
    act(() => result.current.fillZone(zoneId, '#EF5B5B'));
    expect(result.current.fills[zoneId]).toBe('#EF5B5B');

    act(() => result.current.clearZone(zoneId));
    expect(result.current.fills[zoneId]).toBeUndefined();

    // undo the clear -> fill returns
    act(() => { result.current.undoFill(); });
    expect(result.current.fills[zoneId]).toBe('#EF5B5B');

    // undo the fill -> gone; redo -> back
    act(() => { result.current.undoFill(); });
    expect(result.current.fills[zoneId]).toBeUndefined();
    expect(result.current.canRedo).toBe(true);
    act(() => { result.current.redoFill(); });
    expect(result.current.fills[zoneId]).toBe('#EF5B5B');
  });

  it('a new fill clears the redo stack', () => {
    const { result } = renderHook(() => useColoringPage('doc-test2', book.id));
    act(() => result.current.fillZone(zoneId, '#4A90E2'));
    act(() => { result.current.undoFill(); });
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.fillZone(zoneId, '#FBD24E'));
    expect(result.current.canRedo).toBe(false);
  });
});
