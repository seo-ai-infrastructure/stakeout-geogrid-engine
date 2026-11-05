import { env } from "./config.js";
import { checkProxy, updateProxy, type ProxyCheck } from "./duoplus.js";

export type GeoTarget = { zip: string; city: string; stateCode: string; ispId: string };

export type Rung = "ZIP+ISP" | "CITY+ISP" | "CITY" | "STATE";

/**
 * Proxy-Seller state subdivisions are numeric ids (e.g. _sd_1906), not postal codes.
 * PROXY_SELLER_SD_IDS_JSON maps state code → id, e.g. {"FL":"1234"}. No id → no state rung.
 */
const SD_IDS: Record<string, string> = (() => {
  try {
    return JSON.parse(env.PROXY_SELLER_SD_IDS_JSON || "{}") as Record<string, string>;
  } catch {
    return {};
  }
})();

/** Proxy-Seller city format: spaces → hyphens ("New York" → "New-York"). */
export const psCity = (city: string) => city.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9-]/g, "");

/**
 * Rotation suffix (spec §7.6). "request": no session id, so Proxy-Seller hands out a new
 * exit IP on every request. "sticky": one session per phone that expires after
 * PROXY_STICKY_MINUTES, so the IP rotates on its own roughly once per pin.
 */
export function rotationSuffix(deviceTag: string, rotation = env.PROXY_ROTATION, minutes = env.PROXY_STICKY_MINUTES): string {
  if (rotation === "request") return "";
  return `_s_${deviceTag.replace(/[^A-Za-z0-9]/g, "")}_ttl_${minutes}m`;
}

/** Suffix order follows Proxy-Seller's docs: country → city/sd → isp/zip → session → TTL. Case-sensitive. */
export function buildLadder(t: GeoTarget, suffix: string, base = env.PROXY_SELLER_BASE_LOGIN): Array<{ rung: Rung; login: string }> {
  const city = psCity(t.city);
  const s = suffix;
  const sd = SD_IDS[t.stateCode.toUpperCase()];
  const ladder: Array<{ rung: Rung; login: string }> = [];
  if (t.zip && t.ispId) ladder.push({ rung: "ZIP+ISP", login: `${base}_c_US_zip_${t.zip}_isp_${t.ispId}${s}` });
  if (city && t.ispId) ladder.push({ rung: "CITY+ISP", login: `${base}_c_US_city_${city}_isp_${t.ispId}${s}` });
  if (city) ladder.push({ rung: "CITY", login: `${base}_c_US_city_${city}${s}` });
  if (sd) ladder.push({ rung: "STATE", login: `${base}_c_US_sd_${sd}${s}` });
  return ladder;
}

const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export function geoMatches(c: ProxyCheck, t: GeoTarget, rung: Rung): boolean {
  if (!c.ok) return false;
  const country = norm(c.country);
  if (country && !["us", "usa", "unitedstates"].includes(country)) return false;
  if (env.PROXY_GEO_MATCH === "none") return true;
  const region = norm(c.region);
  const city = norm(c.city);
  const stateOk =
    !region || region === norm(t.stateCode) || region.includes(norm(STATE_NAMES[t.stateCode.toUpperCase()] ?? "\u0000"));
  if (env.PROXY_GEO_MATCH === "city" && rung !== "STATE") return stateOk && (!city || city === norm(t.city.replace(/-/g, " ")));
  return stateOk;
}

export type BoundProxy = { login: string; rung: Rung; check: ProxyCheck; port: number; geoKey: string };

export const geoKey = (t: GeoTarget) =>
  [t.zip, psCity(t.city), t.stateCode.toUpperCase(), t.ispId, env.PROXY_ROTATION, env.PROXY_ROTATION === "sticky" ? env.PROXY_STICKY_MINUTES : ""].join("|");

/**
 * Point one phone's saved DuoPlus proxy record at a rotating Proxy-Seller login for
 * a scan's area. Runs once per phone per scan area, not per pin. Each rung is
 * checked twice (with rotation every check samples a different exit IP).
 */
export async function configureRotatingProxy(opts: {
  proxyId: string;
  slotIndex: number;
  deviceTag: string;
  target: GeoTarget;
  log: (m: string) => void;
}): Promise<BoundProxy> {
  const port = 10000 + opts.slotIndex;
  const errors: string[] = [];
  for (const { rung, login } of buildLadder(opts.target, rotationSuffix(opts.deviceTag))) {
    try {
      await updateProxy({ id: opts.proxyId, host: env.PROXY_SELLER_HOST, port, user: login, password: env.PROXY_SELLER_PASSWORD });
      for (let tryNo = 1; tryNo <= 2; tryNo++) {
        const check = await checkProxy(opts.proxyId);
        if (geoMatches(check, opts.target, rung)) {
          opts.log(`rotating proxy set: rung=${rung} rotation=${env.PROXY_ROTATION} port=${port} sample ip=${check.ip} ${check.city}/${check.region}`);
          return { login, rung, check, port, geoKey: geoKey(opts.target) };
        }
        errors.push(`${rung}#${tryNo}: ok=${check.ok} ${check.country}/${check.region}/${check.city}`);
      }
    } catch (e) {
      errors.push(`${rung}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  throw new Error(`proxy ladder exhausted: ${errors.join(" | ")}`);
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};
