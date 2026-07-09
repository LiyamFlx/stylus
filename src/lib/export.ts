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

/** Render to a PNG Blob — the shareable unit (navigator.share needs bytes,
 *  not a triggered download). */
export function buildPNGBlob(strokes: Stroke[], opts: ExportOptions): Promise<Blob> {
  const canvas = renderToCanvas(strokes, opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
      'image/png',
    );
  });
}

/** Download the drawing as a PNG. */
export function exportPNG(strokes: Stroke[], opts: ExportOptions): void {
  const canvas = renderToCanvas(strokes, opts);
  triggerDownload(canvas.toDataURL('image/png'), `stylus-${timestamp()}.png`);
}

function buildSinglePagePDF(strokes: Stroke[], opts: ExportOptions): jsPDF {
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
  return pdf;
}

/** Render to a PDF Blob (share path). */
export function buildPDFBlob(strokes: Stroke[], opts: ExportOptions): Blob {
  return buildSinglePagePDF(strokes, opts).output('blob');
}

/** Download the drawing as a single-page PDF sized to the canvas. */
export function exportPDF(strokes: Stroke[], opts: ExportOptions): void {
  buildSinglePagePDF(strokes, opts).save(`stylus-${timestamp()}.pdf`);
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
  const pdf = buildPagesPDF(pages);
  if (pdf) pdf.save(`stylus-${timestamp()}.pdf`);
}

/** Multi-page PDF as a Blob (share path). Null for zero pages. */
export function buildPDFPagesBlob(pages: ExportPage[]): Blob | null {
  return buildPagesPDF(pages)?.output('blob') ?? null;
}

function buildPagesPDF(pages: ExportPage[]): jsPDF | null {
  if (pages.length === 0) return null;
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

  return pdf;
}

// ─── Markdown / plain-text export (Quick Note Phase 4) ──────────────────────
//
// Text-only exports: ink has no textual representation, so these serialize
// the document's TEXT BOXES only, top-to-bottom by Y position (reading
// order), each box becoming one paragraph. Markdown preserves bold/italic as
// **/*_ syntax; plain text drops all formatting to raw characters.

function sortedByReadingOrder(texts: TextItem[]): TextItem[] {
  return [...texts].filter((t) => t.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Wrap `text` in the Markdown syntax for this box's bold/italic — applied
 *  per-line so multi-line boxes don't get one giant emphasis run spanning
 *  blank lines. */
function markdownEmphasis(text: string, item: TextItem): string {
  if (!item.bold && !item.italic) return text;
  const wrap = item.bold && item.italic ? '***' : item.bold ? '**' : '*';
  return text
    .split('\n')
    .map((line) => (line.trim() ? `${wrap}${line}${wrap}` : line))
    .join('\n');
}

function buildMarkdown(texts: TextItem[]): string {
  return sortedByReadingOrder(texts)
    .map((t) => markdownEmphasis(t.text, t))
    .join('\n\n');
}

function buildPlainText(texts: TextItem[]): string {
  return sortedByReadingOrder(texts)
    .map((t) => t.text)
    .join('\n\n');
}

function triggerTextDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/** Download the document's text boxes as a Markdown (.md) file. */
export function exportMarkdown(texts: TextItem[]): void {
  triggerTextDownload(buildMarkdown(texts), `stylus-${timestamp()}.md`, 'text/markdown');
}

/** Markdown as a Blob (share path). */
export function buildMarkdownBlob(texts: TextItem[]): Blob {
  return new Blob([buildMarkdown(texts)], { type: 'text/markdown' });
}

/** Download the document's text boxes as a plain-text (.txt) file. */
export function exportText(texts: TextItem[]): void {
  triggerTextDownload(buildPlainText(texts), `stylus-${timestamp()}.txt`, 'text/plain');
}

/** Plain text as a Blob (share path). */
export function buildTextBlob(texts: TextItem[]): Blob {
  return new Blob([buildPlainText(texts)], { type: 'text/plain' });
}
