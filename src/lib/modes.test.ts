import { describe, it, expect } from 'vitest';
import { defaultDocName, effectiveTouchAction, modeConfig, resolveMode } from './modes';

describe('resolveMode / modeConfig (legacy fallback gate)', () => {
  it('falls back to canvas for undefined/garbage', () => {
    expect(resolveMode(undefined)).toBe('canvas');
    expect(resolveMode('bogus')).toBe('canvas');
    expect(modeConfig(null).id).toBe('canvas');
  });
  it('passes valid modes through', () => {
    expect(resolveMode('notebook')).toBe('notebook');
    expect(modeConfig('mobile').id).toBe('mobile');
  });
});

describe('colozoo mode (kids coloring)', () => {
  it('resolves and configs cleanly through the same gate', () => {
    expect(resolveMode('colozoo')).toBe('colozoo');
    expect(modeConfig('colozoo').id).toBe('colozoo');
  });
  it('has its own default document name', () => {
    expect(defaultDocName('colozoo')).toBe('Coloring book');
  });
  it('degrades to a harmless single-array canvas layout if mis-routed', () => {
    // ColozooWorkspace ignores these fields, but they must be safe defaults so
    // a Colozoo doc accidentally routed through <Workspace> never crashes.
    const cfg = modeConfig('colozoo');
    expect(cfg.layout).toBe('infinite');
    expect(cfg.touchActionDefault).toBe('none');
  });
});

describe('effectiveTouchAction (single derivation, Phase 3 contract)', () => {
  it('non-mobile modes are always none — ink owns the gesture', () => {
    expect(effectiveTouchAction('canvas', 'text')).toBe('none');
    expect(effectiveTouchAction('notebook', 'text')).toBe('none');
  });
  it('mobile relaxes ONLY for the typing tool', () => {
    expect(effectiveTouchAction('mobile', 'text')).toBe('manipulation');
    expect(effectiveTouchAction('mobile', 'pen')).toBe('none');
    expect(effectiveTouchAction('mobile', 'eraser')).toBe('none');
    expect(effectiveTouchAction('mobile', 'select')).toBe('none');
  });
});
