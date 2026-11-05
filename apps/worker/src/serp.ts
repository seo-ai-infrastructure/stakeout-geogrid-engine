/**
 * Step 7 outputs (spec §9): the phone's per-stop UI dumps become
 *  - serp.xml  one document holding every scroll stop, in order (the full results list)
 *  - serp.json structured listings for reporting
 *  - serp.html a self-contained recreation of the results list, viewable anywhere
 */
import type { Business } from "./parse.js";

export function mergeDumps(files: Map<string, Buffer>, meta: Record<string, string | number>): string {
  const dumps = [...files.keys()]
    .filter((k) => /dump_\d+\.xml$/.test(k))
    .sort((a, b) => Number(/dump_(\d+)/.exec(a)![1]) - Number(/dump_(\d+)/.exec(b)![1]));
  const attrs = Object.entries(meta)
    .map(([k, v]) => `${k}="${xmlEsc(String(v))}"`)
    .join(" ");
  const stops = dumps.map((k, i) => {
    const body = files
      .get(k)!
      .toString("utf8")
      .replace(/^\s*<\?xml[^>]*\?>\s*/, "");
    return `  <stop index="${i}" file="${xmlEsc(k.split("/").pop()!)}">\n${body}\n  </stop>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<serp ${attrs}>\n${stops.join("\n")}\n</serp>\n`;
}

export type SerpReport = {
  scanId: string;
  pinId: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
  keyword: string;
  targetBusiness: string;
  surface: string;
  capturedAt: string;
  exit: { rotation: string; rung: string | null; sampleIp: string | null; city: string | null; region: string | null; isp: string | null };
  rank: number | null;
  listings: Array<Business & { position: number | null; isTarget: boolean }>;
  flags: string[];
};

export function buildReport(base: Omit<SerpReport, "listings">, organic: Business[], sponsored: Business[], targetIdx: number): SerpReport {
  const listings: SerpReport["listings"] = [
    ...sponsored.map((b) => ({ ...b, position: null, isTarget: false })),
    ...organic.map((b, i) => ({ ...b, position: i + 1, isTarget: i === targetIdx })),
  ];
  return { ...base, listings };
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const h = xmlEsc;

const stars = (r?: number) => (r == null ? "" : `<span class="rating">${r.toFixed(1)} <span aria-hidden="true">★</span></span>`);

export function renderSerpHtml(r: SerpReport): string {
  const items = r.listings
    .map(
      (b) => `
    <li class="card${b.isTarget ? " target" : ""}${b.sponsored ? " ad" : ""}">
      <div class="pos">${b.sponsored ? "Ad" : b.position}</div>
      <div class="body">
        <div class="name">${h(b.name)}${b.isTarget ? ' <span class="tag">target</span>' : ""}</div>
        <div class="meta">${stars(b.rating)}${b.reviews != null ? ` <span class="muted">(${b.reviews.toLocaleString("en-US")})</span>` : ""}</div>
        ${b.details.map((d) => `<div class="detail">${h(d)}</div>`).join("")}
      </div>
    </li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(r.keyword)} — pin ${r.row + 1},${r.col + 1}</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--ink:#16202a;--muted:#5b6b7a;--rule:#d9e0e6;--hit:#1b9e4b;--ad:#b26b00}
@media (prefers-color-scheme:dark){:root{--bg:#11181f;--card:#18222c;--ink:#e6edf3;--muted:#9aabbb;--rule:#2a3846}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{padding:16px 18px;border-bottom:1px solid var(--rule);background:var(--card)}
h1{font-size:18px;margin:0 0 4px}.muted{color:var(--muted)}.small{font-size:13px}
ol{list-style:none;margin:0;padding:12px;max-width:560px}
.card{display:flex;gap:12px;background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:12px;margin-bottom:8px}
.card.target{border:2px solid var(--hit)}.card.ad .pos{color:var(--ad)}
.pos{min-width:28px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--muted)}
.name{font-weight:600}.tag{font-size:11px;color:#fff;background:var(--hit);border-radius:999px;padding:1px 7px;vertical-align:2px}
.rating{font-variant-numeric:tabular-nums}.detail{color:var(--muted);font-size:13px}
dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:8px 0 0;font-size:13px}dt{color:var(--muted)}dd{margin:0}
</style></head><body>
<header>
  <h1>“${h(r.keyword)}”</h1>
  <div class="muted small">${h(r.surface)} · pin row ${r.row + 1}, col ${r.col + 1} · ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} · ${h(r.capturedAt)}</div>
  <dl>
    <dt>Target</dt><dd>${h(r.targetBusiness.split("|")[0])} — ${r.rank ? `rank ${r.rank}` : "not in top 20"}</dd>
    <dt>Exit</dt><dd>${h([r.exit.city, r.exit.region].filter(Boolean).join(", ") || "unknown")}${r.exit.isp ? ` · ${h(r.exit.isp)}` : ""} · ${h(r.exit.rotation)} rotation${r.exit.sampleIp ? ` · sample IP ${h(r.exit.sampleIp)}` : ""}</dd>
    ${r.flags.length ? `<dt>Flags</dt><dd>${h(r.flags.join(", "))}</dd>` : ""}
  </dl>
</header>
<ol>${items || '<li class="muted">No listings were recognised in the captured screens.</li>'}
</ol>
</body></html>
`;
}
