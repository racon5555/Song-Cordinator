import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ComicImage } from '../ai/provider';
import { requireEnv } from '../../shared/env';
import { logger } from '../../shared/logger';

const s3 = new S3Client({});

const EXTENSIONS: Record<ComicImage['contentType'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

function objectKey(runId: string, image: ComicImage): string {
  const safeRunId = runId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `comics/${safeRunId}.${EXTENSIONS[image.contentType]}`;
}

export function toDataUri(image: ComicImage): string {
  return `data:${image.contentType};base64,${image.bytes.toString('base64')}`;
}

export async function storeComicImage(runId: string, image: ComicImage): Promise<string> {
  const bucket = requireEnv('COMICS_BUCKET');
  const key = objectKey(runId, image);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: image.bytes,
      ContentType: image.contentType,
      CacheControl: 'public, max-age=86400',
    }),
  );
  const region = process.env['AWS_REGION'] ?? 'eu-central-1';
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  logger.info('Comic uploaded to S3', { url, bytes: image.bytes.length });
  return url;
}
