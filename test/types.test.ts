import { describe, expect, it } from 'vitest';
import { webhookPayloadSchema } from '../src/shared/types';

const valid = {
  runId: '688abc',
  appId: '688def',
  appName: 'Vorname Nachname',
  artistName: 'The Beatles',
  songTitle: 'Let It Be',
  resultSubmitUrl: 'https://ibb-devops-practice-client.vercel.app/api/results',
  startedAt: '2026-07-03T08:15:00.000Z',
};

describe('webhookPayloadSchema', () => {
  it('accepts the documented coordinator payload', () => {
    expect(webhookPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it('passes through unknown extra fields', () => {
    const parsed = webhookPayloadSchema.parse({ ...valid, extra: 42 });
    expect((parsed as Record<string, unknown>)['extra']).toBe(42);
  });

  it('rejects a missing runId', () => {
    const { runId: _dropped, ...rest } = valid;
    expect(webhookPayloadSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-URL resultSubmitUrl', () => {
    expect(
      webhookPayloadSchema.safeParse({ ...valid, resultSubmitUrl: 'not-a-url' }).success,
    ).toBe(false);
  });
});
