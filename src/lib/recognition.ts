import Tesseract, { PSM } from 'tesseract.js';
import type { Stroke } from '../types';
import { RecognitionError } from './recognitionError';
import { inkBounds, type Bounds } from './geometry';

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
const PADDING = 40;
/**
 * Minimum rendered ink thickness (in the *scaled* OCR image). Handwriting OCR
 * wants solid, bold glyphs — thin lines get lost during binarization. This is
 * deliberately larger than the on-screen MIN_STROKE_WIDTH.
 */
const OCR_MIN_STROKE = 10;
/** Luma threshold (0–255) for binarizing the rasterized ink to pure B/W. */
const BINARIZE_THRESHOLD = 200;

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
    workerPromise = Tesseract.createWorker(OCR_LANG)
      .then(async (worker) => {
        // Treat the canvas as a single block of text (a word or a few lines)
        // rather than a full multi-column page — the default PSM assumes page
        // layout and badly mis-segments a lone word on a big empty canvas.
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        });
        return worker;
      })
      .catch((err) => {
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
    // Bold, uniform glyphs read best. Render in *image* pixels (divide by scale
    // because the context is already scaled) so thickness is consistent
    // regardless of how much the ink was scaled up.
    const width = Math.max(stroke.size, OCR_MIN_STROKE / scale);
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

  binarize(ctx, canvas.width, canvas.height);
  return canvas;
}

/**
 * Threshold the rasterized image to pure black-on-white. Anti-aliased grey
 * edges (from round caps / smoothed curves) blur the glyph boundaries the OCR
 * binarizer keys off; snapping every pixel to black or white sharpens them.
 */
function binarize(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Perceptual luma; ink is black so dark pixels → 0, paper → 255.
    const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = luma < BINARIZE_THRESHOLD ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
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
    return { text: cleanup(data.text) };
  } catch (err) {
    throw new RecognitionError(
      `Recognition failed: ${(err as Error).message}`,
      'failed',
    );
  }
}

/**
 * Tidy Tesseract's raw output: collapse the runs of blank lines and stray
 * spaces it tends to emit, and drop a trailing form-feed, without disturbing
 * intentional line breaks.
 */
function cleanup(raw: string): string {
  return raw
    .replace(/\f/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
