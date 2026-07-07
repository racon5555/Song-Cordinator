import { describe, expect, it } from 'vitest';
import { topKeywords } from '../src/worker/keywords';

describe('topKeywords', () => {
  it('ranks by frequency and drops stopwords', () => {
    const text = 'Mother Mary comes to me, speaking words of wisdom, let it be. ' +
      'Mother Mary, wisdom, wisdom.';
    const keywords = topKeywords(text, 3);
    expect(keywords[0]).toBe('wisdom');
    expect(keywords).toContain('mother');
    expect(keywords).not.toContain('let');
    expect(keywords).not.toContain('the');
  });

  it('returns empty array for empty text', () => {
    expect(topKeywords('')).toEqual([]);
  });
});
