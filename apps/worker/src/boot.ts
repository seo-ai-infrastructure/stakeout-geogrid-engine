/**
 * Everything that used to be a local script runs on Railway at startup (and on each
 * refresh) and prints to the deploy logs (spec §8): phone discovery, preflight,
 * script push. Nothing runs on your own machine.
 */
import { db } from "@geogrid/db";
import { env } from "./config.js";
import { command } from "./duoplus.js";
import { ensureDeviceReady } from "./mobile.js";
import { discoverPhones, syncDevicePool, wakePendingDevices } from "./devices.js";
import { randomUUID } from "node:crypto";
import { tryLease, releaseLease } from "./redis.js";
import { health, type PhoneHealth } from "./health.js";
import { checkScreenDump } from "./screenPreflight.js";

const log = (m: string) => console.log(`[boot] ${m}`);

export const CHECKS: Array<[string, string, (out: string) => string]> = [
  [
    "build",
    "getprop ro.build.version.release; getprop ro.debuggable",
    (o) => (/^1$/m.test(o) ? "PASS (debuggable)" : "PASS (not debuggable: Chrome first-run screens are tapped away instead)"),
  ],
  [
    "tools",
    'for b in screenrecord tar gzip md5sum pidof nohup monkey sed grep base64 curl; do which $b >/dev/null 2>&1 || echo "MISSING $b"; done; echo checked',
    (o) => {
      const missing = [...o.matchAll(/MISSING (\S+)/g)].map((m) => m[1]);
      if (!missing.length) return "PASS";
      return `FAIL: missing ${missing.join(", ")}`;
    },
  ],
  [
    "upload route",
    "curl -s --max-time 8 https://ipinfo.io/json || echo NO_CURL",
    (o) => {
      if (o.includes("NO_CURL")) return "WARN: no curl";
      const org = /"org"\s*:\s*"([^"]*)"/.exec(o)?.[1] ?? "unknown";
      const city = /"city"\s*:\s*"([^"]*)"/.exec(o)?.[1] ?? "?";
      const home = /comcast|charter|spectrum|at&t|verizon|cox|frontier|centurylink|lumen|t-mobile|optimum|altice|windstream|mediacom|wow|earthlink|brightspeed/i.test(org);
      return home
        ? `WARN: phone uploads leave via a home ISP (${org}, ${city}). Set UNBIND_PROXY_BEFORE_UPLOAD="true" so videos don't use proxy traffic.`
        : `PASS: uploads leave via ${org} (${city}); keep UNBIND_PROXY_BEFORE_UPLOAD="false".`;
    },
  ],
  [
    "animations off",
    "settings put global window_animation_scale 0 && settings put global transition_animation_scale 0 && settings put global animator_duration_scale 0 && echo ANIM_OK",
    (o) => (o.includes("ANIM_OK") ? "PASS" : "FAIL"),
  ],
];

async function preflight(imageId: string): Promise<{ ok: boolean; problems: string[] }> {
  let ok = true;
  const problems: string[] = [];
  const screen = await checkScreenDump(imageId, command);
  log(`check ${imageId} screen dump    ${screen}`);
  if (screen.startsWith("FAIL")) { ok = false; problems.push(`screen dump: ${screen}`); }
  for (const [name, cmd, verdict] of CHECKS) {
    try {
      const v = verdict(await command([imageId], cmd));
      if (v.startsWith("FAIL")) ok = false;
      if (v.startsWith("FAIL") || v.startsWith("WARN")) problems.push(`${name}: ${v}`);
      log(`check ${imageId} ${name.padEnd(14)} ${v}`);
    } catch (e) {
      ok = false;
      problems.push(`${name}: ERROR ${(e as Error).message.slice(0, 160)}`);
      log(`check ${imageId} ${name.padEnd(14)} ERROR ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return { ok, problems };
}

const phoneProblems = new Map<string, string[]>();

/** Phones that have passed their checks in this process (re-checked after a deploy). */
const checked = new Set<string>();

/**
 * One DuoPlus list call → which phones are on, with an active subscription and a
 * bound proxy record. New phones are checked and prepared. Returns how many
 * phones can run at once (the worker's concurrency).
 */
export async function refreshDevices(): Promise<number> {
  try { await wakePendingDevices(log); }
  catch (e) { log(`automatic startup unavailable: ${(e as Error).message.slice(0, 200)}`); }
  let found;
  try {
    found = await discoverPhones(log);
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200);
    log(`phone discovery failed: ${msg}; keeping the current phones`);
    health.discovery.error = msg;
    health.discovery.at = new Date().toISOString();
    return db.devicePool.count({ where: { isEnabled: true } });
  }
  for (const s of found.skipped) log(`skipped ${s}`);
  await syncDevicePool(found.active);

  const devices = await db.devicePool.findMany({ where: { imageId: { in: found.active.map(p => p.imageId) } }, orderBy: { slotIndex: "asc" } });
  for (const d of devices) {
    if (checked.has(d.imageId) && d.isEnabled) continue;
    const owner = `preflight-${randomUUID()}`;
    if (!await tryLease(d.imageId, owner, 600)) continue;
    try {
    log(`phone ${d.imageId} (${d.label ?? "no name"}) slot=${d.slotIndex} port=${10000 + d.slotIndex} proxy record=${d.proxyId}`);
    const pf = env.PREFLIGHT_ON_BOOT ? await preflight(d.imageId) : { ok: true, problems: [] };
    const passed = pf.ok;
    phoneProblems.set(d.imageId, pf.problems);
    let ready = passed;
    if (passed) {
      try {
        await ensureDeviceReady(d, (m) => log(`phone ${d.imageId}: ${m}`));
      } catch (e) {
        ready = false;
        phoneProblems.set(d.imageId, [...pf.problems, `script setup: ${(e as Error).message.slice(0, 160)}`]);
        log(`phone ${d.imageId} script setup failed: ${(e as Error).message.slice(0, 200)}`);
      }
    } else {
      log(`phone ${d.imageId} failed its checks; it is re-checked on the next refresh`);
    }
    await db.devicePool.update({ where: { imageId: d.imageId }, data: { isEnabled: ready } });
    if (ready) checked.add(d.imageId);
    else checked.delete(d.imageId);
    } finally { await releaseLease(d.imageId, owner); }
  }
  for (const id of [...checked]) if (!devices.some((d) => d.imageId === id)) checked.delete(id);

  const ready = await db.devicePool.count({ where: { isEnabled: true } });
  const now = await db.devicePool.findMany({ orderBy: { slotIndex: "asc" } });
  health.discovery = {
    at: new Date().toISOString(),
    poweredOn: found.poweredOn,
    usable: found.active.length,
    ready,
    skipped: found.skipped,
    error: null,
    phones: now.map((d): PhoneHealth => ({ id: d.imageId, label: d.label, ready: d.isEnabled, problems: phoneProblems.get(d.imageId) ?? [] })),
  };
  log(`DuoPlus: ${found.poweredOn} phone(s) powered on, ${found.active.length} usable (active subscription + proxy record), ${ready} ready → concurrency ${ready}`);
  return ready;
}
