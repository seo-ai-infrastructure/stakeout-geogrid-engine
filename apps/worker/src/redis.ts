import { Redis } from "ioredis";
import { env, DEVICE_LEASE_SEC, DUOPLUS_MIN_INTERVAL_MS } from "./config.js";

/** BullMQ-compatible connection (Upstash TLS via rediss://). */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/** Separate connection for locks/limiter so BullMQ's blocking commands never stall them. */
export const kv = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  commandTimeout: 8000,
  enableReadyCheck: false,
});

connection.on("error", e => console.error("Redis worker connection:", e.message));
kv.on("error", e => console.error("Redis control connection:", e.message));

const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
return 0`;

const EXTEND_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) end
return 0`;

export const leaseKey = (imageId: string) => `lock:duoplus:${imageId}`;

/* Generic compare-and-set locks */
export async function tryLock(key: string, owner: string, ttlSec = DEVICE_LEASE_SEC): Promise<boolean> {
  const res = await kv.set(key, owner, "EX", ttlSec, "NX");
  return res === "OK";
}
export async function extendLock(key: string, owner: string, ttlSec = DEVICE_LEASE_SEC): Promise<boolean> {
  const r = await kv.eval(EXTEND_LUA, 1, key, owner, String(ttlSec));
  return r === 1;
}
export async function releaseLock(key: string, owner: string): Promise<void> {
  await kv.eval(RELEASE_LUA, 1, key, owner);
}

/* Device lease wrappers (spec §6) */
export const tryLease = (imageId: string, owner: string, ttlSec = DEVICE_LEASE_SEC) => tryLock(leaseKey(imageId), owner, ttlSec);
export const extendLease = (imageId: string, owner: string) => extendLock(leaseKey(imageId), owner);
export const releaseLease = (imageId: string, owner: string) => releaseLock(leaseKey(imageId), owner);

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Global per-endpoint gate: at most one DuoPlus request per 1.1 s across every
 * worker replica. SET NX PX is atomic, so contention is safe; losers spin.
 */
export async function acquireDuoPlusSlot(endpoint: string): Promise<void> {
  const key = `rl:duoplus:${endpoint}`;
  for (;;) {
    const ok = await kv.set(key, "1", "PX", DUOPLUS_MIN_INTERVAL_MS, "NX");
    if (ok === "OK") return;
    await sleep(120 + Math.floor(Math.random() * 180));
  }
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([connection.quit(), kv.quit()]);
}
