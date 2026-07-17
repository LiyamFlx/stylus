/**
 * Compose a finished ColoZoo page into a shareable PNG — its own compositor,
 * kept out of lib/export.ts (which only knows strokes, not zone fills + SVG
 * outlines). Rebuilds the same three-layer stack the workspace shows:
 *   scene background + zone fills (SVG) → freehand ink (canvas) → outlines (SVG)
 *
 * Browser-only (canvas + SVG-image decode); resolves null where unsupported so
 * callers degrade gracefully instead of throwing.
 */

import type { ColoringPage } from './types';
import { shareFile } from '../share';

const XMLNS = 'http://www.w3.org/2000/svg';

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export interface SavePageArgs {
  page: ColoringPage;
  /** zoneId → hex for this page. */
  fills: Record<string, string>;
  /** The live ink canvas; its strokes are stretched into the page frame. */
  inkCanvas: HTMLCanvasElement | null;
  glow?: boolean;
}

/** Build a PNG blob of the page, or null if the platform can't render it. */
export async function buildColozooPageBlob({
  page,
  fills,
  inkCanvas,
  glow,
}: SavePageArgs): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const parts = page.viewBox.split(/\s+/).map(Number);
  const W = Math.round(parts[2] || 800);
  const H = Math.round(parts[3] || 600);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Opaque page background so the PNG isn't transparent.
  ctx.fillStyle = glow ? '#120818' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 1 — scene background + filled zones, rendered from the page's own SVG.
  const zonesSvg = page.zones
    .filter((z) => fills[z.id])
    .map((z) => `<path d="${z.path}" fill="${fills[z.id]}"/>`)
    .join('');
  const baseSvg = `<svg xmlns="${XMLNS}" viewBox="${page.viewBox}" width="${W}" height="${H}">${page.backgroundSvg ?? ''}${zonesSvg}</svg>`;
  try {
    ctx.drawImage(await svgToImage(baseSvg), 0, 0, W, H);
  } catch {
    // best-effort — a missing layer just means a plainer keepsake
  }

  // 2 — freehand ink. The on-screen canvas fills its container while the SVG
  // letterboxes; stretching to the page frame keeps it a faithful-enough
  // keepsake without reprojecting every point.
  if (inkCanvas) {
    try {
      ctx.drawImage(inkCanvas, 0, 0, W, H);
    } catch {
      // ignore — ink is optional in the export
    }
  }

  // 3 — outlines on top (kept dark for a printable page, even in glow mode).
  // Dot-marker pages carry a raster outline (outlineImg) — draw it natively;
  // SVG-as-image can't load external refs, so it must not ride in outlinesSvg.
  if (page.outlineImg) {
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = page.outlineImg!;
      });
      ctx.drawImage(img, 0, 0, W, H);
    } catch {
      // ignore
    }
  } else {
    const outlineSvg = `<svg xmlns="${XMLNS}" viewBox="${page.viewBox}" width="${W}" height="${H}">${page.outlinesSvg}</svg>`;
    try {
      ctx.drawImage(await svgToImage(outlineSvg), 0, 0, W, H);
    } catch {
      // ignore
    }
  }

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
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Save/share a finished page. Tries the native share sheet first (save to
 * Photos / send to grandma), falling back to a download. Must be called
 * straight from a user gesture (iOS share-gesture rule).
 */
export async function saveColozooPage(args: SavePageArgs): Promise<boolean> {
  const blob = await buildColozooPageBlob(args);
  if (!blob) return false;
  const filename = `colozoo-${args.page.id}.png`;
  const shared = await shareFile(blob, filename, 'My ColoZoo picture');
  if (!shared) download(blob, filename);
  return true;
}
