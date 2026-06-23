import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useHistory } from './useHistory';

describe('useHistory', () => {
  it('starts with the initial value and no undo/redo available', () => {
    const { result } = renderHook(() => useHistory([1, 2, 3]));
    expect(result.current.present).toEqual([1, 2, 3]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('set() replaces the present and enables undo', () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => result.current.set(1));
    expect(result.current.present).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('set() accepts an updater function', () => {
    const { result } = renderHook(() => useHistory(10));
    act(() => result.current.set((prev) => prev + 5));
    expect(result.current.present).toBe(15);
  });

  it('set() is a no-op when the next value is identical (===) to present', () => {
    const same = { a: 1 };
    const { result } = renderHook(() => useHistory(same));
    act(() => result.current.set(same));
    expect(result.current.present).toBe(same);
    expect(result.current.canUndo).toBe(false); // nothing pushed onto the past
  });

  it('undo() restores the previous value and enables redo', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('b'));
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo() re-applies an undone value', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('b'));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.present).toBe('b');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('walks a multi-step history back and forth', () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.set(3));
    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(result.current.present).toBe(1);
    act(() => result.current.redo());
    expect(result.current.present).toBe(2);
  });

  it('set() after an undo clears the redo (future) stack', () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => result.current.set(1));
    act(() => result.current.undo()); // present 0, future [1]
    act(() => result.current.set(9)); // branching overwrites the future
    expect(result.current.present).toBe(9);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo() at the start of history is a safe no-op', () => {
    const { result } = renderHook(() => useHistory('only'));
    act(() => result.current.undo());
    expect(result.current.present).toBe('only');
    expect(result.current.canUndo).toBe(false);
  });

  it('redo() with an empty future is a safe no-op', () => {
    const { result } = renderHook(() => useHistory('only'));
    act(() => result.current.redo());
    expect(result.current.present).toBe('only');
    expect(result.current.canRedo).toBe(false);
  });

  it('replaceSilently() changes the present without recording history', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('b')); // canUndo true, present 'b'
    act(() => result.current.replaceSilently('c'));
    expect(result.current.present).toBe('c');
    // Still only one entry on the past stack (from the set), none added.
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
  });

  it('reset() seeds a new present and clears both stacks', () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.reset(99));
    expect(result.current.present).toBe(99);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
