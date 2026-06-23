import { jsPDF } from 'jspdf';
import type { Stroke } from '../types';
import { renderAll } from './render';

/**
 * Export helpers for the current drawing.
 *
 * Both PNG and PDF render the strokes onto an *offscreen* canvas at a chosen
 * scale rather than reading the visible canvas, so:
 *  - The exported background is opaque (the on-screen canvas is transparent
 *    over a CSS background), and
 *  - We can render at higher DPI than the screen for crisp output.
 */

interface ExportOptions {
  width: number;
  height: number;
  /** Background fill. Defaults to the dark canvas color. */
  background?: string;
  /** Pixel-density multiplier for the rendered bitmap. */
  scale?: number;
}

function renderToCanvas(
  strokes: Stroke[],
  { width, height, background = '#0a0a0a', scale = 2 }: ExportOptions,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for export');

  ctx.scale(scale, scale);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  renderAll(ctx, strokes, width, height);
  return canvas;
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Download the drawing as a PNG. */
export function exportPNG(strokes: Stroke[], opts: ExportOptions): void {
  const canvas = renderToCanvas(strokes, opts);
  triggerDownload(canvas.toDataURL('image/png'), `stylus-${timestamp()}.png`);
}

/** Download the drawing as a single-page PDF sized to the canvas. */
export function exportPDF(strokes: Stroke[], opts: ExportOptions): void {
  const { width, height } = opts;
  const canvas = renderToCanvas(strokes, { ...opts, scale: opts.scale ?? 2 });
  const imgData = canvas.toDataURL('image/png');

  const orientation = width >= height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [width, height],
    compress: true,
  });
  pdf.addImage(imgData, 'PNG', 0, 0, width, height);
  pdf.save(`stylus-${timestamp()}.pdf`);
}
