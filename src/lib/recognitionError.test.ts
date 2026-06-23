import { describe, it, expect } from 'vitest';
import { RecognitionError } from './recognitionError';

describe('RecognitionError', () => {
  it('is a real Error subclass (so instanceof checks work)', () => {
    const err = new RecognitionError('boom', 'failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RecognitionError);
  });

  it('carries the message, name, and code', () => {
    const err = new RecognitionError('nothing to recognize', 'empty');
    expect(err.message).toBe('nothing to recognize');
    expect(err.name).toBe('RecognitionError');
    expect(err.code).toBe('empty');
  });
});
