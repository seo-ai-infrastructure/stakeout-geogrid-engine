import { db } from "@geogrid/db";
import { mailer } from "./mail";
import { checkStorage } from "./storage";
import { packs, plans, appUrl } from "./billing";
import { missingLegalDetails } from "./site";
import { paypal } from "./paypal";

export type Level = "ok" | "warn" | "fail" | "info";
export type Check = { id: string; platform: string; level: Level; summary: string; detail?: string; fix?: string };
type WorkerHealth = { at: string; version: string; paused: boolean; concurrency: number; queue: { ok: boolean }; r2: { ok: boolean }; discovery: { ready: number; poweredOn: number; error: string | null; skipped: string[]; phones: Array<{ id: string; ready: boolean; problems: string[] }> }; proxy: { ok: boolean | null; message: string | null }; };
async function timed<T>(p: Promise<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([p, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Check timed out")), ms); })]); }
  finally { clearTimeout(timer!); }
}
export async function runChecks(_requestOrigin: string): Promise<{ checks: Check[]; worker: WorkerHealth | null }> {
  const checks: Check[] = [];
  let worker: WorkerHealth | null = null;
  const tasks = [
    (async () => {
      try {
        const [users, scans, pending, state] = await timed(Promise.all([db.user.count(), db.gridScan.count(), db.pinDispatch.count({ where: { dispatchedAt: null } }), db.workerState.findUnique({ where: { id: "worker" } })]));
        checks.push({ id: "neon", platform: "Neon database", level: "ok", summary: `Connected. ${users} accounts, ${scans} scans, ${pending} pins awaiting dispatch.` });
        worker = state?.payload as WorkerHealth | null;
        const fresh = worker && Date.now() - Date.parse(worker.at) < 120_000;
        checks.push({ id: "worker", platform: "Railway worker", level: !fresh ? "fail" : worker?.paused ? "warn" : "ok", summary: !fresh ? "No recent worker heartbeat." : `${worker!.discovery.ready} phones ready. ${worker!.concurrency} concurrent pins.`, fix: !fresh ? "Check Railway worker logs and its database connection." : undefined });
        if (fresh && worker) {
          checks.push({ id: "queue", platform: "Railway Redis", level: worker.queue?.ok ? "ok" : "fail", summary: worker.queue?.ok ? "Worker can reach the private Redis queue." : "Worker cannot reach Redis." });
          checks.push({ id: "phones", platform: "DuoPlus phones", level: worker.discovery.ready ? "ok" : "fail", summary: worker.discovery.error || `${worker.discovery.poweredOn} powered on; ${worker.discovery.ready} ready.`, detail: [...worker.discovery.skipped, ...worker.discovery.phones.filter(p => !p.ready).map(p => `${p.id}: ${p.problems.join("; ")}`)].join("\n") });
          checks.push({ id: "proxy", platform: "Proxy-Seller", level: worker.proxy.ok === null ? "info" : worker.proxy.ok ? "ok" : "fail", summary: worker.proxy.message || "Proxy targeting is verified on the first real scan." });
        }
      } catch { checks.push({ id: "neon", platform: "Neon database", level: "fail", summary: "Database query failed. Check connection and migrations." }); }
    })(),
    (async () => { try { await timed(checkStorage()); checks.push({ id: "r2", platform: "Cloudflare R2", level: "ok", summary: "Private capture bucket is accessible. Downloads require scan ownership." }); } catch { checks.push({ id: "r2", platform: "Cloudflare R2", level: "fail", summary: "Bucket access failed. Check R2 credentials and bucket name." }); } })(),
    (async () => { try { await timed(mailer().verify()); checks.push({ id: "email", platform: "Resend sign-in", level: "ok", summary: "SMTP authentication and TLS connection verified. No email sent by this check." }); } catch { checks.push({ id: "email", platform: "Resend sign-in", level: "fail", summary: "SMTP connection failed. Check SMTP credentials and SMTP_FROM." }); } })(),
    (async () => {
      try {
        if (!process.env.PAYPAL_WEBHOOK_ID) throw new Error("Webhook not configured");
        const hook = await timed(paypal<{ url: string; event_types: Array<{ name: string }> }>(`/v1/notifications/webhooks/${encodeURIComponent(process.env.PAYPAL_WEBHOOK_ID)}`));
        const events = new Set(hook.event_types.map(e => e.name));
        const valid = hook.url === `${appUrl()}/api/webhooks/paypal` && (events.has("*") || events.has("PAYMENT.CAPTURE.COMPLETED"));
        checks.push({ id: "paypal", platform: "PayPal billing", level: valid && packs().length ? "ok" : "fail", summary: valid ? `${packs().length} packs, ${plans().length} monthly plans. Webhook configured.` : "Webhook URL or events do not match this app.", fix: valid ? undefined : `Set the PayPal webhook URL to ${appUrl()}/api/webhooks/paypal and enable PAYMENT.CAPTURE.COMPLETED.` });
      } catch { checks.push({ id: "paypal", platform: "PayPal billing", level: "fail", summary: "PayPal credentials or webhook could not be verified." }); }
    })(),
  ];
  await Promise.all(tasks);
  const missing = missingLegalDetails();
  checks.push({ id: "legal", platform: "Business details", level: missing.length ? "warn" : "ok", summary: missing.length ? `Confirm business details: ${missing.join(", ")}.` : "Business details configured." });
  return { checks: checks.sort((a, b) => a.id.localeCompare(b.id)), worker };
}
export const overall = (checks: Check[]): Level => checks.some(c => c.level === "fail") ? "fail" : checks.some(c => c.level === "warn") ? "warn" : "ok";
