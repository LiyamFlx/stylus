import { describe, it, expect } from 'vitest';
import { refineLabel, REFINE_ACTIONS } from './ai';

describe('refineLabel', () => {
  it('labels the studio chip actions', () => {
    expect(refineLabel('polish')).toBe('Polish');
    expect(refineLabel('summarize')).toBe('Summarize');
  });

  it('labels Ask Stylus and Translate the same as the selection toolbar', () => {
    // Both are also reachable via Workspace's onAsk/onTranslate one-tap
    // selection-toolbar actions — the label must match everywhere it appears.
    expect(refineLabel('ask')).toBe('Ask Stylus');
    expect(refineLabel('translate')).toBe('Translate');
  });

  it('surfaces ask/translate as studio refine chips, not selection-only', () => {
    const keys = REFINE_ACTIONS.map((a) => a.key);
    expect(keys).toContain('ask');
    expect(keys).toContain('translate');
  });
});
