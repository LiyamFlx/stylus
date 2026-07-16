import { describe, it, expect, beforeEach } from 'vitest';
import type { Stroke } from '../../types';
import {
  colozooInkKey,
  colozooStateKey,
  emptyColozooState,
  purgeColozooKeys,
  readColozooInk,
  readColozooState,
  writeColozooInk,
  writeColozooState,
} from './storage';

const stroke = (id: string): Stroke => ({
  id,
  color: '#EF4444',
  size: 3.5,
  penType: 'czDaub',
  points: [{ x: 10, y: 10, pressure: 0.5, t: 0 }],
});

describe('colozoo storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips document state', () => {
    const state = emptyColozooState('trucks');
    state.pageIndex = 2;
    state.fills = { 'truck-dump': { cab: '#3B82F6' } };
    state.stars = { 'truck-dump': 2 };
    writeColozooState('doc1', state);

    const back = readColozooState('doc1');
    expect(back).toEqual(state);
  });

  it('returns null state for a doc that has none, and [] ink', () => {
    expect(readColozooState('nope')).toBeNull();
    expect(readColozooInk('nope', 'p1')).toEqual([]);
  });

  it('ignores a corrupt/old-version state blob', () => {
    localStorage.setItem(colozooStateKey('doc1'), JSON.stringify({ version: 99 }));
    expect(readColozooState('doc1')).toBeNull();
  });

  it('round-trips per-page ink under its own key', () => {
    writeColozooInk('doc1', 'p1', [stroke('a'), stroke('b')]);
    expect(readColozooInk('doc1', 'p1').map((s) => s.id)).toEqual(['a', 'b']);
    // Different page → independent key.
    expect(readColozooInk('doc1', 'p2')).toEqual([]);
  });

  it('purgeColozooKeys sweeps state AND every per-page ink key for the doc', () => {
    writeColozooState('doc1', emptyColozooState('trucks'));
    writeColozooInk('doc1', 'p1', [stroke('a')]);
    writeColozooInk('doc1', 'p2', [stroke('b')]);
    // A second doc must be left untouched.
    writeColozooState('doc2', emptyColozooState('animals'));
    writeColozooInk('doc2', 'p1', [stroke('c')]);

    purgeColozooKeys('doc1');

    expect(localStorage.getItem(colozooStateKey('doc1'))).toBeNull();
    expect(localStorage.getItem(colozooInkKey('doc1', 'p1'))).toBeNull();
    expect(localStorage.getItem(colozooInkKey('doc1', 'p2'))).toBeNull();
    // doc2 survives.
    expect(readColozooState('doc2')).not.toBeNull();
    expect(readColozooInk('doc2', 'p1').map((s) => s.id)).toEqual(['c']);
  });
});
