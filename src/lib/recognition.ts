import Tesseract from 'tesseract.js';
import type { Stroke } from '../types';
import { RecognitionError } from './recognitionError';
import { inkBounds, MIN_STROKE_WIDTH, type Bounds } from './geometry';

/**
 * Handwriting → text using **Tesseract.js** — a WebAssembly OCR engine that
 * runs entirely in the browser. No API key, no account, no backend, no network
 * call to a paid service (model files are fetched once from a CDN and cached).
 *
 * Works in every modern browser, including Safari / iPad — unlike the native
 * Handwriting Recognition API it replaces.
 *
 * Because Tesseract is OCR, it reads a *rendered image* of the ink rather than
 * the pen strokes. So we rasterize the strokes to a clean, high-contrast
 * bitmap (dark ink on white, cropped to the writing, scaled up) which is what
 * OCR engines recognize best. Accuracy is strongest on neat / printed
 * handwriting; very fast cursive is harder. To swap in a cloud recognizer with
 * better cursive accuracy later, only this file changes — its public surface is
 * just `recognizeText()` and `isRecognitionSupported()`.
 */

const OCR_LANG = 'eng';

/** Target height (px) the cropped ink is scaled to before OCR. */
const TARGET_HEIGHT = 240;
/** Whitespace padding around the ink in the rasterized image. */
const PADDING = 32;

export type { RecognitionErrorCode } from './recognitionError';
export { RecognitionError } from './recognitionError';

export interface RecognitionResult {
  text: string;
}

/**
 * Tesseract runs everywhere we support, so recognition is always "available".
 * Kept for API symmetry and so callers can branch without knowing the engine.
 */
export function isRecognitionSupported(): boolean {
  return true;
}

/**
 * Lazily create a single Tesseract worker and reuse it across recognitions.
 * The one-shot `Tesseract.recognize` helper spins up and tears down a worker
 * (and re-inits the language) on every call; a persistent worker makes repeat
 * recognitions much faster. On init failure we drop the cached promise so the
 * next call retries from scratch.
 */
let workerPromise: Promise<Tesseract.Worker> | null = null;

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(OCR_LANG).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/**
 * Rasterize the strokes into a clean black-on-white bitmap, cropped to the ink
 * and scaled so the writing is a consistent, OCR-friendly height. Returns a
 * canvas ready to hand to Tesseract.
 */
function rasterizeForOCR(strokes: Stroke[], bounds: Bounds): HTMLCanvasElement {
  const inkW = bounds.maxX - bounds.minX;
  const inkH = bounds.maxY - bounds.minY;

  // Scale so the ink height hits TARGET_HEIGHT (helps small writing); never
  // upscale absurdly for already-large drawings.
  const scale = Math.min(Math.max(TARGET_HEIGHT / inkH, 1), 4);

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(inkW * scale + PADDING * 2);
  canvas.height = Math.ceil(inkH * scale + PADDING * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new RecognitionError('Could not prepare image for OCR.', 'failed');

  // White background, dark ink — OCR engines expect dark text on light paper.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Map ink-space → image-space: translate the bounding-box origin to the
  // padding offset, then scale.
  ctx.translate(PADDING, PADDING);
  ctx.scale(scale, scale);
  ctx.translate(-bounds.minX, -bounds.minY);

  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    const width = Math.max(stroke.size, MIN_STROKE_WIDTH);
    const pts = stroke.points;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const midX = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }

  return canvas;
}

/**
 * Recognize handwriting from the given strokes via in-browser OCR.
 *
 * @throws {RecognitionError} when there's no ink or OCR fails. Callers should
 *         surface `err.message`.
 */
export async function recognizeText(
  strokes: Stroke[],
): Promise<RecognitionResult> {
  if (strokes.length === 0) {
    throw new RecognitionError('Nothing to recognize — the canvas is empty.', 'empty');
  }

  const bounds = inkBounds(strokes);
  if (!bounds) {
    throw new RecognitionError('Nothing to recognize — the canvas is empty.', 'empty');
  }

  const image = rasterizeForOCR(strokes, bounds);

  try {
    // The worker lazily downloads + caches the language model on first use,
    // then stays warm for subsequent recognitions.
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return { text: data.text.trim() };
  } catch (err) {
    throw new RecognitionError(
      `Recognition failed: ${(err as Error).message}`,
      'failed',
    );
  }
}
