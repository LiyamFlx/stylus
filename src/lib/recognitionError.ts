export type RecognitionErrorCode = 'empty' | 'failed';

/**
 * Error type for handwriting recognition, in its own module so importing it
 * (e.g. for an `instanceof` check) doesn't pull in the heavy OCR engine.
 */
export class RecognitionError extends Error {
  constructor(message: string, readonly code: RecognitionErrorCode) {
    super(message);
    this.name = 'RecognitionError';
  }
}
