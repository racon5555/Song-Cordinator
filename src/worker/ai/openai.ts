import type { AiProvider, ComicImage, SongContext } from './provider';
import { logger } from '../../shared/logger';

function describeSong(ctx: SongContext): string {
  const title = ctx.match?.trackName ?? ctx.titleInput;
  const artist = ctx.match?.artistName ?? ctx.artistInput;
  const parts = [`Song: "${title}" von ${artist}`];
  if (ctx.match?.collectionName !== undefined) parts.push(`Album: ${ctx.match.collectionName}`);
  if (ctx.match?.releaseDate !== undefined) parts.push(`Release: ${ctx.match.releaseDate.slice(0, 10)}`);
  if (ctx.keywords.length > 0) parts.push(`Häufige Wörter im Text: ${ctx.keywords.join(', ')}`);
  return parts.join('\n');
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey: string) {}

  async summarize(ctx: SongContext): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'Du beschreibst Songinhalte. Antworte mit einer kurzen deutschen ' +
              'Inhaltsbeschreibung (2-3 knappe Sätze) des Songs: Worum geht es, ' +
              'welche Stimmung. Keine Aufzählung, nur Fließtext.',
          },
          { role: 'user', content: describeSong(ctx) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`OpenAI chat completion failed with HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text === undefined || text === '') throw new Error('OpenAI returned an empty summary');
    return text;
  }

  async comicImage(ctx: SongContext): Promise<ComicImage> {
    const title = ctx.match?.trackName ?? ctx.titleInput;
    const artist = ctx.match?.artistName ?? ctx.artistInput;
    const genre = ctx.match?.primaryGenreName;
    const prompt =
      `Eine Comic-Seite mit genau 4 klar getrennten Panels (2x2-Raster mit Rahmen), ` +
      `die als Bildergeschichte den Inhalt des Songs "${title}" von ${artist} erzählt: ` +
      `Anfang, Konflikt, Wendepunkt, Auflösung. ` +
      (genre !== undefined ? `Genre: ${genre}. ` : '') +
      (ctx.keywords.length > 0 ? `Zentrale Motive: ${ctx.keywords.slice(0, 4).join(', ')}. ` : '') +
      `Wichtig: keine realen Personen oder Musiker, keine Logos, keine Albumcover, ` +
      `kein lesbarer Songtext, keine Schrift im Bild. Flacher, freundlicher Comic-Stil.`;

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        quality: 'low',
        output_format: 'jpeg',
        output_compression: 80,
        n: 1,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      throw new Error(`OpenAI image generation failed with HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (b64 === undefined || b64 === '') throw new Error('OpenAI returned no image data');
    const bytes = Buffer.from(b64, 'base64');
    logger.info('OpenAI comic image generated', { bytes: bytes.length });
    return { bytes, contentType: 'image/jpeg' };
  }
}
