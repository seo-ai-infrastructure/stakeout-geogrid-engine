/**
 * Worker heartbeat (spec §12a). Every 30 s the worker writes what it knows to Redis
 * key `geogrid:health:worker` (expires after 120 s). The website's /status page reads
 * it, so DuoPlus, Proxy-Seller and the worker itself show up as lights without
 * opening Railway's logs. It also writes `health/worker.json` to R2 on boot, which
 * the status page fetches through the public R2 address to prove storage works.
 */
import { db, type Prisma } from "@geogrid/db";
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
  queue: { ok: false, error: null as string | null },
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
  try { health.queue = { ok: await kv.ping() === "PONG", error: null }; }
  catch { health.queue = { ok: false, error: "Redis connection unavailable" }; }
  try {
    const payload = JSON.parse(JSON.stringify({ ...health, at: new Date().toISOString() })) as Prisma.InputJsonValue;
    await db.workerState.upsert({ where: { id: "worker" }, create: { id: "worker", payload }, update: { payload } });
  } catch { console.error("Worker heartbeat could not be persisted"); }
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
