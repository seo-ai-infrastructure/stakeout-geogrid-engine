import { randomUUID } from "node:crypto";
import { DelayedError, UnrecoverableError, type Job } from "bullmq";
import { db, type DevicePool, type Prisma } from "@geogrid/db";
import { env, MOBILE, DEVICE_RT_DIR, DEVICE_SCRIPT_PATH } from "./config.js";
import { checkProxy, command, pullFile, pushScript, scriptOnDevice, setupDevice, updatePhones, RUN_PIN_MD5 } from "./duoplus.js";
import { validateSavedProxy } from "./savedProxy.js";
import { configureRotatingProxy, geoKey, type GeoTarget } from "./proxySeller.js";
import { artifactKey, exists, getBuffer, presignPut, putBuffer } from "./r2.js";
import { extendLease, releaseLease, sleep, tryLease } from "./redis.js";
import { parsePinTar, assertRankingEvidence } from "./parse.js";
import { buildReport, mergeDumps, renderSerpHtml } from "./serp.js";
import { completePin } from "./finalize.js";
import { recordProxy } from "./health.js";

export type PinJobData = { scanId: string; pinId: string; targetType: string };

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const PINS_DIR = `${DEVICE_RT_DIR}/pins`;

async function leaseDevice(owner: string): Promise<DevicePool | null> {
  const candidates = await db.devicePool.findMany({
    where: { isEnabled: true, cooldownUntil: { lte: new Date() } },
    orderBy: { lastUsedAt: "asc" },
  });
  for (const d of candidates) if (await tryLease(d.imageId, owner)) return d;
  return null;
}

export async function ensureDeviceReady(device: DevicePool, log: (m: string) => void): Promise<void> {
  if (!device.setupAt) {
    log("one-time device setup (animations off)");
    await setupDevice(device.imageId);
    await db.devicePool.update({ where: { imageId: device.imageId }, data: { setupAt: new Date() } });
  }
  if (device.scriptMd5 !== RUN_PIN_MD5) {
    if (!(await scriptOnDevice(device.imageId))) {
      log(`pushing run_pin.sh (${RUN_PIN_MD5.slice(0, 8)})`);
      await pushScript(device.imageId);
    }
    await db.devicePool.update({ where: { imageId: device.imageId }, data: { scriptMd5: RUN_PIN_MD5 } });
  }
}

/**
 * Proxy step (spec §7.6): a phone's rotating proxy is set once per scan area, not
 * per pin. Only when the phone moves to a scan in a different area (or its proxy
 * record changed) do we touch Proxy-Seller / DuoPlus proxy endpoints.
 */
async function ensureRotatingProxy(device: DevicePool, target: GeoTarget, log: (m: string) => void): Promise<DevicePool> {
  if (env.PROXY_MODE === "saved") {
    try {
      const check = await validateSavedProxy(device.proxyId, target, checkProxy);
      await updatePhones([{ image_id: device.imageId, proxy: { id: device.proxyId, dns: 1 },
        locale: { type: 2, timezone: check.timezone, language: "en-US" } }]);
      await sleep(MOBILE.settleAfterProxyMs);
      const updated = await db.devicePool.update({ where: { imageId: device.imageId }, data: {
        proxyGeoKey: `saved:${geoKey(target)}`, proxyLogin: null, proxyRung: "SAVED",
        proxyCheck: check.raw as Prisma.InputJsonValue, proxyConfiguredAt: new Date(),
      } });
      recordProxy(true, `${device.imageId}: saved proxy verified in ${check.city}, ${check.region}`);
      log(`saved proxy verified in ${check.city}/${check.region}; provider settings preserved`);
      return updated;
    } catch (e) {
      recordProxy(false, `${device.imageId}: ${(e as Error).message}`);
      throw e;
    }
  }
  if (device.proxyGeoKey === geoKey(target) && device.proxyLogin) return device;
  let bound;
  try {
    bound = await configureRotatingProxy({
      proxyId: device.proxyId,
      slotIndex: device.slotIndex,
      deviceTag: `${device.imageId}${device.slotIndex}`,
      target,
      log,
    });
    recordProxy(true, `${device.imageId}: ${bound.rung} in ${target.city}, ${target.stateCode} (sample ${bound.check.ip ?? "?"}, ${bound.check.city ?? "?"})`);
  } catch (e) {
    recordProxy(false, `${device.imageId} for ${target.city}, ${target.stateCode} ISP ${target.ispId}: ${(e as Error).message}`);
    throw e;
  }
  // re-bind the record to the phone and match its time zone to the exit area
  await updatePhones([
    {
      image_id: device.imageId,
      proxy: { id: device.proxyId, dns: 1 },
      locale: { type: 2, timezone: bound.check.timezone, language: "en-US" },
    },
  ]);
  await sleep(MOBILE.settleAfterProxyMs);
  return db.devicePool.update({
    where: { imageId: device.imageId },
    data: {
      proxyGeoKey: bound.geoKey,
      proxyLogin: bound.login,
      proxyRung: bound.rung,
      proxyCheck: (bound.check.raw ?? {}) as Prisma.InputJsonValue,
      proxyConfiguredAt: new Date(),
    },
  });
}

