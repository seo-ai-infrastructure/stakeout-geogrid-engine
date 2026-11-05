/**
 * Worker heartbeat (spec §12a). Every 30 s the worker writes what it knows to Redis
 * key `geogrid:health:worker` (expires after 120 s). The website's /status page reads
 * it, so DuoPlus, Proxy-Seller and the worker itself show up as lights without
 * opening Railway's logs. It also writes `health/worker.json` to R2 on boot, which
 * the status page fetches through the public R2 address to prove storage works.
 */
import { kv } from "./redis.js";
import { putBuffer } from "./r2.js";

export const HEALTH_KEY = "geogrid:health:worker";

export type PhoneHealth = { id: string; label: string | null; ready: boolean; problems: string[] };

export const health = {
  version: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  bootAt: new Date().toISOString(),
  concurrency: 0,
  paused: true,
  discovery: {
    at: null as string | null,
    poweredOn: 0,
    usable: 0,
    ready: 0,
    skipped: [] as string[],
    error: null as string | null,
    phones: [] as PhoneHealth[],
  },
  proxy: { at: null as string | null, ok: null as boolean | null, message: null as string | null },
  pins: { completed: 0, failed: 0, lastOkAt: null as string | null, lastError: null as string | null, lastErrorAt: null as string | null },
  r2: { ok: null as boolean | null, error: null as string | null },
};

export function recordProxy(ok: boolean, message: string) {
  health.proxy = { at: new Date().toISOString(), ok, message: message.slice(0, 300) };
}

export function recordPin(ok: boolean, error?: string) {
  if (ok) {
    health.pins.completed++;
    health.pins.lastOkAt = new Date().toISOString();
  } else {
    health.pins.failed++;
    health.pins.lastError = (error ?? "unknown").slice(0, 300);
    health.pins.lastErrorAt = new Date().toISOString();
  }
}

async function beat() {
  try {
    await kv.set(HEALTH_KEY, JSON.stringify({ ...health, at: new Date().toISOString() }), "EX", 120);
  } catch (e) {
    console.error("heartbeat write failed", (e as Error).message);
  }
}

export async function startHeartbeat(): Promise<ReturnType<typeof setInterval>> {
  try {
    await putBuffer("health/worker.json", JSON.stringify({ at: new Date().toISOString(), version: health.version }), "application/json");
    health.r2 = { ok: true, error: null };
  } catch (e) {
    health.r2 = { ok: false, error: (e as Error).message.slice(0, 300) };
    console.error("[boot] R2 write test failed:", health.r2.error);
  }
  await beat();
  return setInterval(() => void beat(), 30_000);
}
