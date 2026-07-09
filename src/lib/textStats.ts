import type { TextItem } from '../types';

export interface TextStats {
  characters: number;
  words: number;
  sentences: number;
  /** Rounded up so "30 seconds of text" still reads as "1 min", never "0 min". */
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 200;

/** Live counters (Quick Note Phase 3 — "characters, words, sentences,
 *  reading time") over every text box's combined content. */
export function computeTextStats(items: TextItem[]): TextStats {
  const combined = items.map((i) => i.text).join('\n');
  const trimmed = combined.trim();

  const characters = combined.length;
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  // Count terminators, but a trailing chunk of prose with no punctuation
  // still counts as one sentence rather than zero.
  const terminators = trimmed.match(/[.!?]+/g)?.length ?? 0;
  const sentences = trimmed ? Math.max(terminators, 1) : 0;
  const readingMinutes = words ? Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) : 0;

  return { characters, words, sentences, readingMinutes };
}
