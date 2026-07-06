import { jsPDF } from 'jspdf';
import type { PaperStyle, RulingDensity, Stroke, TextItem } from '../types';
import { A4_BOUNDS } from './geometry';
import { renderAll } from './render';

/** Draw the placed text boxes onto the export context. */
function drawTexts(ctx: CanvasRenderingContext2D, texts: TextItem[]): void {
  ctx.textBaseline = 'top';
  for (const t of texts) {
    if (!t.text) continue;
    ctx.fillStyle = t.color;
    ctx.font = `${t.size}px Inter, system-ui, sans-serif`;
    const lineHeight = t.size * 1.2;
    t.text.split('\n').forEach((line, i) => {
      ctx.fillText(line, t.x, t.y + i * lineHeight);
    });
  }
}

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
  /** Paper guide to bake into the export. Defaults to none. */
  paper?: PaperStyle;
  /** Text boxes to bake into the export. */
  texts?: TextItem[];
  /** Pixel-density multiplier for the rendered bitmap. */
  scale?: number;
  /** Line spacing for 'notebook' paper. */
  ruling?: RulingDensity;
}

function renderToCanvas(
  strokes: Stroke[],
  {
    width,
    height,
    background = '#0a0a0a',
    paper = 'blank',
    texts = [],
    scale = 2,
    ruling,
  }: ExportOptions,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for export');

  ctx.scale(scale, scale);
  // renderAll applies the opaque background (after its clear) and the paper
  // guide, then the strokes — so the export matches what's on screen.
  // EXPORT PATH — intentionally NO `cull` option: exports need the complete
  // document, never the visible viewport (see RenderOptions.cull).
  renderAll(ctx, strokes, width, height, { paper, background, ruling });
  drawTexts(ctx, texts);
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

/** One notebook page bound for export. */
export interface ExportPage {
  strokes: Stroke[];
  paper: PaperStyle;
  texts?: TextItem[];
  ruling?: RulingDensity;
}

/**
 * Multi-page, true-A4 PDF export (Phase 1 item 9). One PDF page per notebook
 * page, 210×297mm portrait. The page's world rect is A4_BOUNDS (794×1123 CSS
 * px at 96dpi), rendered at 2× and scaled to physical millimetres — so ink
 * lands on paper exactly where it sat on the page.
 *
 * Additive overload of the export surface: single-page `exportPDF` keeps its
 * exact signature for canvas/mobile docs.
 *
 * Callers pass FULL stroke arrays (loaded from storage for unmounted pages) —
 * never anything that went through a culled read path.
 */
export function exportPDFPages(pages: ExportPage[]): void {
  if (pages.length === 0) return;
  const pageW = A4_BOUNDS.maxX - A4_BOUNDS.minX;
  const pageH = A4_BOUNDS.maxY - A4_BOUNDS.minY;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage('a4', 'portrait');
    const canvas = renderToCanvas(page.strokes, {
      width: pageW,
      height: pageH,
      paper: page.paper,
      ruling: page.ruling,
      texts: page.texts ?? [],
      // Notebook paper paints its own opaque cream; other papers export on
      // white like a printed page rather than the dark screen background.
      background: '#ffffff',
      scale: 2,
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
  });

  pdf.save(`stylus-${timestamp()}.pdf`);
}
