import { describe, expect, it } from 'vitest';
import { countWords, dedupeIfDoubled } from '../src/worker/lyrics';

describe('countWords', () => {
  it('counts plain words', () => {
    expect(countWords('When I find myself in times of trouble')).toBe(8);
  });

  it('ignores [Verse]/[Chorus] markers and bare punctuation', () => {
    expect(countWords('[Chorus]\nLet it be, let it be\n--\n[Outro]')).toBe(6);
  });

  it('returns 0 for empty text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n  ')).toBe(0);
  });
});

describe('dedupeIfDoubled', () => {
  const verse =
    'When I find myself in times of trouble Mother Mary comes to me ' +
    'speaking words of wisdom let it be now';

  it('collapses a text that is repeated twice in full', () => {
    const doubled = `${verse} ${verse}`;
    expect(countWords(dedupeIfDoubled(doubled))).toBe(21);
  });

  it('leaves normal repetitive lyrics untouched', () => {
    expect(dedupeIfDoubled(verse)).toBe(verse);
    const withChorus = `${verse} let it be let it be`;
    expect(dedupeIfDoubled(withChorus)).toBe(withChorus);
  });

  it('leaves short texts untouched', () => {
    expect(dedupeIfDoubled('la la')).toBe('la la');
  });
});