/** Android `input text` can't take spaces or most punctuation: spaces → %s, keep a safe charset. */
export function typedQuery(q: string): string {
  return q
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 .,-]/g, "")
    .trim()
    .replace(/\s+/g, "%s");
}

async function readStatus(imageId: string, tag: string): Promise<string> {
  return command(
    [imageId],
    `cat ${PINS_DIR}/${tag}/status 2>/dev/null; echo; tail -n 6 ${DEVICE_RT_DIR}/last.log 2>/dev/null`,
  );
}

export async function processMobilePin(job: Job<PinJobData>, token?: string): Promise<void> {
  const { pinId, scanId } = job.data;
  const pin = await db.gridPin.findUnique({ where: { id: pinId }, include: { scan: true } });
  if (!pin) throw new UnrecoverableError(`pin ${pinId} not found`);
  if (pin.scanId !== scanId) throw new UnrecoverableError("Pin and scan mismatch");
  if (pin.status === "COMPLETED" || pin.status === "FAILED") return;
  const scan = pin.scan;
  const appArg = scan.targetType === "mobile_chrome" ? "chrome" : scan.targetType === "mobile_google" ? "google" : "maps";
  const surface = appArg === "chrome" ? "Chrome (Android)" : appArg === "google" ? "Google app (Android)" : "Google Maps (Android)";

  // lease a phone (no attempt consumed when none is free)
  const owner = `${pinId}-${randomUUID()}`;
  let device = await leaseDevice(owner);
  if (!device) {
    await job.moveToDelayed(Date.now() + 5000, token);
    throw new DelayedError();
  }
  const log = (m: string) => console.log(`[${scanId.slice(-6)}/${pin.rowIdx},${pin.colIdx} dev=${device!.imageId}] ${m}`);

  const tag = `${scanId}_${pinId}`;
  const key = (name: string) => artifactKey(scanId, pin.rowIdx, pin.colIdx, `${owner}/${name}`);
  const tarKey = key("dumps.tar.gz");
  const videoKey = key("video.mp4");
  const t0 = Date.now();
  let needsRebind = false;

  let leaseLost = false;
  let extending = false;
  const leaseTimer = setInterval(async () => {
    if (extending) return;
    extending = true;
    try { if (!await extendLease(device!.imageId, owner)) leaseLost = true; }
    catch { leaseLost = true; }
    finally { extending = false; }
  }, 30_000);
  const assertLease = async () => {
    if (leaseLost || !await extendLease(device!.imageId, owner)) throw new Error("Device lease lost");
  };
  try {
  await db.gridPin.update({
    where: { id: pinId },
    data: { status: "IN_PROGRESS", attempts: { increment: 1 }, assignedDeviceId: device.imageId, startedAt: new Date(), lastError: null },
  });

    await db.gridScan.updateMany({ where: { id: scanId, status: "QUEUED" }, data: { status: "RUNNING" } });
    // proxy: already set for this scan area on all but the phone's first pin of the scan
    device = await ensureRotatingProxy(device, { zip: scan.zip, city: scan.city, stateCode: scan.stateCode, ispId: scan.ispId }, log);

    // step 1: update GPS location to the pin
    await updatePhones([{ image_id: device.imageId, gps: { type: 2, latitude: String(pin.lat), longitude: String(pin.lng) } }]);
    await sleep(MOBILE.settleAfterUpdateMs);

    await ensureDeviceReady(device, log);
    await assertLease();

    // steps 2–7 run on the phone in one backgrounded script (clear → record → open → search → slow scroll → dump)
    const direct = !env.UNBIND_PROXY_BEFORE_UPLOAD;
    const [tarUrl, videoUrl] = await Promise.all([presignPut(tarKey), presignPut(videoKey)]);
    const launch =
      `mkdir -p ${PINS_DIR} && rm -rf ${PINS_DIR}/* 2>/dev/null; ` +
      `UPLOAD_TAR=${sq(direct ? tarUrl : "")} UPLOAD_VIDEO=${sq(direct ? videoUrl : "")} ` +
      `nohup sh ${DEVICE_SCRIPT_PATH} ${appArg} ${pin.lat} ${pin.lng} ${sq(scan.keyword)} ${sq(encodeURIComponent(scan.keyword))} ` +
      `${sq(typedQuery(scan.keyword))} ${scanId} ${pinId} > ${DEVICE_RT_DIR}/last.log 2>&1 &`;
    await command([device.imageId], launch);
    log(`launched ${appArg} at ${pin.lat},${pin.lng}`);

    // wait for the run, then poll R2 (zero DuoPlus calls while waiting)
    await sleep(MOBILE.initialWaitMs);
    let tarBuf: Buffer | null = null;
    let status = "";
    const deadline = Date.now() + MOBILE.tarPollMaxMs;
    while (Date.now() < deadline) {
      await assertLease();
      if (direct) {
        if (await exists(tarKey)) {
          tarBuf = await getBuffer(tarKey);
          break;
        }
      } else {
        status = await readStatus(device.imageId, tag);
        if (/^done/m.test(status)) {
          // unbind the residential proxy so uploads never cost Proxy-Seller traffic, then re-bind
          await updatePhones([{ image_id: device.imageId, proxy: { id: "", dns: 0 } }]);
          needsRebind = true;
          await sleep(2000);
          await command([device.imageId], `curl -sS -f --max-time 8 -X PUT -T ${PINS_DIR}/${tag}.tar.gz ${sq(tarUrl)} && echo tar_ok`);
          await command([device.imageId], `nohup curl -sS -f --max-time 120 -X PUT -T ${PINS_DIR}/${tag}/video.mp4 ${sq(videoUrl)} >/dev/null 2>&1 &`);
          for (let i = 0; i < 6 && !tarBuf; i++) {
            if (await exists(tarKey)) tarBuf = await getBuffer(tarKey);
            else await sleep(3000);
          }
          break;
        }
        if (/upload_failed|no_curl/.test(status)) break;
      }
      await sleep(MOBILE.tarPollIntervalMs);
    }

    // fallback: pull the (small) tarball through the command API
    if (!tarBuf) {
      status = status || (await readStatus(device.imageId, tag));
      if (/no_curl|upload_failed|packaged|done|uploaded/.test(status)) {
        log(`pulling dumps via command API (status=${status.split("\n")[0]})`);
        tarBuf = await pullFile(device.imageId, `${PINS_DIR}/${tag}.tar.gz`);
        await putBuffer(tarKey, tarBuf, "application/gzip");
      } else {
        throw new Error(`artifacts never arrived; device status: ${status.replace(/\s+/g, " ").slice(0, 300)}`);
      }
    }

    // parse + CAPTCHA policy (with a rotating proxy the retry exits from a different IP)
    await assertLease();
    const parsed = parsePinTar(tarBuf, scan.targetBusiness);
    if (parsed.captcha) {
      await db.devicePool.update({
        where: { imageId: device.imageId },
        data: { cooldownUntil: new Date(Date.now() + MOBILE.captchaCooldownMs) },
      });
      throw new Error("captcha detected in dumps; phone cooled down, pin will retry on another phone or IP");
    }
    assertRankingEvidence(parsed);
    let videoPresent = await exists(videoKey);
    const vDeadline = Date.now() + MOBILE.videoPollMaxMs;
    while (!videoPresent && Date.now() < vDeadline) {
      await sleep(5000);
      videoPresent = await exists(videoKey);
    }
    // uploads went out without the proxy: re-bind only now, after the video has landed
    if (needsRebind) {
      await updatePhones([{ image_id: device.imageId, proxy: { id: device.proxyId, dns: 1 } }]);
      needsRebind = false;
    }
    const flags = [...parsed.flags];
    if (!videoPresent) throw new Error("Video receipt was not uploaded; retrying this pin");

    // step 7 outputs: merged XML, JSON listings, HTML recreation
    const sample = (device.proxyCheck ?? {}) as Record<string, unknown>;
    const pick = (...k: string[]) => {
      for (const x of k) if (typeof sample[x] === "string" && sample[x]) return sample[x] as string;
      return null;
    };
    const capturedAt = new Date().toISOString();
    const report = buildReport(
      {
        scanId, pinId, row: pin.rowIdx, col: pin.colIdx, lat: pin.lat, lng: pin.lng,
        keyword: scan.keyword, targetBusiness: scan.targetBusiness, surface, capturedAt,
        exit: {
          rotation: env.PROXY_MODE === "saved" ? "provider-managed (saved proxy)" : env.PROXY_ROTATION === "request" ? "per-request" : `sticky ${env.PROXY_STICKY_MINUTES} min`,
          rung: device.proxyRung,
          sampleIp: pick("ip", "proxyIp", "proxy_ip", "public_ip"),
          city: pick("city"),
          region: pick("region", "regionName", "province", "state"),
          isp: pick("isp", "org"),
        },
        rank: parsed.rank,
        flags,
      },
      parsed.businesses,
      parsed.sponsored,
      parsed.targetIdx,
    );
    const serpXmlKey = key("serp.xml");
    const serpJsonKey = key("serp.json");
    const serpHtmlKey = key("serp.html");
    const metaKey = key("meta.json");
    await Promise.all([
      putBuffer(serpXmlKey, mergeDumps(parsed.files, { scan: scanId, pin: pinId, lat: pin.lat, lng: pin.lng, keyword: scan.keyword, captured: capturedAt }), "application/xml; charset=utf-8"),
      putBuffer(serpJsonKey, JSON.stringify(report, null, 2), "application/json"),
      putBuffer(serpHtmlKey, renderSerpHtml(report), "text/html; charset=utf-8"),
      putBuffer(
        metaKey,
        JSON.stringify(
          {
            ...report,
            device: device.imageId,
            proxy: { mode: env.PROXY_MODE, rotation: report.exit.rotation, rung: device.proxyRung, port: env.PROXY_MODE === "saved" ? null : 10000 + device.slotIndex, configuredAt: device.proxyConfiguredAt, sample: device.proxyCheck },
            deviceMeta: parsed.meta,
            timings: { startedAt: new Date(t0).toISOString(), finishedAt: capturedAt, seconds: Math.round((Date.now() - t0) / 1000) },
            artifacts: { video: videoPresent ? videoKey : null, dumps: tarKey, serpXml: serpXmlKey, serpJson: serpJsonKey, serpHtml: serpHtmlKey },
          },
          null,
          2,
        ),
        "application/json",
      ),
    ]);

    await assertLease();
    await completePin(pinId, scanId, {
      rankFound: parsed.rank,
      matchedDumpIdx: parsed.matchedDumpIdx,
      topCompetitors: parsed.businesses,
      proxyMeta: { rotation: report.exit.rotation, rung: device.proxyRung, configuredAt: device.proxyConfiguredAt, sample: device.proxyCheck },
      proxyRung: device.proxyRung,
      exitIp: report.exit.sampleIp,
      flags,
      videoKey: videoPresent ? videoKey : null,
      dumpsTarKey: tarKey,
      serpXmlKey,
      serpJsonKey,
      serpHtmlKey,
      metaJsonKey: metaKey,
      assignedDeviceId: device.imageId,
    });
    log(`done rank=${parsed.rank ?? "n/a"} listings=${parsed.businesses.length} stops=${parsed.stops} flags=${flags.join(",")} in ${Math.round((Date.now() - t0) / 1000)}s`);
  } finally {
    clearInterval(leaseTimer);
    // if the proxy was left unbound (error mid-upload), force the next pin to set it up again
    await db.devicePool
      .update({ where: { imageId: device.imageId }, data: { lastUsedAt: new Date(), ...(needsRebind ? { proxyGeoKey: null } : {}) } })
      .catch(() => {});
    await releaseLease(device.imageId, owner).catch(() => {});
  }
}
