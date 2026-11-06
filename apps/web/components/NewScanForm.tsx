"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const TARGETS = [
  ["mobile_maps", "Google Maps app (Android)", 1],
  ["mobile_google", "Google app (Android)", 1],
  ["mobile_chrome", "Chrome mobile SERP", 1],
] as const;

export default function NewScanForm({ creditBalance }: { creditBalance: number }) {
  const router = useRouter();
  const [f, setF] = useState({
    keyword: "",
    targetBusiness: "",
    targetType: "mobile_maps" as (typeof TARGETS)[number][0],
    centerLat: "",
    centerLng: "",
    zip: "",
    city: "",
    stateCode: "FL",
    gridSize: 3,
    spacingKm: 1.60934,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cost = useMemo(() => {
    const per = TARGETS.find((t) => t[0] === f.targetType)?.[2] ?? 1;
    return f.gridSize * f.gridSize * per;
  }, [f.gridSize, f.targetType]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit() {
    if (![f.keyword, f.targetBusiness, f.centerLat, f.centerLng, f.city, f.zip].every(v => v.trim())) { setErr("Complete every field before starting a scan."); return; }
    setBusy(true);
    setErr(null);
    try {
    const res = await fetch("/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...f,
        centerLat: Number(f.centerLat),
        centerLng: Number(f.centerLng),
        gridSize: Number(f.gridSize),
        spacingKm: Number(f.spacingKm),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(res.status === 402 ? `Not enough credits: this scan needs ${body.required}, you have ${body.balance}.` : body.error ?? "Could not start the scan.");
      return;
    }
    router.push(`/scans/${body.id}`);
    } catch { setErr("Connection failed. Please try again."); } finally { setBusy(false); }
  }

  return (
    <div className="form">
      <strong>New scan</strong>
      <label>
        Keyword
        <input value={f.keyword} onChange={set("keyword")} placeholder="emergency plumber" />
      </label>
      <label>
        Target business (aliases with |)
        <input value={f.targetBusiness} onChange={set("targetBusiness")} placeholder="Acme Plumbing|Acme Plumbing & Drain" />
      </label>
      <label>
        Search surface
        <select value={f.targetType} onChange={set("targetType")}>
          {TARGETS.map(([v, l, c]) => (
            <option key={v} value={v}>{l} — {c} credit{c > 1 ? "s" : ""}/pin</option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          Center latitude
          <input value={f.centerLat} onChange={set("centerLat")} placeholder="28.0395" inputMode="decimal" />
        </label>
        <label>
          Center longitude
          <input value={f.centerLng} onChange={set("centerLng")} placeholder="-81.9498" inputMode="decimal" />
        </label>
      </div>
      <div className="row">
        <label>
          City
          <input value={f.city} onChange={set("city")} placeholder="Lakeland" />
        </label>
        <label>
          State
          <input value={f.stateCode} onChange={set("stateCode")} maxLength={2} />
        </label>
      </div>
      <div className="row">
        <label>
          ZIP
          <input value={f.zip} onChange={set("zip")} placeholder="33801" inputMode="numeric" />
        </label>
      </div>
      <div className="row">
        <label>
          Grid
          <select value={f.gridSize} onChange={(e) => setF((s) => ({ ...s, gridSize: Number(e.target.value) }))}>
            {[3, 5, 7, 9, 11].map((n) => (
              <option key={n} value={n}>{n} × {n} ({n * n} pins)</option>
            ))}
          </select>
        </label>
        <label>
          Spacing (km)
          <input value={f.spacingKm} onChange={set("spacingKm")} inputMode="decimal" />
        </label>
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn" disabled={busy || cost > creditBalance} onClick={submit}>
        {busy ? "Starting…" : `Start scan · ${cost} credits`}
      </button>
      {cost > creditBalance && <div className="error">This grid needs {cost} credits; you have {creditBalance}.</div>}
    </div>
  );
}
