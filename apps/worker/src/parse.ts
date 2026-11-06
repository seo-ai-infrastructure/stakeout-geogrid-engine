import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

/* ------------------------------------------------------------------ */
/* tar.gz reader (ustar/GNU, regular files only — all we ever produce)  */
/* ------------------------------------------------------------------ */

export function readTarGz(buf: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(buf);
  const files = new Map<string, Buffer>();
  let off = 0;
  let pendingLongName: string | null = null;
  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const cstr = (a: number, b: number) => header.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    let name = cstr(0, 100);
    const size = parseInt(cstr(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = cstr(345, 500);
    if (prefix) name = `${prefix}/${name}`;
    const dataStart = off + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    if (type === "L") {
      pendingLongName = data.toString("utf8").replace(/\0+$/, "");
    } else {
      if (pendingLongName) {
        name = pendingLongName;
        pendingLongName = null;
      }
      if (type === "0" || type === "\0" || type === "") files.set(name.replace(/^\.\//, ""), Buffer.from(data));
    }
    off = dataStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

/* ------------------------------------------------------------------ */
/* uiautomator XML → ordered strings                                    */
/* ------------------------------------------------------------------ */

type Str = { s: string; kind: "text" | "desc"; pkg: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

/** Depth-first, document order == on-screen reading order for list UIs. */
export function xmlStrings(xml: string, expectedPackage?: string): Str[] {
  const out: Str[] = [];
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return out;
  }
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const obj = n as Record<string, unknown>;
      const attrs = (obj[":@"] ?? {}) as Record<string, string>;
      const pkg = attrs["package"] ?? "";
      const text = (attrs["text"] ?? "").trim();
      const desc = (attrs["content-desc"] ?? "").trim();
      if (text) out.push({ s: text, kind: "text", pkg });
      if (desc && desc !== text) out.push({ s: desc, kind: "desc", pkg });
      for (const [k, v] of Object.entries(obj)) if (k !== ":@") walk(v);
    }
  };
  walk(doc);
  return out.filter((x) => x.pkg !== "com.android.systemui" && (!expectedPackage || x.pkg === expectedPackage));
}

/* ------------------------------------------------------------------ */
/* Business extraction                                                  */
/* ------------------------------------------------------------------ */

const CHROME = new Set(
  [
    "directions", "website", "call", "share", "save", "search here", "search this area", "sponsored", "ad", "ads",
    "open", "closed", "open now", "overview", "reviews", "photos", "about", "menu", "start", "filters", "relevance",
    "rating", "hours", "price", "more", "results", "update results when map moves", "show list", "map", "back",
    "navigate up", "search", "clear", "voice search", "layers", "your location", "show your location", "compass",
    "zoom in", "zoom out", "sort by", "all filters", "top rated", "nearby", "explore", "go", "saved", "contribute",
    "updates", "home", "work", "sign in", "skip", "view all", "see more", "places", "people also search for",
    "businesses", "more businesses", "google", "maps", "all", "images", "videos", "news", "shopping", "web",
  ].map((s) => s.toLowerCase()),
);

const RATING_ONLY = /^\d(\.\d)?$/;
const REVIEWS_ONLY = /^\(\d[\d,.]*[kK]?\)$/;
const RATING_REVIEWS = /^\d(\.\d)?\s*\(\d[\d,.]*[kK]?\)/;
// Current Maps cards expose the rating as its own text node, e.g. "4.7 stars (105)".
const RATING_STARS = /^[0-5](?:\.\d)?\s+stars?\s*(?:\(\d[\d,.]*[kK]?\))?$/i;
const DESC_WITH_RATING = /^([^·]{2,80}?)\s*[·,.]?\s*\d(?:\.\d)?\s*(?:stars?\b|★|\(\d|out of 5)/i;
const DISTANCE = /^\d+(\.\d+)?\s?(mi|km|ft|m)\b/i;

const isRatingToken = (s: string) => RATING_ONLY.test(s) || REVIEWS_ONLY.test(s) || RATING_REVIEWS.test(s) || RATING_STARS.test(s);

function plausibleTitle(s: string): boolean {
  if (s.length < 2 || s.length > 80) return false;
  const l = s.toLowerCase();
  if (CHROME.has(l)) return false;
  if (isRatingToken(s) || DISTANCE.test(s) || /^\$/.test(s) || /^\d[\d,.]*$/.test(s)) return false;
  if (/^(open|closed|opens|closes)\b/i.test(s)) return false;
  if (/\b(mi|km)\b/.test(l) && /\d/.test(l)) return false;
  return true;
}

export type Business = {
  name: string;
  sponsored: boolean;
  dumpIdx: number;
  rating?: number;
  reviews?: number;
  /** following lines of the card: category, address, hours, phone… (max 4) */
  details: string[];
};

const num = (s: string) => Number(s.replace(/[,()]/g, "").replace(/k$/i, "e3"));

function ratingFrom(s: string): { rating?: number; reviews?: number } {
  const out: { rating?: number; reviews?: number } = {};
  const m = /^(\d(?:\.\d)?)\s*(?:stars?\s*)?(?:\((\d[\d,.]*[kK]?)\))?/i.exec(s);
  if (m && RATING_ONLY.test(m[1])) out.rating = Number(m[1]);
  if (m?.[2]) out.reviews = num(m[2]);
  const r = /^\((\d[\d,.]*[kK]?)\)$/.exec(s);
  if (r) out.reviews = num(r[1]);
  return out;
}

const isDetail = (s: string) => {
  const l = s.toLowerCase();
  return s.length >= 2 && s.length <= 90 && !CHROME.has(l) && !isRatingToken(s) && s !== "·";
};

export function extractBusinesses(strings: Str[], dumpIdx: number): Business[] {
  const found: Business[] = [];
  const titleAt = new Map<number, Business>();
  const push = (name: string, i: number, seed: Partial<Business> = {}) => {
    const back = strings.slice(Math.max(0, i - 3), i).map((x) => x.s.toLowerCase());
    const sponsored = back.some((b) => b === "sponsored" || b === "ad" || b.startsWith("sponsored"));
    const b: Business = { name: name.trim(), sponsored, dumpIdx, details: [], ...seed };
    found.push(b);
    titleAt.set(i, b);
  };
  for (let i = 0; i < strings.length; i++) {
    const { s, kind } = strings[i];
    // Strategy A: content-desc "Name, 4.8 stars 120 Reviews, Plumber, Open"
    if (kind === "desc") {
      const m = DESC_WITH_RATING.exec(s);
      if (m && plausibleTitle(m[1])) {
        const rest = s.slice(m[0].length - 1);
        const rating = /(\d(?:\.\d)?)\s*(?:stars?|★|out of 5)/i.exec(s)?.[1];
        const reviews = /(\d[\d,.]*[kK]?)\s*reviews?/i.exec(s)?.[1];
        const details = rest
          .split(/[,·]/)
          .map((x) => x.trim())
          .filter((x) => x && !/stars?|reviews?/i.test(x) && isDetail(x))
          .slice(0, 4);
        push(m[1].replace(/\s+Rated$/i, ""), i, { rating: rating ? Number(rating) : undefined, reviews: reviews ? num(reviews) : undefined, details });
        continue;
      }
    }
    // Strategy B: title text followed (within 3 strings) by a rating / review token
    if (isRatingToken(s)) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (strings[j].kind === "text" && plausibleTitle(strings[j].s)) {
          if (!titleAt.has(j)) push(strings[j].s, j);
          break;
        }
      }
    }
  }
  // second pass: attach rating/reviews/details from the strings after each Strategy-B title
  const titleIdx = [...titleAt.keys()].sort((a, b) => a - b);
  titleIdx.forEach((start, k) => {
    const b = titleAt.get(start)!;
    if (b.details.length || b.rating != null) return; // Strategy A already filled it
    const stop = Math.min(titleIdx[k + 1] ?? strings.length, start + 12);
    for (let j = start + 1; j < stop; j++) {
      const t = strings[j].s;
      if (isRatingToken(t)) {
        const r = ratingFrom(t);
        b.rating ??= r.rating;
        b.reviews ??= r.reviews;
      } else if (strings[j].kind === "text" && isDetail(t) && t !== b.name && b.details.length < 4) {
        b.details.push(t);
      }
    }
  });
  return found;
}

/* ------------------------------------------------------------------ */
/* Target matching                                                      */
/* ------------------------------------------------------------------ */

export const normName = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function matchesTarget(name: string, aliases: string[]): boolean {
  const n = normName(name);
  const nc = n.replace(/ /g, "");
  const nt = new Set(n.split(" ").filter(Boolean));
  for (const a of aliases) {
    const t = normName(a);
    if (!t) continue;
    const tc = t.replace(/ /g, "");
    if (nc === tc) return true;
    if (tc.length >= 4 && nc.includes(tc)) return true;
    if (nc.length >= 4 && tc.includes(nc)) return true;
    const tt = new Set(t.split(" ").filter(Boolean));
    const inter = [...nt].filter((x) => tt.has(x)).length;
    const union = new Set([...nt, ...tt]).size;
    if (union && inter / union >= 0.75) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Whole-pin parse                                                      */
/* ------------------------------------------------------------------ */

export type ParsedPin = {
  files: Map<string, Buffer>;
  businesses: Business[]; // organic, top 20, in order
  sponsored: Business[];
  targetIdx: number;
  rank: number | null;
  matchedDumpIdx: number | null;
  captcha: boolean;
  flags: string[];
  stops: number;
  dumpCount: number;
  meta: Record<string, string>;
};

/** An absent target is not a verified 20+ rank when the capture stopped early. */
export function assertRankingEvidence(parsed: Pick<ParsedPin, "dumpCount" | "businesses" | "rank">): void {
  if (parsed.dumpCount === 0) throw new Error("No screen dumps were captured");
  if (parsed.businesses.length === 0) throw new Error("No organic listings were recognized; the capture cannot establish a ranking");
  if (parsed.rank === null && parsed.businesses.length < 20) {
    throw new Error(`Only ${parsed.businesses.length} organic listings were captured and the target was absent; cannot establish a top-20 ranking`);
  }
}

const CAPTCHA_RE = /unusual traffic|not a robot|verify you are human|automated queries/i;

export function parsePinTar(tarGz: Buffer, targetBusiness: string, expectedPackage?: string): ParsedPin {
  const files = readTarGz(tarGz);
  const dumps = [...files.keys()]
    .filter((k) => /dump_\d+\.xml$/.test(k))
    .sort((a, b) => Number(/dump_(\d+)/.exec(a)![1]) - Number(/dump_(\d+)/.exec(b)![1]));

  const meta: Record<string, string> = {};
  const metaKey = [...files.keys()].find((k) => k.endsWith("meta.txt"));
  if (metaKey) {
    for (const line of files.get(metaKey)!.toString("utf8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) meta[line.slice(0, eq)] = line.slice(eq + 1).trim();
    }
  }

  const flags = new Set<string>();
  const flagsKey = [...files.keys()].find((k) => k.endsWith("flags.txt"));
  if (flagsKey) {
    for (const line of files.get(flagsKey)!.toString("utf8").split("\n")) {
      const tag = line.trim().split(/\s+/)[0];
      if (tag) flags.add(tag);
    }
  }

  const seen = new Map<string, Business>();
  let captcha = false;
  dumps.forEach((k, idx) => {
    const xml = files.get(k)!.toString("utf8");
    if (CAPTCHA_RE.test(xml)) captcha = true;
    const strings = xmlStrings(xml, expectedPackage);
    for (const b of extractBusinesses(strings, idx)) {
      const key = normName(b.name);
      if (key && !seen.has(key)) seen.set(key, b);
    }
  });
  if (captcha) flags.add("captcha");

  const all = [...seen.values()];
  const organic = all.filter((b) => !b.sponsored).slice(0, 20);
  const sponsored = all.filter((b) => b.sponsored).slice(0, 5);
  const aliases = targetBusiness.split("|").map((s) => s.trim()).filter(Boolean);
  const idx = organic.findIndex((b) => matchesTarget(b.name, aliases));
  if (organic.length < 3) flags.add("parser_low_confidence");
  const stops = Number(meta["stops"] ?? dumps.length) || dumps.length;
  flags.add(`stops=${stops}`);

  return {
    files,
    businesses: organic,
    sponsored,
    targetIdx: idx,
    rank: idx >= 0 ? idx + 1 : null,
    matchedDumpIdx: idx >= 0 ? organic[idx].dumpIdx : null,
    captcha,
    flags: [...flags],
    stops,
    dumpCount: dumps.length,
    meta,
  };
}
