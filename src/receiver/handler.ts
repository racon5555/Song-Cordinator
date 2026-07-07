import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { webhookPayloadSchema } from '../shared/types';
import { logger } from '../shared/logger';
import { requireEnv } from '../shared/env';

const TABLE_NAME = requireEnv('TABLE_NAME');
const QUEUE_URL = requireEnv('QUEUE_URL');
const RUN_TTL_SECONDS = 7 * 24 * 60 * 60;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

function response(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  if (method !== 'POST') {
    return response(405, { error: 'Only POST is supported' });
  }

  let json: unknown;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '');
    json = JSON.parse(raw);
  } catch {
    logger.warn('Rejected webhook with unparsable body');
    return response(400, { error: 'Body must be valid JSON' });
  }

  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn('Rejected webhook with invalid payload', {
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return response(400, { error: 'Invalid payload', issues: parsed.error.issues });
  }
  const payload = parsed.data;

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          runId: payload.runId,
          status: 'accepted',
          appId: payload.appId,
          artistName: payload.artistName,
          songTitle: payload.songTitle,
          receivedAt: new Date().toISOString(),
          expiresAt: Math.floor(Date.now() / 1000) + RUN_TTL_SECONDS,
        },
        ConditionExpression: 'attribute_not_exists(runId)',
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      logger.info('Duplicate runId acknowledged without re-enqueue', { runId: payload.runId });
      return response(202, { accepted: true, duplicate: true });
    }
    throw err;
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(payload),
    }),
  );

  logger.info('Webhook accepted and enqueued', {
    runId: payload.runId,
    artistName: payload.artistName,
    songTitle: payload.songTitle,
  });
  return response(202, { accepted: true });
}
