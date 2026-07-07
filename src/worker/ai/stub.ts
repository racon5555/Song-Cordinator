import type { AiProvider, ComicImage, SongContext } from './provider';
import { buildComicSvg } from '../comic/svg';

export class StubProvider implements AiProvider {
  readonly name = 'stub';

  summarize(ctx: SongContext): Promise<string> {
    const title = ctx.match?.trackName ?? ctx.titleInput;
    const artist = ctx.match?.artistName ?? ctx.artistInput;
    const album = ctx.match?.collectionName;
    const year = ctx.match?.releaseDate?.slice(0, 4);
    const genre = ctx.match?.primaryGenreName;

    const sentences: string[] = [];
    const meta = [year, genre].filter((v): v is string => v !== undefined).join(', ');
    sentences.push(
      `„${title}“ ist ein Song von ${artist}` +
        (album !== undefined ? ` aus dem Album „${album}“` : '') +
        (meta !== '' ? ` (${meta})` : '') +
        '.',
    );
    if (ctx.wordCount > 0) {
      sentences.push(`Der Songtext umfasst ${ctx.wordCount} Wörter.`);
    }
    if (ctx.keywords.length > 0) {
      sentences.push(
        `Wiederkehrende Begriffe wie ${ctx.keywords
          .slice(0, 4)
          .map((k) => `„${k}“`)
          .join(', ')} prägen Stimmung und Thema des Textes.`,
      );
    } else {
      sentences.push('Der Song erzählt seine Geschichte vor allem über Stimmung und Melodie.');
    }
    return Promise.resolve(sentences.join(' '));
  }

  comicImage(ctx: SongContext): Promise<ComicImage> {
    return Promise.resolve({
      bytes: Buffer.from(buildComicSvg(ctx), 'utf8'),
      contentType: 'image/svg+xml',
    });
  }
}
