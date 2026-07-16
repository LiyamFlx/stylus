/**
 * Render a finished coloring page to a PNG — its own compositor, isolated from
 * lib/export.ts (which only knows strokes, not zone fills + outline).
 *
 * Composites the exact three-layer stack the workspace shows: zone fills →
 * freehand ink → outline. Zone/outline geometry is drawn with Path2D straight
 * from the same SVG `d` data the page stores, so the export can't drift from
 * what's on screen. Browser-only (Path2D + canvas); returns null where those
 * are unavailable.
 */

import type { Stroke } from '../../types';
import type { ColoringPage } from './types';
import { drawColozooStroke } from './drawStroke';
import { shareFile } from '../share';

const VIEWBOX = 100;

export interface ExportPageOptions {
  fills: Record<string, string>;
  ink: Stroke[];
  /** Output edge length in px (square). */
  size?: number;
  glow?: boolean;
}

/** Draw the page onto a fresh square canvas, or return null if unsupported. */
function paintPage(page: ColoringPage, opts: ExportPageOptions): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  const size = opts.size ?? 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Opaque background (so the PNG isn't transparent), then scale to viewBox.
  ctx.fillStyle = opts.glow ? '#050008' : '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.setTransform(size / VIEWBOX, 0, 0, size / VIEWBOX, 0, 0);

  // 1 — zone fills
  for (const zone of page.zones) {
    const color = opts.fills[zone.id];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fill(new Path2D(zone.d));
  }

  // 2 — freehand ink
  for (const s of opts.ink) drawColozooStroke(ctx, s);

  // 3 — outline (on top)
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.strokeStyle = opts.glow ? '#ffffff' : '#1F2430';
  ctx.lineWidth = 1.1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(page.outline));

  return canvas;
}

/** Build a PNG blob of the page, or null if the platform can't render it. */
export function buildPagePNGBlob(page: ColoringPage, opts: ExportPageOptions): Promise<Blob | null> {
  const canvas = paintPage(page, opts);
  if (!canvas) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click's navigation has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Save/share a finished page. Tries the native share sheet first (phone-native
 * "save to Photos / send it to grandma"), falling back to a file download.
 * Must be called straight from a user gesture (iOS share-gesture rule).
 */
export async function savePagePNG(page: ColoringPage, opts: ExportPageOptions): Promise<boolean> {
  const blob = await buildPagePNGBlob(page, opts);
  if (!blob) return false;
  const filename = `colozoo-${page.id}.png`;
  const shared = await shareFile(blob, filename, page.name);
  if (!shared) download(blob, filename);
  return true;
}
