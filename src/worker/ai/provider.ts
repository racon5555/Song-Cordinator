import type { ItunesTrack } from '../itunes';
import { logger } from '../../shared/logger';
import { loadAiConfig } from './config';
import { StubProvider } from './stub';
import { OpenAiProvider } from './openai';
import { AnthropicProvider } from './anthropic';

export type SongContext = {
  artistInput: string;
  titleInput: string;
  match?: ItunesTrack;
  lyrics?: string;
  wordCount: number;
  keywords: string[];
};

export type ComicImage = {
  bytes: Buffer;
  contentType: 'image/png' | 'image/jpeg' | 'image/svg+xml';
};

export interface AiProvider {
  readonly name: string;
  summarize(ctx: SongContext): Promise<string>;
  comicImage(ctx: SongContext): Promise<ComicImage>;
}

export async function resolveProvider(): Promise<AiProvider> {
  const config = await loadAiConfig();
  if (config.provider === 'openai') {
    if (config.openaiApiKey !== undefined) return new OpenAiProvider(config.openaiApiKey);
    logger.warn('AI provider "openai" configured but key parameter is empty; using stub');
  }
  if (config.provider === 'anthropic') {
    if (config.anthropicApiKey !== undefined) return new AnthropicProvider(config.anthropicApiKey);
    logger.warn('AI provider "anthropic" configured but key parameter is empty; using stub');
  }
  return new StubProvider();
}
