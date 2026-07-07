import { logger } from '../shared/logger';

const SOURCE_TIMEOUT_MS = 4000;

export type LyricsHit = { text: string; source: string };

async function fromLrclibGet(artist: string, title: string): Promise<string | undefined> {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { plainLyrics?: unknown };
  return typeof data.plainLyrics === 'string' && data.plainLyrics.trim() !== ''
    ? data.plainLyrics
    : undefined;
}

async function fromLrclibSearch(artist: string, title: string): Promise<string | undefined> {
  const url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { plainLyrics?: unknown }[];
  const first = data.find(
    (d) => typeof d.plainLyrics === 'string' && (d.plainLyrics as string).trim() !== '',
  );
  return first?.plainLyrics as string | undefined;
}

async function fromLyricsOvh(artist: string, title: string): Promise<string | undefined> {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { lyrics?: unknown };
  return typeof data.lyrics === 'string' && data.lyrics.trim() !== '' ? data.lyrics : undefined;
}

export function dedupeIfDoubled(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length < 20 || words.length % 2 !== 0) return text;
  const half = words.length / 2;
  const normHalf = (w: string[]): string => w.join(' ').toLowerCase();
  if (normHalf(words.slice(0, half)) === normHalf(words.slice(half))) {
    return words.slice(0, half).join(' ');
  }
  return text;
}

const SOURCES: ReadonlyArray<
  readonly [string, (artist: string, title: string) => Promise<string | undefined>]
> = [
  ['lrclib:get', fromLrclibGet],
  ['lrclib:search', fromLrclibSearch],
  ['lyrics.ovh', fromLyricsOvh],
];

export async function fetchLyrics(
  pairs: ReadonlyArray<readonly [string, string]>,
): Promise<LyricsHit | undefined> {
  const attempts = pairs.flatMap(([artist, title], pairIndex) =>
    SOURCES.map(([source, fn], sourceIndex) => ({
      source,
      priority: sourceIndex * 10 + pairIndex,
      promise: fn(artist, title).catch((err: unknown) => {
        logger.warn('Lyrics source failed', { source, artist, title, error: String(err) });
        return undefined;
      }),
    })),
  );

  for (const attempt of [...attempts].sort((a, b) => a.priority - b.priority)) {
    const text = await attempt.promise;
    if (text !== undefined) {
      return { text: dedupeIfDoubled(text), source: attempt.source };
    }
  }
  return undefined;
}

export function countWords(text: string): number {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}
