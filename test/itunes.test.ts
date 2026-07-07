import { describe, expect, it } from 'vitest';
import { normalize, pickBestTrack, similarity, type ItunesTrack } from '../src/worker/itunes';

describe('normalize', () => {
  it('lowercases, strips diacritics and punctuation', () => {
    expect(normalize('Beyoncé!')).toBe('beyonce');
    expect(normalize('  Let It Be (Remastered 2009) ')).toBe('let it be remastered 2009');
  });
});

describe('similarity', () => {
  it('is 1 for identical strings after normalization', () => {
    expect(similarity('Let It Be', 'let it be')).toBe(1);
  });

  it('tolerates missing articles and extra suffixes', () => {
    expect(similarity('Beatles', 'The Beatles')).toBeGreaterThanOrEqual(0.5);
    expect(similarity('Let It Be', 'Let It Be (Remastered)')).toBeGreaterThanOrEqual(0.5);
  });

  it('is low for unrelated strings', () => {
    expect(similarity('Let It Be', 'Bohemian Rhapsody')).toBeLessThan(0.3);
  });
});

describe('pickBestTrack', () => {
  const tracks: ItunesTrack[] = [
    { artistName: 'The Beatles Tribute Band', trackName: 'Let It Be (Karaoke Version)' },
    { artistName: 'The Beatles', trackName: 'Let It Be', collectionName: 'Let It Be', releaseDate: '1970-03-06T08:00:00Z' },
    { artistName: 'The Beatles', trackName: 'Let It Be (Remastered 2009)' },
  ];

  it('prefers the exact original over covers and remasters', () => {
    const best = pickBestTrack(tracks, 'The Beatles', 'Let It Be');
    expect(best?.trackName).toBe('Let It Be');
    expect(best?.collectionName).toBe('Let It Be');
  });

  it('handles sloppy input (fuzzy tolerance)', () => {
    const best = pickBestTrack(tracks, 'beatles', 'let it be');
    expect(best?.artistName).toBe('The Beatles');
  });

  it('returns undefined for an empty candidate list', () => {
    expect(pickBestTrack([], 'x', 'y')).toBeUndefined();
  });
});
