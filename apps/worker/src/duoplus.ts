import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { env, DEVICE_RT_DIR, DEVICE_SCRIPT_PATH } from "./config.js";
import { acquireDuoPlusSlot } from "./redis.js";

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

export class DuoPlusError extends Error {
  constructor(public endpoint: string, payload: unknown) {
    const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const safe = Object.fromEntries(["httpStatus", "code", "message", "msg", "reason"].filter(k => source[k] !== undefined).map(k => [k, source[k]]));
    let detail = JSON.stringify(safe);
    for (const secret of [env.DUOPLUS_API_KEY, env.PROXY_SELLER_BASE_LOGIN, env.PROXY_SELLER_PASSWORD]) {
      if (secret) detail = detail.replaceAll(secret, "[redacted]");
    }
    super(`DuoPlus ${endpoint}: ${detail.slice(0, 400)}`);
    this.name = "DuoPlusError";
  }
}

type ApiEnvelope = { code?: number; msg?: string; message?: string; data?: unknown };

async function post<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  await acquireDuoPlusSlot(endpoint);
  const res = await fetch(`${env.DUOPLUS_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "DuoPlus-API-Key": env.DUOPLUS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  let json: ApiEnvelope;
  try {
    json = JSON.parse(text) as ApiEnvelope;
  } catch {
    throw new DuoPlusError(endpoint, { httpStatus: res.status, body: text.slice(0, 300) });
  }
  if (!res.ok || (json.code !== undefined && json.code !== 200)) {
    throw new DuoPlusError(endpoint, { httpStatus: res.status, ...json });
  }
  return json.data as T;
}

/* ------------------------------------------------------------------ */
/* Endpoints (spec §7.3)                                               */
/* ------------------------------------------------------------------ */

export type PhoneRow = { image_id?: string; id?: string; [k: string]: unknown };

export async function phoneInfo(imageId: string): Promise<PhoneRow> {
  return post<PhoneRow>("/api/v1/cloudPhone/info", { image_id: imageId });
}

export async function listPhones(): Promise<PhoneRow[]> {
  const data = await post<unknown>("/api/v1/cloudPhone/list", {
    link_status: ["1"],
    adb_status: ["1"],
    pagesize: 100,
  });
  if (Array.isArray(data)) return data as PhoneRow[];
  const obj = (data ?? {}) as Record<string, unknown>;
  const list = (obj.list ?? obj.rows ?? obj.items ?? obj.data ?? []) as PhoneRow[];
  return Array.isArray(list) ? list : [];
}

export async function updateProxy(p: {
  id: string;
  host: string;
  port: number;
  user: string;
  password: string;
}): Promise<void> {
  await post("/api/v1/proxy/update", {
    id: p.id,
    host: p.host,
    port: p.port,
    user: p.user,
    password: p.password,
    protocol: "socks5",
    ip_scan_channel: "ip2location",
  });
}

export type ProxyCheck = {
  ok: boolean;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  isp?: string;
  raw: unknown;
};

const pick = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
};

export async function checkProxy(proxyId: string): Promise<ProxyCheck> {
  const data = await post<unknown>("/api/v1/proxy/check", { proxy_id: proxyId });
  const o = ((data && typeof data === "object" ? data : {}) as Record<string, unknown>);
  const nested = (o.result ?? o.info ?? o.proxy ?? {}) as Record<string, unknown>;
  const src = { ...nested, ...o };
  const ip = pick(src, ["ip", "proxyIp", "proxy_ip", "public_ip", "query"]);
  const successFlag = src.success ?? src.status ?? src.ok;
  const ok =
    successFlag === undefined
      ? !!ip
      : successFlag === true || successFlag === 1 || successFlag === "1" || successFlag === "success";
  return {
    ok,
    ip,
    country: pick(src, ["country", "countryCode", "country_code"]),
    region: pick(src, ["region", "regionName", "province", "state", "state_code"]),
    city: pick(src, ["city"]),
    timezone: pick(src, ["timezone", "timeZone", "time_zone"]),
    isp: pick(src, ["isp", "org", "as"]),
    // The provider includes proxy credentials in its response. Only evidence
    // fields may be persisted or included in customer-visible artifacts.
    raw: {
      success: ok, ip,
      country: pick(src, ["country", "countryCode", "country_code"]),
      region: pick(src, ["region", "regionName", "province", "state", "state_code"]),
      city: pick(src, ["city"]),
      timezone: pick(src, ["timezone", "timeZone", "time_zone"]),
      isp: pick(src, ["isp", "org", "as"]),
    },
  };
}

export type PhoneUpdate = {
  image_id: string;
  proxy?: { id: string; dns: 0 | 1 };
  gps?: { type: 1 | 2; latitude: string; longitude: string };
  locale?: { type: 1 | 2; timezone?: string; language?: string };
};

export async function updatePhones(images: PhoneUpdate[]): Promise<void> {
  await post("/api/v1/cloudPhone/update", { images });
}

/** Run a shell command (< 10 s) on one or more phones; returns stdout text. */
export async function command(imageIds: string[], cmd: string): Promise<string> {
  const data = await post<unknown>("/api/v1/cloudPhone/command", { image_ids: imageIds, command: cmd });
  return normalizeOutput(data);
}

function normalizeOutput(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(normalizeOutput).join("\n");
  const o = data as Record<string, unknown>;
  for (const k of ["output", "result", "stdout", "data", "msg"]) {
    if (typeof o[k] === "string") return o[k] as string;
    if (Array.isArray(o[k])) return normalizeOutput(o[k]);
  }
  return JSON.stringify(o);
}

/* ------------------------------------------------------------------ */
/* One-time device preparation                                         */
/* ------------------------------------------------------------------ */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUN_PIN_SH = readFileSync(path.resolve(__dirname, "../device/run_pin.sh"), "utf8");
export const RUN_PIN_MD5 = createHash("md5").update(RUN_PIN_SH).digest("hex");

/** Animations off + rt dir; idempotent. */
export async function setupDevice(imageId: string): Promise<void> {
  await command(
    [imageId],
    [
      `mkdir -p ${DEVICE_RT_DIR}`,
      "settings put global window_animation_scale 0",
      "settings put global transition_animation_scale 0",
      "settings put global animator_duration_scale 0",
      "echo setup_ok",
    ].join(" && "),
  );
}

/** Push run_pin.sh as ≤1.5 KB base64 chunks (command body stays small, each call < 10 s). */
export async function pushScript(imageId: string): Promise<void> {
  const b64 = Buffer.from(RUN_PIN_SH, "utf8").toString("base64");
  const chunks = b64.match(/.{1,1500}/g) ?? [];
  const tmp = `${DEVICE_RT_DIR}/run_pin.b64`;
  await command([imageId], `mkdir -p ${DEVICE_RT_DIR} && : > ${tmp} && echo begin`);
  for (const c of chunks) await command([imageId], `echo '${c}' >> ${tmp}`);
  const out = await command(
    [imageId],
    `base64 -d ${tmp} > ${DEVICE_SCRIPT_PATH} && rm -f ${tmp} && md5sum ${DEVICE_SCRIPT_PATH} | cut -d' ' -f1`,
  );
  if (!out.includes(RUN_PIN_MD5)) {
    throw new DuoPlusError("/api/v1/cloudPhone/command", { reason: "script md5 mismatch after push", out });
  }
}

export async function scriptOnDevice(imageId: string): Promise<boolean> {
  const out = await command([imageId], `md5sum ${DEVICE_SCRIPT_PATH} 2>/dev/null | cut -d' ' -f1`);
  return out.includes(RUN_PIN_MD5);
}

/**
 * Pull a small file through the command API as base64 chunks (fallback when the
 * image has no curl). ~48 KB per call; dumps.tar.gz is typically 50–300 KB.
 */
export async function pullFile(imageId: string, devicePath: string, maxBytes = 4 * 1024 * 1024): Promise<Buffer> {
  const sizeOut = await command([imageId], `stat -c %s ${devicePath} 2>/dev/null || wc -c < ${devicePath}`);
  const size = parseInt(sizeOut.trim().split(/\s+/).pop() ?? "0", 10);
  if (!size || size > maxBytes) throw new Error(`pullFile: bad size ${sizeOut} for ${devicePath}`);
  const chunk = 36_000; // raw bytes → 48 KB base64
  const parts: string[] = [];
  for (let off = 0; off < size; off += chunk) {
    const out = await command(
      [imageId],
      `tail -c +${off + 1} ${devicePath} | head -c ${chunk} | base64 -w0`,
    );
    parts.push(out.replace(/\s+/g, ""));
  }
  return Buffer.from(parts.join(""), "base64");
}
