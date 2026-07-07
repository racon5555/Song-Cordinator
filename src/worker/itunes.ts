import { logger } from '../shared/logger';

export type ItunesTrack = {
  artistName: string;
  trackName: string;
  collectionName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
};

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === '' || nb === '') return 0;
  if (na === nb) return 1;

  const tokensA = new Set(na.split(' '));
  const tokensB = new Set(nb.split(' '));
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;

  const containment = na.includes(nb) || nb.includes(na) ? 0.3 : 0;
  return Math.min(1, jaccard + containment);
}

export function scoreTrack(track: ItunesTrack, artist: string, title: string): number {
  return 0.5 * similarity(track.artistName, artist) + 0.5 * similarity(track.trackName, title);
}

export function pickBestTrack(
  tracks: ItunesTrack[],
  artist: string,
  title: string,
): ItunesTrack | undefined {
  let best: ItunesTrack | undefined;
  let bestScore = -1;
  for (const track of tracks) {
    const score = scoreTrack(track, artist, title);
    if (score > bestScore) {
      best = track;
      bestScore = score;
    }
  }
  return best;
}

function toTrack(raw: unknown): ItunesTrack | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r['artistName'] !== 'string' || typeof r['trackName'] !== 'string') return undefined;
  return {
    artistName: r['artistName'],
    trackName: r['trackName'],
    ...(typeof r['collectionName'] === 'string' ? { collectionName: r['collectionName'] } : {}),
    ...(typeof r['releaseDate'] === 'string' ? { releaseDate: r['releaseDate'] } : {}),
    ...(typeof r['primaryGenreName'] === 'string'
      ? { primaryGenreName: r['primaryGenreName'] }
      : {}),
  };
}

export async function searchSong(artist: string, title: string): Promise<ItunesTrack | undefined> {
  const term = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=10`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error(`iTunes search failed with HTTP ${res.status}`);
  }
  const data = (await res.json()) as { results?: unknown[] };
  const tracks = (data.results ?? [])
    .map(toTrack)
    .filter((t): t is ItunesTrack => t !== undefined);
  logger.info('iTunes search finished', { artist, title, candidates: tracks.length });
  return pickBestTrack(tracks, artist, title);
}
