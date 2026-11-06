"use client";

import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { rankBand } from "@/lib/artifacts";
import PinDrawer, { type PinDto } from "./PinDrawer";

export type ScanDto = {
  id: string;
  keyword: string;
  targetBusiness: string;
  targetType: string;
  city: string;
  stateCode: string;
  status: string;
  gridSize: number;
  totalPins: number;
  completedPins: number;
  failedPins: number;
  creditsCharged: number;
  creditsRefunded: number;
  arp: number | null;
  atrp: number | null;
  solv: number | null;
  pins: PinDto[];
};

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function GeoGrid({ scanId }: { scanId: string }) {
  const [scan, setScan] = useState<ScanDto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>(new Map());
  const fitted = useRef(false);

  // poll while running
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const load = async () => {
      try {
      const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
      if (!alive) return;
      if (!res.ok) {
        setError(res.status === 404 ? "Scan not found." : "Could not load the scan.");
        return;
      }
      const data = (await res.json()) as ScanDto;
      if (!alive) return;
      setError(null);
      setScan(data);
      if (data.status === "RUNNING" || data.status === "QUEUED") timer = setTimeout(load, 5000);
      } catch { if (alive) { setError("Connection lost. Retrying…"); timer = setTimeout(load, 5000); } }
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [scanId]);

  // map init
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;
    void import("maplibre-gl").then(({ default: ml }) => {
      if (cancelled || !mapEl.current) return;
      const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
      mapRef.current = new ml.Map({
        container: mapEl.current,
        style: styleUrl && styleUrl.length > 0 ? styleUrl : OSM_STYLE,
        center: [-81.95, 28.04],
        zoom: 11,
        attributionControl: {},
      });
      setMapReady(true);
      mapRef.current.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.current.clear();
      fitted.current = false;
    };
  }, []);

  // sync markers with pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !scan) return;
    void import("maplibre-gl").then(({ default: ml }) => {
      for (const p of scan.pins) {
        const band = rankBand(p.status, p.rankFound);
        const label = p.status === "COMPLETED" ? (p.rankFound == null ? "20+" : String(p.rankFound)) : p.status === "FAILED" ? "×" : "·";
        let entry = markers.current.get(p.id);
        if (!entry) {
          const el = document.createElement("div");
          el.className = "pin";
          el.setAttribute("role", "button");
          el.tabIndex = 0;
          const open = () => setSelected(p.id);
          el.addEventListener("click", open);
          el.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
          });
          const marker = new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
          entry = { marker, el };
          markers.current.set(p.id, entry);
        }
        entry.el.dataset.band = band;
        entry.el.dataset.selected = String(selected === p.id);
        entry.el.textContent = label;
        entry.el.title = `row ${p.rowIdx + 1}, col ${p.colIdx + 1} — ${p.status.toLowerCase()}${p.rankFound ? `, rank ${p.rankFound}` : ""}`;
      }
      if (!fitted.current && scan.pins.length) {
        const lngs = scan.pins.map((p) => p.lng);
        const lats = scan.pins.map((p) => p.lat);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 70, duration: 0 },
        );
        fitted.current = true;
      }
    });
  }, [scan, selected, mapReady]);

  const sel = scan?.pins.find((p) => p.id === selected) ?? null;
  const done = scan ? scan.completedPins + scan.failedPins : 0;

  return (
    <div className="scan-shell">
      <div className="scan-head">
        {scan ? (
          <>
            <h1>{scan.keyword}</h1>
            <span className="muted">{scan.targetBusiness.split("|")[0]} · {scan.city}, {scan.stateCode} · {scan.gridSize}×{scan.gridSize} · {scan.targetType}</span>
            <span className="status" data-s={scan.status}>{scan.status.toLowerCase()}</span>
            <span className="metric num"><b>{done}/{scan.totalPins}</b><span>pins</span></span>
            <span className="metric num"><b>{scan.arp ?? "–"}</b><span>ARP</span></span>
            <span className="metric num"><b>{scan.atrp ?? "–"}</b><span>ATRP</span></span>
            <span className="metric num"><b>{scan.solv != null ? `${scan.solv}%` : "–"}</b><span>SoLV</span></span>
            {scan.creditsRefunded > 0 && <span className="muted num">{scan.creditsRefunded} credits refunded</span>}
          </>
        ) : (
          <span className="muted">{error ?? "Loading scan…"}</span>
        )}
      </div>
      <div className="scan-body">
        <div ref={mapEl} className="map" />
        <div className="legend" aria-label="Rank legend">
          <span><i style={{ background: "var(--rank-top)" }} />1–3</span>
          <span><i style={{ background: "var(--rank-mid)" }} />4–10</span>
          <span><i style={{ background: "var(--rank-low)" }} />11–20</span>
          <span><i style={{ background: "var(--rank-none)" }} />not in top 20</span>
        </div>
        {sel && scan && <PinDrawer pin={sel} scan={scan} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
