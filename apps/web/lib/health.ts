import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@geogrid/db";
import { packs, plans, appUrl } from "./billing";
import { missingLegalDetails } from "./site";
import { paypal, PAYPAL_BASE } from "./paypal";
import { pinQueue, redis } from "./queue";

export type Level = "ok" | "warn" | "fail" | "info";
export type Check = { id: string; platform: string; level: Level; summary: string; detail?: string; fix?: string };

const WORKER_KEY = "geogrid:health:worker";

type WorkerHealth = {
  at: string;
  version: string;
  bootAt: string;
  concurrency: number;
  paused: boolean;
  discovery: {
    at: string | null;
    poweredOn: number;
    usable: number;
    ready: number;
    skipped: string[];
    error: string | null;
    phones: Array<{ id: string; label: string | null; ready: boolean; problems: string[] }>;
  };
  proxy: { at: string | null; ok: boolean | null; message: string | null };
  pins: { completed: number; failed: number; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null };
  r2: { ok: boolean | null; error: string | null };
};

const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

async function timed<T>(ms: number, p: Promise<T>): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms)))]);
  } finally {
    if (t) clearTimeout(t);
  }
}

const REQUIRED = [
  "DATABASE_URL",
  "DIRECT_URL",
  "REDIS_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_R2_PUBLIC_DOMAIN",
];

