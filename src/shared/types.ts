import { z } from 'zod';

export const webhookPayloadSchema = z
  .object({
    runId: z.string().min(1),
    appId: z.string().min(1),
    appName: z.string().min(1).optional(),
    artistName: z.string().min(1),
    songTitle: z.string().min(1),
    resultSubmitUrl: z.string().url(),
    startedAt: z.string().optional(),
  })
  .passthrough();

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

export type WorkerResult = {
  runId: string;
  appId: string;
  appName?: string;
  artists: {
    singers: string[];
    producers: string[];
  };
  song: {
    title: string;
    releaseDate?: string;
    album?: string;
  };
  wordCount: number;
  summary: string;
  comicImageUrl: string;
};

export type RunStatus = 'accepted' | 'processing' | 'completed' | 'failed';
