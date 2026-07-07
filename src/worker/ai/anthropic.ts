import type { AiProvider, ComicImage, SongContext } from './provider';
import { buildComicSvg } from '../comic/svg';

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  constructor(private readonly apiKey: string) {}

  async summarize(ctx: SongContext): Promise<string> {
    const title = ctx.match?.trackName ?? ctx.titleInput;
    const artist = ctx.match?.artistName ?? ctx.artistInput;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content:
              `Beschreibe kurz auf Deutsch (3-4 Sätze Fließtext) den Inhalt des Songs ` +
              `"${title}" von ${artist}: Worum geht es, welche Stimmung, welche Geschichte?` +
              (ctx.keywords.length > 0
                ? ` Häufige Wörter im Songtext: ${ctx.keywords.join(', ')}.`
                : ''),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`Anthropic message failed with HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === 'text')?.text?.trim();
    if (text === undefined || text === '') throw new Error('Anthropic returned an empty summary');
    return text;
  }

  comicImage(ctx: SongContext): Promise<ComicImage> {
    return Promise.resolve({
      bytes: Buffer.from(buildComicSvg(ctx), 'utf8'),
      contentType: 'image/svg+xml',
    });
  }
}
