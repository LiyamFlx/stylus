import { describe, it, expect } from 'vitest';
import { computeTextStats } from './textStats';
import type { TextItem } from '../types';

const item = (text: string): TextItem => ({ id: 't', x: 0, y: 0, text, color: '#fff', size: 16 });

describe('computeTextStats', () => {
  it('returns all zeros for no text items', () => {
    expect(computeTextStats([])).toEqual({
      characters: 0,
      words: 0,
      sentences: 0,
      readingMinutes: 0,
    });
  });

  it('returns all zeros for blank/whitespace-only items', () => {
    const stats = computeTextStats([item('   '), item('')]);
    expect(stats.words).toBe(0);
    expect(stats.sentences).toBe(0);
    expect(stats.readingMinutes).toBe(0);
  });

  it('counts words across multiple items', () => {
    const stats = computeTextStats([item('hello world'), item('foo bar baz')]);
    expect(stats.words).toBe(5);
  });

  it('counts sentences by terminating punctuation', () => {
    const stats = computeTextStats([item('One. Two! Three?')]);
    expect(stats.sentences).toBe(3);
  });

  it('counts a trailing sentence with no punctuation as one sentence', () => {
    const stats = computeTextStats([item('just some words with no period')]);
    expect(stats.sentences).toBe(1);
  });

  it('rounds reading time up, minimum 1 minute for any content', () => {
    const stats = computeTextStats([item('short text')]);
    expect(stats.readingMinutes).toBe(1);
  });

  it('scales reading time with word count', () => {
    const longText = new Array(401).fill('word').join(' '); // 401 words @ 200wpm
    const stats = computeTextStats([item(longText)]);
    expect(stats.readingMinutes).toBe(3);
  });

  it('counts raw characters including whitespace between items', () => {
    const stats = computeTextStats([item('ab'), item('cd')]);
    expect(stats.characters).toBe(5); // "ab" + "\n" + "cd"
  });
});
