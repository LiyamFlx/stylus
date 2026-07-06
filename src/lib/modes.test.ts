import { describe, it, expect } from 'vitest';
import { effectiveTouchAction, modeConfig, resolveMode } from './modes';

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
