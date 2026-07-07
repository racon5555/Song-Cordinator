import type { WorkerResult } from '../shared/types';
import { logger } from '../shared/logger';

const MAX_ATTEMPTS = 3;

export async function submitResult(url: string, result: WorkerResult): Promise<void> {
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        logger.info('Result submitted', { runId: result.runId, status: res.status, attempt });
        return;
      }
      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`;
      if (res.status >= 400 && res.status < 500) break;
    } catch (err) {
      lastError = String(err);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(`Submitting result for run ${result.runId} failed: ${lastError}`);
}
