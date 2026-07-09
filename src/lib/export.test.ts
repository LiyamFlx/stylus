import { describe, it, expect } from 'vitest';
import { buildMarkdownBlob, buildTextBlob } from './export';
import type { TextItem } from '../types';

const item = (overrides: Partial<TextItem> = {}): TextItem => ({
  id: 't',
  x: 0,
  y: 0,
  text: 'hello',
  color: '#fff',
  size: 16,
  ...overrides,
});

// jsdom's Blob implements neither .text() nor .arrayBuffer() — FileReader is
// the one Blob-reading API jsdom does support.
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('buildMarkdownBlob / buildTextBlob', () => {
  it('joins text boxes in top-to-bottom reading order, not array order', async () => {
    const texts = [item({ id: 'b', y: 100, text: 'second' }), item({ id: 'a', y: 0, text: 'first' })];
    expect(await readBlob(buildMarkdownBlob(texts))).toBe('first\n\nsecond');
  });

  it('drops empty/whitespace-only boxes', async () => {
    const texts = [item({ text: 'real' }), item({ text: '   ' }), item({ text: '' })];
    expect(await readBlob(buildMarkdownBlob(texts))).toBe('real');
  });

  it('wraps bold text in ** per non-blank line', async () => {
    const texts = [item({ text: 'line one\nline two', bold: true })];
    expect(await readBlob(buildMarkdownBlob(texts))).toBe('**line one**\n**line two**');
  });

  it('wraps italic text in * and bold+italic in ***', async () => {
    expect(await readBlob(buildMarkdownBlob([item({ text: 'x', italic: true })]))).toBe('*x*');
    expect(
      await readBlob(buildMarkdownBlob([item({ text: 'x', bold: true, italic: true })])),
    ).toBe('***x***');
  });

  it('plain text export ignores bold/italic entirely', async () => {
    const texts = [item({ text: 'x', bold: true, italic: true })];
    expect(await readBlob(buildTextBlob(texts))).toBe('x');
  });

  it('produces an empty string for no text boxes', async () => {
    expect(await readBlob(buildMarkdownBlob([]))).toBe('');
    expect(await readBlob(buildTextBlob([]))).toBe('');
  });
});
