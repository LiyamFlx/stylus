import type { Stroke } from '../types';

/**
 * Handwriting → text using the browser's built-in **Handwriting Recognition
 * API** (`navigator.createHandwritingRecognizer`). On-device, free, no API key.
 *
 * https://developer.chrome.com/docs/web-platform/handwriting-recognition
 *
 * ⚠️  Availability is limited. As of writing, the API ships in Chromium-based
 * browsers (Chrome / Edge) on ChromeOS, Windows, and Linux. It is **not**
 * available in Safari (so not iPad/iOS Safari), not in Firefox, and often not
 * on macOS Chrome. We feature-detect and surface a clear message when it's
 * unavailable rather than failing silently.
 */

/* -------------------------------------------------------------------------- */
/* Ambient types — the API isn't in TypeScript's DOM lib yet, so we declare    */
/* the minimal surface we use, matching the WICG spec.                         */
/* -------------------------------------------------------------------------- */

interface HandwritingPoint {
  x: number;
  y: number;
  t?: number;
}

interface HandwritingStroke {
  addPoint(point: HandwritingPoint): void;
  getPoints(): HandwritingPoint[];
  clear(): void;
}

interface HandwritingPrediction {
  text: string;
}

interface HandwritingDrawing {
  addStroke(stroke: HandwritingStroke): void;
  getPrediction(): Promise<HandwritingPrediction[]>;
  clear(): void;
}

interface HandwritingHints {
  recognitionType?: 'text' | 'email' | 'number' | 'per-character';
  inputType?: 'mouse' | 'stylus' | 'touch';
  alternatives?: number;
  textContext?: string;
}

interface HandwritingRecognizer {
  startDrawing(hints?: HandwritingHints): HandwritingDrawing;
  finish(): void;
}

interface HandwritingModelConstraints {
  languages: string[];
}

interface HandwritingFeatureQuery {
  languages: string[];
  alternatives?: boolean;
}

interface HandwritingQueryResult {
  textAlternatives?: boolean;
  textSegmentation?: boolean;
  hints?: {
    alternatives?: boolean;
    textContext?: boolean;
    inputTypes?: string[];
    recognitionTypes?: string[];
  };
}

interface HandwritingNavigator {
  createHandwritingRecognizer?: (
    constraints: HandwritingModelConstraints,
  ) => Promise<HandwritingRecognizer>;
  queryHandwritingRecognizer?: (
    query: HandwritingFeatureQuery,
  ) => Promise<HandwritingQueryResult | null>;
  // Older Chromium spelling — kept for compatibility.
  queryHandwritingRecognizerSupport?: (
    query: HandwritingFeatureQuery,
  ) => Promise<HandwritingQueryResult | null>;
}

/* -------------------------------------------------------------------------- */

const RECOGNITION_LANGUAGES = ['en'];

export type RecognitionErrorCode =
  | 'unsupported'
  | 'empty'
  | 'failed';

export class RecognitionError extends Error {
  constructor(message: string, readonly code: RecognitionErrorCode) {
    super(message);
    this.name = 'RecognitionError';
  }
}

export interface RecognitionResult {
  text: string;
}

function nav(): HandwritingNavigator {
  return navigator as unknown as HandwritingNavigator;
}

/** True when the browser exposes the Handwriting Recognition API. */
export function isRecognitionSupported(): boolean {
  return typeof nav().createHandwritingRecognizer === 'function';
}

/**
 * Recognize handwriting from the given strokes.
 *
 * @throws {RecognitionError} when the API is unavailable, there's no ink, or
 *         recognition fails. Callers should surface `err.message`.
 */
export async function recognizeText(
  strokes: Stroke[],
): Promise<RecognitionResult> {
  const n = nav();
  if (typeof n.createHandwritingRecognizer !== 'function') {
    throw new RecognitionError(
      'Handwriting recognition isn’t available in this browser. Try Chrome or Edge on desktop (ChromeOS, Windows, or Linux).',
      'unsupported',
    );
  }
  if (strokes.length === 0) {
    throw new RecognitionError('Nothing to recognize — the canvas is empty.', 'empty');
  }

  let recognizer: HandwritingRecognizer;
  try {
    recognizer = await n.createHandwritingRecognizer({
      languages: RECOGNITION_LANGUAGES,
    });
  } catch (err) {
    // A platform may expose the method but have no model for the language.
    throw new RecognitionError(
      `Couldn’t start the handwriting recognizer: ${(err as Error).message}`,
      'unsupported',
    );
  }

  try {
    const drawing = recognizer.startDrawing({
      recognitionType: 'text',
      inputType: 'stylus',
      alternatives: 0,
    });

    // Translate our InkPoint[] into the API's stroke/point objects. We rely on
    // the global HandwritingStroke constructor exposed alongside the API.
    const StrokeCtor = (
      window as unknown as { HandwritingStroke?: new () => HandwritingStroke }
    ).HandwritingStroke;
    if (!StrokeCtor) {
      throw new RecognitionError(
        'Handwriting recognition is partially unavailable in this browser.',
        'unsupported',
      );
    }

    for (const stroke of strokes) {
      const hwStroke = new StrokeCtor();
      for (const p of stroke.points) {
        hwStroke.addPoint({ x: p.x, y: p.y, t: Math.round(p.t) });
      }
      drawing.addStroke(hwStroke);
    }

    const predictions = await drawing.getPrediction();
    recognizer.finish();

    const text = predictions.length > 0 ? predictions[0].text : '';
    return { text };
  } catch (err) {
    if (err instanceof RecognitionError) throw err;
    throw new RecognitionError(
      `Recognition failed: ${(err as Error).message}`,
      'failed',
    );
  }
}
