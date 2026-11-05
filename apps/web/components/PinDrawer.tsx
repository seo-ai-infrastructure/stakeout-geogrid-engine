"use client";

import { artifactUrl, rankBand } from "@/lib/artifacts";
import type { ScanDto } from "./GeoGrid";

export type PinDto = {
  id: string;
  rowIdx: number;
  colIdx: number;
  lat: number;
  lng: number;
  status: string;
  attempts: number;
  rankFound: number | null;
  topCompetitors: Array<{ name: string; sponsored?: boolean; dumpIdx?: number; rating?: number; reviews?: number; details?: string[] }> | null;
  proxyMeta: Record<string, unknown> | null;
  proxyRung: string | null;
  exitIp: string | null;
  flags: string[] | null;
  videoKey: string | null;
  dumpsTarKey: string | null;
  serpXmlKey: string | null;
  serpJsonKey: string | null;
  serpHtmlKey: string | null;
  metaJsonKey: string | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

export default function PinDrawer({ pin, scan, onClose }: { pin: PinDto; scan: ScanDto; onClose: () => void }) {
  const band = rankBand(pin.status, pin.rankFound);
  const video = artifactUrl(pin.videoKey);
  const proxy = (pin.proxyMeta ?? {}) as Record<string, unknown>;
  const meta = ((proxy.sample as Record<string, unknown> | undefined) ?? proxy) as Record<string, unknown>;
  const rotation = str(proxy.rotation);
  const city = str(meta.city);
  const region = str(meta.region ?? meta.regionName ?? meta.province ?? meta.state);
  const isp = str(meta.isp ?? meta.org);
  const tz = str(meta.timezone ?? meta.timeZone);
  const serpHtml = artifactUrl(pin.serpHtmlKey);
  const aliases = scan.targetBusiness.split("|").map((s) => s.trim().toLowerCase());
  const seconds = pin.startedAt && pin.finishedAt ? Math.round((new Date(pin.finishedAt).getTime() - new Date(pin.startedAt).getTime()) / 1000) : null;

  return (
    <aside className="drawer" aria-label={`Pin row ${pin.rowIdx + 1} column ${pin.colIdx + 1}`}>
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h2>
        Row {pin.rowIdx + 1}, column {pin.colIdx + 1}{" "}
        <span className="pin" data-band={band} style={{ display: "inline-grid", verticalAlign: "middle", marginLeft: 6 }}>
          {pin.status === "COMPLETED" ? (pin.rankFound ?? "20+") : pin.status === "FAILED" ? "×" : "·"}
        </span>
      </h2>
      <div className="muted num" style={{ fontSize: 13 }}>
        {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)} · {pin.status.toLowerCase()} · attempt {pin.attempts}{seconds != null ? ` · ${seconds}s` : ""}
      </div>

      {pin.status === "PENDING" || pin.status === "IN_PROGRESS" ? (
        <p className="muted">This pin is {pin.status === "IN_PROGRESS" ? "running on a device now" : "waiting for a free device"}. The page refreshes every 5 seconds.</p>
      ) : null}
      {pin.status === "FAILED" && (
        <p className="error">Failed after {pin.attempts} attempts and refunded. Last error: {pin.lastError ?? "unknown"}</p>
      )}

      {video && (
        <>
          <h3>Session recording</h3>
          <video controls preload="metadata" src={video} />
        </>
      )}

      {pin.status === "COMPLETED" && (
        <>
          <h3>Residential exit</h3>
          <dl className="kv">
            <dt>Exit area</dt><dd>{[city, region].filter(Boolean).join(", ") || "–"}</dd>
            <dt>ISP</dt><dd>{isp || "–"}</dd>
            <dt>Targeting</dt><dd>{pin.proxyRung ?? "–"}{rotation ? ` · ${rotation} rotation` : ""}</dd>
            <dt>Sample IP</dt><dd className="num">{pin.exitIp ?? "–"}</dd>
            <dt>Timezone</dt><dd>{tz || "–"}</dd>
          </dl>
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            The phone&apos;s proxy rotates its IP within this area, so the sample IP was checked when the proxy was set up, not during this exact search.
          </p>

          <h3>Results in order</h3>
          {pin.topCompetitors && pin.topCompetitors.length ? (
            <ol>
              {pin.topCompetitors.map((b, i) => {
                const n = b.name.toLowerCase();
                const hit = aliases.some((a) => a && (n === a || n.includes(a) || a.includes(n)));
                return (
                  <li key={`${i}-${b.name}`} data-hit={hit}>
                    {b.name}
                    {b.sponsored ? <span className="muted"> (sponsored)</span> : null}
                    {b.rating != null ? (
                      <span className="muted num">
                        {" "}· {b.rating.toFixed(1)}★{b.reviews != null ? ` (${b.reviews.toLocaleString("en-US")})` : ""}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted">No business names were recognised in the dumps. Open the raw dumps below to inspect the hierarchy.</p>
          )}

          {pin.flags && pin.flags.length > 0 && (
            <>
              <h3>Flags</h3>
              {pin.flags.map((f) => (
                <span key={f} className="flag">{f}</span>
              ))}
            </>
          )}

          {serpHtml && (
            <>
              <h3>Results page recreation</h3>
              <a className="btn secondary" href={serpHtml} target="_blank" rel="noreferrer" style={{ display: "inline-block" }}>
                Open SERP report
              </a>
            </>
          )}

          <h3>Raw artifacts</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13 }}>
            {artifactUrl(pin.serpXmlKey) && <a href={artifactUrl(pin.serpXmlKey)!}>serp.xml</a>}
            {artifactUrl(pin.serpJsonKey) && <a href={artifactUrl(pin.serpJsonKey)!}>serp.json</a>}
            {artifactUrl(pin.dumpsTarKey) && <a href={artifactUrl(pin.dumpsTarKey)!}>dumps.tar.gz</a>}
            {artifactUrl(pin.metaJsonKey) && <a href={artifactUrl(pin.metaJsonKey)!}>meta.json</a>}
            {video && <a href={video}>video</a>}
          </div>
        </>
      )}
    </aside>
  );
}
