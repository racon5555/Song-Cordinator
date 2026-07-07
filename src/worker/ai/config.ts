import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { logger } from '../../shared/logger';

const ssm = new SSMClient({});
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: string | undefined; fetchedAt: number }>();

async function getParameter(name: string): Promise<string | undefined> {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;

  let value: string | undefined;
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    value = res.Parameter?.Value;
  } catch (err) {
    if (!(err instanceof ParameterNotFound)) throw err;
    value = undefined;
  }
  cache.set(name, { value, fetchedAt: Date.now() });
  return value;
}

export async function loadComicDeadlineMs(): Promise<number> {
  const paramName = process.env['COMIC_DEADLINE_PARAM'];
  if (paramName === undefined) return 13_500;
  const raw = await getParameter(paramName);
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 13_500;
  return Math.min(Math.max(parsed, 3_000), 45_000);
}

export type AiConfig = {
  provider: 'stub' | 'openai' | 'anthropic';
  openaiApiKey?: string;
  anthropicApiKey?: string;
};

export async function loadAiConfig(): Promise<AiConfig> {
  const providerParam = process.env['AI_PROVIDER_PARAM'];
  if (providerParam === undefined) return { provider: 'stub' };

  const raw = ((await getParameter(providerParam)) ?? 'stub').trim().toLowerCase();
  const provider = raw === 'openai' || raw === 'anthropic' ? raw : 'stub';
  if (raw !== provider && raw !== 'stub') {
    logger.warn('Unknown AI provider configured, falling back to stub', { configured: raw });
  }

  const openaiParam = process.env['OPENAI_KEY_PARAM'];
  const anthropicParam = process.env['ANTHROPIC_KEY_PARAM'];
  const openaiApiKey = provider === 'openai' && openaiParam ? await getParameter(openaiParam) : undefined;
  const anthropicApiKey =
    provider === 'anthropic' && anthropicParam ? await getParameter(anthropicParam) : undefined;

  return {
    provider,
    ...(openaiApiKey !== undefined ? { openaiApiKey } : {}),
    ...(anthropicApiKey !== undefined ? { anthropicApiKey } : {}),
  };
}
