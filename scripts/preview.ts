import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchSong } from '../src/worker/itunes';
import { countWords, fetchLyrics } from '../src/worker/lyrics';
import { topKeywords } from '../src/worker/keywords';
import { StubProvider } from '../src/worker/ai/stub';
import { buildComicSvg } from '../src/worker/comic/svg';
import type { SongContext } from '../src/worker/ai/provider';

const [artistInput = 'The Beatles', titleInput = 'Let It Be', outDir = '.'] =
  process.argv.slice(2);

async function main(): Promise<void> {
  const match = await searchSong(artistInput, titleInput);
  const artist = match?.artistName ?? artistInput;
  const title = match?.trackName ?? titleInput;
  const pairs: (readonly [string, string])[] = [[artist, title]];
  if (artist !== artistInput || title !== titleInput) pairs.push([artistInput, titleInput]);
  const lyricsHit = await fetchLyrics(pairs);
  const lyrics = lyricsHit?.text;
  console.log(`lyrics source: ${lyricsHit?.source ?? 'none'}`);
  const wordCount = lyrics !== undefined ? countWords(lyrics) : 0;
  const keywords = lyrics !== undefined ? topKeywords(lyrics) : [];

  const ctx: SongContext = {
    artistInput,
    titleInput,
    wordCount,
    keywords,
    ...(match !== undefined ? { match } : {}),
    ...(lyrics !== undefined ? { lyrics } : {}),
  };
  const stub = new StubProvider();

  const result = {
    runId: 'preview',
    appId: 'preview',
    artists: { singers: [artist], producers: [] },
    song: {
      title,
      ...(match?.releaseDate !== undefined ? { releaseDate: match.releaseDate.slice(0, 10) } : {}),
      ...(match?.collectionName !== undefined ? { album: match.collectionName } : {}),
    },
    wordCount,
    summary: await stub.summarize(ctx),
    comicImageUrl: '(siehe comic.svg)',
  };

  console.log(JSON.stringify(result, null, 2));
  mkdirSync(outDir, { recursive: true });
  const svgPath = join(outDir, 'comic.svg');
  writeFileSync(svgPath, buildComicSvg(ctx), 'utf8');
  console.log(`comic written to ${svgPath}`);
}

void main();
