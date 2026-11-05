import { Queue } from "bullmq";
import { Redis } from "ioredis";

/** Must match QUEUE_NAME in apps/worker/src/config.ts (spec §6). */
export const QUEUE_NAME = "geogrid-pins";
export const JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 4000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;

const g = globalThis as unknown as { __ggRedis?: Redis; __ggQueue?: Queue };

export function redis(): Redis {
  if (!g.__ggRedis) {
    g.__ggRedis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null, enableReadyCheck: false });
  }
  return g.__ggRedis;
}

export function pinQueue(): Queue {
  g.__ggQueue ??= new Queue(QUEUE_NAME, { connection: redis() });
  return g.__ggQueue;
}
