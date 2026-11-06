/**
 * Phone discovery (spec §8): ONE DuoPlus cloudPhone/list call tells us which phones
 * are powered on, which still have an active subscription, and which saved proxy
 * record each one uses. That count is the worker's concurrency.
 */
import { db, Prisma } from "@geogrid/db";
import { env } from "./config.js";
import { listPhones, phoneInfo, type PhoneRow } from "./duoplus.js";

export type DiscoveredPhone = { imageId: string; proxyId: string; label: string | null; slotIndex: number };
export type Discovery = { poweredOn: number; active: DiscoveredPhone[]; skipped: string[] };

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;

const pickStr = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return undefined;
};

/** Expiry may be unix seconds, unix ms, or a date string; missing = treat as active. */
function subscriptionActive(row: PhoneRow): boolean {
  const r = row as Record<string, unknown>;
  if (r.is_expired === true || r.is_expired === 1 || r.expired === true || r.expired === 1) return false;
  for (const k of ["expired_at", "expire_at", "expire_time", "expired_time", "expiration", "end_time", "expired_date"]) {
    const v = r[k];
    if (v == null || v === "" || v === 0) continue;
    let t: number;
    if (typeof v === "number") t = v < 1e12 ? v * 1000 : v;
    else if (/^\d+$/.test(String(v))) {
      const n = Number(v);
      t = n < 1e12 ? n * 1000 : n;
    } else t = Date.parse(String(v));
    if (Number.isFinite(t)) return t > Date.now();
  }
  return true;
}

function boundProxyId(row: PhoneRow): string | undefined {
  const r = row as Record<string, unknown>;
  const direct = pickStr(r, ["proxy_id", "proxyId"]);
  if (direct) return direct;
  for (const k of ["proxy", "proxy_info", "proxyInfo"]) {
    const nested = r[k];
    if (nested && typeof nested === "object") {
      const id = pickStr(nested as Record<string, unknown>, ["id", "proxy_id"]);
      if (id) return id;
    }
  }
  return undefined;
}

function inGroup(row: PhoneRow, group: string): boolean | undefined {
  const r = row as Record<string, unknown>;
  const names = ["group_name", "groupName", "group", "group_title"].map((k) => r[k]);
  const nested = r.group && typeof r.group === "object" ? pickStr(r.group as Record<string, unknown>, ["name", "title"]) : undefined;
  const groups = Array.isArray(r.group) ? r.group.map(g => g && typeof g === "object" ? pickStr(g, ["name", "title"]) : str(g)) : [];
  const values = [...names.map(str), nested, ...groups].filter(Boolean) as string[];
  if (!values.length) return undefined; // the list doesn't report groups
  return values.some((v) => v.toLowerCase() === group.toLowerCase());
}

let warnedNoGroupField = false;

export async function discoverPhones(log: (m: string) => void): Promise<Discovery> {
  const rows = await listPhones(); // powered on + ADB on
  let overrides: Record<string, string> = {};
  try {
    overrides = JSON.parse(env.DEVICE_PROXY_IDS_JSON || "{}") as Record<string, string>;
  } catch {
    log("DEVICE_PROXY_IDS_JSON is not valid JSON; ignoring it");
  }

  const skipped: string[] = [];
  const found: Array<Omit<DiscoveredPhone, "slotIndex">> = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const imageId = pickStr(r, ["image_id", "imageId", "id"]);
    if (!imageId) continue;
    const label = pickStr(r, ["name", "image_name", "remark", "title"]) ?? null;
    if (env.DUOPLUS_GROUP_NAME) {
      const g = inGroup(row, env.DUOPLUS_GROUP_NAME);
      if (g === false) continue;
      if (g === undefined && !warnedNoGroupField) {
        warnedNoGroupField = true;
        log(`the phone list has no group field, so DUOPLUS_GROUP_NAME can't filter; skipping unclassified phones`);
      }
    }
    if (env.DUOPLUS_GROUP_NAME && inGroup(row, env.DUOPLUS_GROUP_NAME) === undefined) { skipped.push(`${imageId}: group unknown`); continue; }
    if (!subscriptionActive(row)) {
      skipped.push(`${imageId} (${label ?? "no name"}): subscription expired`);
      continue;
    }
    let proxyId: string | undefined = overrides[imageId] ?? boundProxyId(row);
    // The list endpoint omits proxy bindings; the details endpoint supplies them.
    if (!proxyId) {
      try { proxyId = boundProxyId(await phoneInfo(imageId)); }
      catch { skipped.push(`${imageId}: could not read proxy binding`); continue; }
    }
    if (!proxyId) {
      skipped.push(`${imageId} (${label ?? "no name"}): no saved proxy record bound; bind one in DuoPlus or add it to DEVICE_PROXY_IDS_JSON`);
      continue;
    }
    if (found.some(p => p.proxyId === proxyId)) {
      skipped.push(`${imageId}: proxy record is shared with another worker phone; use a separate record`);
      continue;
    }
    found.push({ imageId, proxyId, label });
  }

  // stable port per phone: sort by id, slot = position (port 10000 + slot)
  found.sort((a, b) => a.imageId.localeCompare(b.imageId));
  return { poweredOn: rows.length, active: found.map((p, i) => ({ ...p, slotIndex: i })), skipped };
}

/** Keep slot assignments stable across discovery order and temporary outages. */
export async function syncDevicePool(phones: DiscoveredPhone[]): Promise<void> {
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(482031)`;
    await tx.devicePool.updateMany({ where: { imageId: { notIn: phones.map(p => p.imageId) } }, data: { isEnabled: false } });
    const highest = await tx.devicePool.aggregate({ _max: { slotIndex: true } });
    let next = (highest._max.slotIndex ?? -1) + 1;
    for (const p of phones) {
      const existing = await tx.devicePool.findUnique({ where: { imageId: p.imageId } });
      const proxyChanged = existing && existing.proxyId !== p.proxyId;
      await tx.devicePool.upsert({
        where: { imageId: p.imageId },
        create: { imageId: p.imageId, proxyId: p.proxyId, slotIndex: next++, label: p.label, isEnabled: false },
        update: { proxyId: p.proxyId, label: p.label, ...(proxyChanged ? { isEnabled: false, proxyGeoKey: null, proxyLogin: null, proxyRung: null, proxyCheck: Prisma.DbNull, proxyConfiguredAt: null } : {}) },
      });
    }
  });
}
