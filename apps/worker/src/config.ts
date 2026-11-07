import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_CONCURRENCY: z.preprocess(v => v === "" ? undefined : v, z.coerce.number().int().positive().optional()),

  DUOPLUS_API_KEY: z.string().default(""),
  DUOPLUS_BASE_URL: z.string().default("https://openapi.duoplus.net"),

  /** saved preserves a provider-configured DuoPlus proxy; dynamic retargets Proxy-Seller. */
  PROXY_MODE: z.enum(["dynamic", "saved"]).default("dynamic"),
  PROXY_SELLER_BASE_LOGIN: z.string().default(""),
  PROXY_SELLER_PASSWORD: z.string().default(""),
  PROXY_SELLER_HOST: z.string().default("us.res.proxy-seller.com"),
  PROXY_GEO_MATCH: z.enum(["state", "city", "none"]).default("state"),
  /** request = new IP on every request (no session); sticky = same IP for PROXY_STICKY_MINUTES, then rotates */
  PROXY_ROTATION: z.enum(["request", "sticky"]).default("request"),
  PROXY_STICKY_MINUTES: z.coerce.number().int().min(1).max(60).default(2),
  PROXY_SELLER_SD_IDS_JSON: z.string().default("{}"),
  UNBIND_PROXY_BEFORE_UPLOAD: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET_NAME: z.string().default("geogrid-artifacts"),

  /** Only use phones in this DuoPlus group (blank = all powered-on phones) */
  DUOPLUS_GROUP_NAME: z.string().default(""),
  /** Comma-separated device IDs; limits discovery and leases to a pilot fleet. */
  DUOPLUS_IMAGE_IDS: z.string().default("").transform(v => [...new Set(v.split(",").map(id => id.trim()).filter(Boolean))]),
  /** Wake only allowlisted, subscribed phones when durable pins are waiting. */
  AUTO_POWER_ON: z.string().default("false").transform(v => v === "true" || v === "1"),
  /** Optional {"<imageId>":"<proxyId>"} when the phone list doesn't report the bound proxy record */
  DEVICE_PROXY_IDS_JSON: z.string().default("{}"),
  /** Re-run the phone discovery call this often and adjust concurrency */
  DEVICE_REFRESH_MINUTES: z.coerce.number().int().min(1).max(120).default(5),
  PREFLIGHT_ON_BOOT: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
});

export const env = schema.parse(process.env);

export const QUEUE_NAME = "geogrid-pins";
export const JOB_ATTEMPTS = 3;
export const DEVICE_LEASE_SEC = 180;
export const DUOPLUS_MIN_INTERVAL_MS = 1100;

/** Timing budget for a mobile pin (spec §7.3). */
export const MOBILE = {
  settleAfterUpdateMs: 6000,
  settleAfterProxyMs: 4000,
  initialWaitMs: 55_000,
  tarPollIntervalMs: 5000,
  tarPollMaxMs: 120_000,
  // Phone upload allows 120 s after the archive. Do not release its lease and
  // let the next pin clear local evidence while that upload is still running.
  videoPollMaxMs: 150_000,
  captchaCooldownMs: 30 * 60_000,
} as const;

export const DEVICE_RT_DIR = "/data/local/tmp/rt";
export const DEVICE_SCRIPT_PATH = `${DEVICE_RT_DIR}/run_pin.sh`;

export const requireEnv = () => {
  const missing = [
    ["DUOPLUS_API_KEY", env.DUOPLUS_API_KEY],
    ...(env.PROXY_MODE === "dynamic" ? [
      ["PROXY_SELLER_BASE_LOGIN", env.PROXY_SELLER_BASE_LOGIN],
      ["PROXY_SELLER_PASSWORD", env.PROXY_SELLER_PASSWORD],
    ] : []),
    ["R2_ACCOUNT_ID", env.R2_ACCOUNT_ID],
    ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
    ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
};
