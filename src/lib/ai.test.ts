import { describe, it, expect } from 'vitest';
import { refineLabel, REFINE_ACTIONS } from './ai';

describe('refineLabel', () => {
  it('labels the studio chip actions', () => {
    expect(refineLabel('polish')).toBe('Polish');
    expect(refineLabel('summarize')).toBe('Summarize');
  });

  it('labels the selection-toolbar actions that are not studio chips', () => {
    expect(refineLabel('ask')).toBe('Ask Stylus');
    expect(refineLabel('translate')).toBe('Translate');
  });

  it('does not surface ask/translate as studio refine chips', () => {
    const keys = REFINE_ACTIONS.map((a) => a.key);
    expect(keys).not.toContain('ask');
    expect(keys).not.toContain('translate');
  });
});
