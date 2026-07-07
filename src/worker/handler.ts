import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { webhookPayloadSchema, type WebhookPayload, type WorkerResult, type RunStatus } from '../shared/types';
import { logger } from '../shared/logger';
import { requireEnv } from '../shared/env';
import { searchSong, type ItunesTrack } from './itunes';
import { countWords, fetchLyrics } from './lyrics';
import { topKeywords } from './keywords';
import { resolveProvider, type ComicImage, type SongContext } from './ai/provider';
import { loadComicDeadlineMs } from './ai/config';
import { StubProvider } from './ai/stub';
import { storeComicImage, toDataUri } from './comic/store';
import { submitResult } from './result';

const SUMMARY_DEADLINE_MS = 8_000;

const TABLE_NAME = requireEnv('TABLE_NAME');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const stub = new StubProvider();

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (err) {
      logger.error('Record processing failed, will be retried by SQS', {
        messageId: record.messageId,
        error: String(err),
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}

async function processRecord(record: SQSRecord): Promise<void> {
  const payload = webhookPayloadSchema.parse(JSON.parse(record.body));
  const startedAt = Date.now();

  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { runId: payload.runId } }),
  );
  if (existing.Item?.['status'] === 'completed') {
    logger.info('Run already completed, skipping redelivery', { runId: payload.runId });
    return;
  }

  await setStatus(payload.runId, 'processing');

  let result: WorkerResult;
  let failed = false;
  try {
    result = await buildResult(payload);
  } catch (err) {
    logger.error('Processing failed, submitting error result', {
      runId: payload.runId,
      error: String(err),
    });
    failed = true;
    result = await buildErrorResult(payload, err);
  }

  await submitResult(payload.resultSubmitUrl, result);
  await setStatus(payload.runId, failed ? 'failed' : 'completed');
  logger.info('Run finished', {
    runId: payload.runId,
    status: failed ? 'failed' : 'completed',
    durationMs: Date.now() - startedAt,
  });
}

function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${ms}ms deadline`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function buildResult(payload: WebhookPayload): Promise<WorkerResult> {
  const phase = { metaMs: 0, lyricsMs: 0, aiMs: 0, publishMs: 0 };
  const started = Date.now();
  let t = Date.now();

  let match: ItunesTrack | undefined;
  try {
    match = await searchSong(payload.artistName, payload.songTitle);
  } catch (err) {
    logger.warn('iTunes lookup failed, continuing with raw input', { error: String(err) });
  }
  phase.metaMs = Date.now() - t;

  const artist = match?.artistName ?? payload.artistName;
  const title = match?.trackName ?? payload.songTitle;
  const baseCtx: SongContext = {
    artistInput: payload.artistName,
    titleInput: payload.songTitle,
    wordCount: 0,
    keywords: [],
    ...(match !== undefined ? { match } : {}),
  };
  let fullCtx: SongContext = baseCtx;

  const [provider, comicDeadlineMs] = await Promise.all([resolveProvider(), loadComicDeadlineMs()]);
  let comicSource = provider.name;
  let summarySource = provider.name;

  const comicPromise: Promise<ComicImage> =
    provider.name === 'stub'
      ? Promise.resolve({ bytes: Buffer.alloc(0), contentType: 'image/svg+xml' })
      : withDeadline(provider.comicImage(baseCtx), comicDeadlineMs, 'comic').catch(
          async (err: unknown) => {
            logger.warn('Provider comic failed or hit deadline, using stub', {
              provider: provider.name,
              deadlineMs: comicDeadlineMs,
              error: String(err),
            });
            comicSource = 'stub';
            return stub.comicImage(fullCtx);
          },
        );

  t = Date.now();
  const pairs: (readonly [string, string])[] = [[artist, title]];
  if (artist !== payload.artistName || title !== payload.songTitle) {
    pairs.push([payload.artistName, payload.songTitle]);
  }
  const lyricsHit = await fetchLyrics(pairs);
  const lyrics = lyricsHit?.text;
  const wordCount = lyrics !== undefined ? countWords(lyrics) : 0;
  const keywords = lyrics !== undefined ? topKeywords(lyrics) : [];
  phase.lyricsMs = Date.now() - t;

  fullCtx = {
    ...baseCtx,
    wordCount,
    keywords,
    ...(lyrics !== undefined ? { lyrics } : {}),
  };

  t = Date.now();
  const [summary, comic] = await Promise.all([
    withDeadline(provider.summarize(fullCtx), SUMMARY_DEADLINE_MS, 'summary').catch(
      async (err: unknown) => {
        logger.warn('Provider summary failed, using stub', {
          provider: provider.name,
          error: String(err),
        });
        summarySource = 'stub';
        return stub.summarize(fullCtx);
      },
    ),
    provider.name === 'stub' ? stub.comicImage(fullCtx) : comicPromise,
  ]);
  phase.aiMs = Date.now() - t;

  t = Date.now();
  const comicImageUrl = await publishComic(payload.runId, comic);
  phase.publishMs = Date.now() - t;

  logger.info('Result built', {
    runId: payload.runId,
    lyricsSource: lyricsHit?.source ?? 'none',
    wordCount,
    summarySource,
    summaryChars: summary.length,
    comicSource,
    comicContentType: comic.contentType,
    buildMs: Date.now() - started,
    ...phase,
  });

  return {
    runId: payload.runId,
    appId: payload.appId,
    ...(payload.appName !== undefined ? { appName: payload.appName } : {}),
    artists: {
      singers: [artist],
      producers: [],
    },
    song: {
      title,
      ...(match?.releaseDate !== undefined ? { releaseDate: match.releaseDate.slice(0, 10) } : {}),
      ...(match?.collectionName !== undefined ? { album: match.collectionName } : {}),
    },
    wordCount,
    summary,
    comicImageUrl,
  };
}

async function buildErrorResult(payload: WebhookPayload, err: unknown): Promise<WorkerResult> {
  const ctx: SongContext = {
    artistInput: payload.artistName,
    titleInput: payload.songTitle,
    wordCount: 0,
    keywords: [],
  };
  return {
    runId: payload.runId,
    appId: payload.appId,
    ...(payload.appName !== undefined ? { appName: payload.appName } : {}),
    artists: { singers: [payload.artistName], producers: [] },
    song: { title: payload.songTitle },
    wordCount: 0,
    summary:
      `Die Verarbeitung für „${payload.songTitle}“ von ${payload.artistName} ist fehlgeschlagen: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    comicImageUrl: await publishComic(payload.runId, await stub.comicImage(ctx)),
  };
}

async function publishComic(runId: string, comic: ComicImage): Promise<string> {
  try {
    return await storeComicImage(runId, comic);
  } catch (err) {
    logger.warn('Comic upload to S3 failed, embedding data URI instead', { error: String(err) });
    return toDataUri(comic);
  }
}

async function setStatus(runId: string, status: RunStatus): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { runId },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status, ':now': new Date().toISOString() },
    }),
  );
}
