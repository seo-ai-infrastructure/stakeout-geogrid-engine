import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { healthAllowed } from "@/lib/healthAuth";
import { overall, runChecks, type Level } from "@/lib/health";

export const dynamic = "force-dynamic";

const LABEL: Record<Level, string> = { ok: "OK", warn: "Check", fail: "Broken", info: "Info" };
const COLOR: Record<Level, string> = { ok: "var(--rank-top)", warn: "var(--rank-mid)", fail: "var(--rank-low)", info: "var(--rank-none)" };

export default async function StatusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  if (!healthAllowed(token)) notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { checks } = await runChecks(origin);
  const all = overall(checks);
  const broken = checks.filter((c) => c.level === "fail").length;
  const warns = checks.filter((c) => c.level === "warn").length;

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <h1>System status</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {all === "ok" ? "Every platform is working." : `${broken} broken, ${warns} to check. Fix from the top down: later checks often depend on earlier ones.`}{" "}
        Checked {new Date().toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC. Refresh to re-run.
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 10 }}>
        {checks.map((c) => (
          <li key={`${c.id}-${c.platform}`} className="form" style={{ gap: 6, borderLeft: `4px solid ${COLOR[c.level]}`, borderRadius: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <strong>{c.platform}</strong>
              <span className="status" style={{ borderColor: COLOR[c.level], color: COLOR[c.level] }}>{LABEL[c.level]}</span>
            </div>
            <div>{c.summary}</div>
            {c.detail && <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13, color: "var(--ink-2)", fontFamily: "inherit" }}>{c.detail}</pre>}
            {c.fix && <div style={{ fontSize: 14 }}><span className="muted">Fix: </span>{c.fix}</div>}
          </li>
        ))}
      </ol>
      <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
        Stuck? Open <code>/api/health?token=…</code> and paste the whole result into the chat.
      </p>
    </main>
  );
}