export async function runChecks(requestOrigin: string): Promise<{ checks: Check[]; worker: WorkerHealth | null }> {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // 1. Vercel settings
  const missing = REQUIRED.filter((k) => !process.env[k] || /\.\.\.|filled-in|pub-xyz|your_/.test(process.env[k]!));
  add(
    missing.length
      ? { id: "env", platform: "Vercel settings", level: "fail", summary: `Missing or placeholder: ${missing.join(", ")}`, fix: "Vercel → Settings → Environment Variables: fill these in, then Redeploy." }
      : { id: "env", platform: "Vercel settings", level: "ok", summary: "All required variables are set." },
  );
  const app = appUrl();
  if (process.env.NEXT_PUBLIC_APP_URL && new URL(app).host !== new URL(requestOrigin).host) {
    add({ id: "app-url", platform: "Vercel settings", level: "warn", summary: `NEXT_PUBLIC_APP_URL is ${app}, but this page was opened at ${requestOrigin}.`, fix: "If this is your live address, set NEXT_PUBLIC_APP_URL to it and Redeploy; PayPal returns buyers to NEXT_PUBLIC_APP_URL." });
  }

  const legal = missingLegalDetails();
  add(
    legal.length
      ? { id: "legal", platform: "Legal pages", level: "fail", summary: `Terms and Privacy show generic wording until these are set: ${legal.join(", ")}.`, fix: "Vercel → Environment Variables: add your company's legal name, support email and governing-law jurisdiction, then Redeploy." }
      : { id: "legal", platform: "Legal pages", level: "ok", summary: "Company name, support email and jurisdiction are set on Terms, Privacy and Refunds." },
  );

  // 2. Neon
  try {
    await timed(8000, db.$queryRaw`SELECT 1`);
    const [users, phones, scans] = await timed(8000, Promise.all([db.user.count(), db.devicePool.count(), db.gridScan.count()]));
    add({ id: "neon", platform: "Neon database", level: "ok", summary: `Connected. ${users} users, ${scans} scans, ${phones} phones registered.` });
  } catch (e) {
    const m = (e as Error).message;
    const noTables = /does not exist|P2021/i.test(m);
    add({
      id: "neon",
      platform: "Neon database",
      level: "fail",
      summary: noTables ? "Connected, but the tables don't exist yet." : `Can't query the database: ${m.slice(0, 160)}`,
      fix: noTables ? "Deploy the Railway worker first; it creates the tables on boot." : "Recopy DATABASE_URL (pooled, -pooler host) and DIRECT_URL from Neon → Connect into Vercel, then Redeploy.",
    });
  }

  // 3. Upstash + queue
  let worker: WorkerHealth | null = null;
  try {
    const pong = await timed(6000, redis().ping());
    const c = await timed(6000, pinQueue().getJobCounts("waiting", "active", "delayed", "failed"));
    const raw = await timed(6000, redis().get(WORKER_KEY));
    worker = raw ? (JSON.parse(raw) as WorkerHealth) : null;
    add({ id: "upstash", platform: "Upstash Redis queue", level: pong === "PONG" ? "ok" : "warn", summary: `Reachable. Queue: ${c.waiting ?? 0} waiting, ${c.active ?? 0} running, ${c.delayed ?? 0} delayed, ${c.failed ?? 0} failed.` });
  } catch (e) {
    add({ id: "upstash", platform: "Upstash Redis queue", level: "fail", summary: `Can't reach Redis: ${(e as Error).message.slice(0, 160)}`, fix: "Recopy the rediss:// URL from Upstash → Connect into REDIS_URL in BOTH Vercel and Railway (they must match), then redeploy both." });
  }

  // 4. Railway worker (via heartbeat)
  const vercelVersion = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);
  if (!worker) {
    add({ id: "worker", platform: "Railway worker", level: "fail", summary: "No heartbeat from the worker in the last 2 minutes.", fix: "Railway → service → Deployments → View logs. Not running: Redeploy. Running: its REDIS_URL differs from Vercel's — make them identical." });
  } else {
    const stale = Date.now() - Date.parse(worker.at) > 90_000;
    add({
      id: "worker",
      platform: "Railway worker",
      level: stale ? "fail" : worker.paused ? "warn" : "ok",
      summary: stale ? `Last heartbeat ${ago(worker.at)}.` : worker.paused ? `Running but paused: no phones ready (since boot ${ago(worker.bootAt)}).` : `Running ${worker.concurrency} pins at a time. ${worker.pins.completed} pins done, ${worker.pins.failed} failed attempts since boot ${ago(worker.bootAt)}.`,
      detail: worker.pins.lastError ? `Last failed attempt (${ago(worker.pins.lastErrorAt)}): ${worker.pins.lastError}` : undefined,
      fix: stale ? "Railway → Deployments: Redeploy and read the [boot] lines." : worker.paused ? "See the DuoPlus line below." : undefined,
    });
    // GitHub: both platforms on the same commit
    add(
      worker.version !== "local" && vercelVersion !== "local" && worker.version !== vercelVersion
        ? { id: "versions", platform: "GitHub deploys", level: "warn", summary: `Vercel runs ${vercelVersion}, Railway runs ${worker.version}.`, fix: "One platform missed the last push. Redeploy the older one from its Deployments page." }
        : { id: "versions", platform: "GitHub deploys", level: "ok", summary: `Vercel ${vercelVersion} · Railway ${worker.version}.` },
    );

    // 5. DuoPlus (via heartbeat)
    const d = worker.discovery;
    const phoneLines = d.phones.map((p) => `${p.label ?? p.id}: ${p.ready ? "ready" : "not ready"}${p.problems.length ? ` (${p.problems.join("; ")})` : ""}`);
    add({
      id: "duoplus",
      platform: "DuoPlus phones",
      level: d.error ? "fail" : d.ready === 0 ? "fail" : d.ready < d.poweredOn ? "warn" : "ok",
      summary: d.error ? `Phone list call failed: ${d.error}` : `${d.poweredOn} powered on, ${d.usable} usable, ${d.ready} ready (checked ${ago(d.at)}).`,
      detail: [...d.skipped.map((s) => `Skipped ${s}`), ...phoneLines].join("\n") || undefined,
      fix: d.error ? "Check DUOPLUS_API_KEY in Railway." : d.ready === 0 ? "Power phones on with ADB enabled, renew subscriptions, bind a proxy to each (Runbook: DuoPlus)." : d.ready < d.poweredOn ? "Fix the phones listed above; the worker re-checks every 5 minutes." : undefined,
    });

    // 6. Proxy-Seller (via heartbeat)
    const px = worker.proxy;
    add(
      px.ok === null
        ? { id: "proxy", platform: "Proxy-Seller", level: "info", summary: "Not tested yet: each phone sets its rotating proxy on its first pin of a scan." }
        : { id: "proxy", platform: "Proxy-Seller", level: px.ok ? "ok" : "fail", summary: `${px.ok ? "Last setup worked" : "Last setup failed"} (${ago(px.at)}): ${px.message}`, fix: px.ok ? undefined : "Check the ISP id and city spelling on the scan, the API Tool list login/password in Railway, and your traffic balance." },
    );
  }

  // 7. Cloudflare R2: the worker wrote health/worker.json; fetch it through the public address
  const pub = (process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN ?? "").replace(/\/$/, "");
  if (worker?.r2.ok === false) {
    add({ id: "r2", platform: "Cloudflare R2", level: "fail", summary: `The worker can't write to R2: ${worker.r2.error}`, fix: "Recopy R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY into Railway; the token needs Object Read & Write on geogrid-artifacts." });
  } else if (pub) {
    try {
      const res = await timed(8000, fetch(`${pub}/health/worker.json`, { cache: "no-store" }));
      add(
        res.ok
          ? { id: "r2", platform: "Cloudflare R2", level: "ok", summary: "The worker can write and the public address serves files (videos will play)." }
          : { id: "r2", platform: "Cloudflare R2", level: "fail", summary: `Public address returned HTTP ${res.status}.`, fix: res.status === 404 && worker ? "Public address doesn't match the bucket: copy the bucket's r2.dev (or custom domain) URL into NEXT_PUBLIC_R2_PUBLIC_DOMAIN and Redeploy." : "Turn on the bucket's public r2.dev URL (bucket → Settings) and check NEXT_PUBLIC_R2_PUBLIC_DOMAIN." },
      );
    } catch (e) {
      add({ id: "r2", platform: "Cloudflare R2", level: "fail", summary: `Can't reach the public address: ${(e as Error).message}`, fix: "Check NEXT_PUBLIC_R2_PUBLIC_DOMAIN (https://pub-….r2.dev, no trailing slash)." });
    }
  }

  // 8. Clerk
  try {
    const n = await timed(8000, (await clerkClient()).users.getCount());
    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
    const sk = process.env.CLERK_SECRET_KEY ?? "";
    const mixed = (pk.startsWith("pk_live_") && sk.startsWith("sk_test_")) || (pk.startsWith("pk_test_") && sk.startsWith("sk_live_"));
    add({
      id: "clerk",
      platform: "Clerk sign-in",
      level: mixed ? "fail" : "ok",
      summary: mixed ? "Publishable and secret keys come from different instances (test vs live)." : `Keys work (${pk.startsWith("pk_live_") ? "production" : "development"} instance, ${n} accounts).`,
      fix: mixed ? "Copy both keys from the same Clerk instance, then Redeploy." : undefined,
    });
  } catch (e) {
    add({ id: "clerk", platform: "Clerk sign-in", level: "fail", summary: `Clerk rejected the secret key: ${(e as Error).message.slice(0, 120)}`, fix: "Recopy CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from Clerk → API keys, then Redeploy." });
  }

  // 9. PayPal
  const mode = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  try {
    await timed(8000, paypal("/v1/notifications/webhooks"));
    const hookId = process.env.PAYPAL_WEBHOOK_ID;
    let hookMsg = "";
    let level: Level = "ok";
    let fix: string | undefined;
    if (hookId) {
      try {
        const hook = await timed(8000, paypal<{ url?: string; event_types?: Array<{ name: string }> }>(`/v1/notifications/webhooks/${encodeURIComponent(hookId)}`));
        const want = `${app}/api/webhooks/paypal`;
        const names = new Set((hook.event_types ?? []).map((e) => e.name));
        const needed = ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.SALE.COMPLETED"].filter((n) => !names.has(n) && !names.has("*"));
        if (hook.url !== want) {
          level = "fail";
          hookMsg = ` Webhook points to ${hook.url}.`;
          fix = `Edit the webhook URL in PayPal to ${want}.`;
        } else if (needed.length) {
          level = "fail";
          hookMsg = ` Webhook is missing ${needed.join(", ")}.`;
          fix = "Tick those events on the webhook in PayPal (Runbook: PayPal).";
        } else hookMsg = " Webhook URL and events are right.";
      } catch {
        level = "fail";
        hookMsg = ` PAYPAL_WEBHOOK_ID ${hookId} wasn't found in this ${mode} app.`;
        fix = "Copy the Webhook ID from the same app and mode (sandbox or live) as your Client ID, then Redeploy.";
      }
    }
    const p = packs().length;
    if (!p) {
      level = level === "ok" ? "warn" : level;
      fix ??= "PAYPAL_PACKS_JSON is empty or invalid, so there's nothing to buy.";
    }
    add({ id: "paypal", platform: "PayPal payments", level, summary: `${mode === "live" ? "LIVE" : "Sandbox"} credentials work (${PAYPAL_BASE.replace("https://", "")}). ${p} credit packs, ${plans().length} plans.${hookMsg}`, fix });
  } catch (e) {
    add({ id: "paypal", platform: "PayPal payments", level: "fail", summary: `PayPal rejected the ${mode} credentials: ${(e as Error).message.slice(0, 140)}`, fix: `Client ID and Secret must come from the ${mode} tab of the same app, matching PAYPAL_ENV.` });
  }

  // 10. Recent pin failures (Neon), grouped by error
  try {
    const since = new Date(Date.now() - 24 * 3600_000);
    const failed = await timed(8000, db.gridPin.findMany({ where: { status: "FAILED", finishedAt: { gte: since } }, select: { lastError: true }, take: 500 }));
    const done = await timed(8000, db.gridPin.count({ where: { status: "COMPLETED", finishedAt: { gte: since } } }));
    if (!failed.length && !done) add({ id: "pins", platform: "Scans (last 24 h)", level: "info", summary: "No pins finished in the last 24 hours yet." });
    else {
      const groups = new Map<string, number>();
      for (const f of failed) {
        const k = (f.lastError ?? "unknown").replace(/[0-9a-f]{6,}|\d+(\.\d+)?/gi, "#").slice(0, 90);
        groups.set(k, (groups.get(k) ?? 0) + 1);
      }
      const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const rate = failed.length / (failed.length + done);
      add({
        id: "pins",
        platform: "Scans (last 24 h)",
        level: rate > 0.2 ? "fail" : rate > 0 ? "warn" : "ok",
        summary: `${done} pins completed, ${failed.length} failed (refunded).`,
        detail: top.map(([k, n]) => `${n}× ${k}`).join("\n") || undefined,
        fix: rate > 0 ? "Find the most common error in the Runbook's platform sections." : undefined,
      });
    }
  } catch {
    /* already reported by the Neon check */
  }

  return { checks, worker };
}

export const overall = (checks: Check[]): Level =>
  checks.some((c) => c.level === "fail") ? "fail" : checks.some((c) => c.level === "warn") ? "warn" : "ok";
