/** Scan-level rollups (spec §9). Computed over COMPLETED pins only. */
export type RankRow = { status: string; rankFound: number | null };

export const NOT_FOUND_RANK = 21;

export function computeMetrics(pins: RankRow[]): { arp: number | null; atrp: number | null; solv: number | null } {
  const done = pins.filter((p) => p.status === "COMPLETED");
  if (!done.length) return { arp: null, atrp: null, solv: null };
  const found = done.filter((p) => p.rankFound != null) as Array<{ rankFound: number }>;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const arp = found.length ? round(avg(found.map((p) => p.rankFound))) : null;
  const atrp = round(avg(done.map((p) => p.rankFound ?? NOT_FOUND_RANK)));
  const solv = round((100 * done.filter((p) => p.rankFound != null && p.rankFound <= 3).length) / done.length);
  return { arp, atrp, solv };
}

const round = (n: number) => Math.round(n * 100) / 100;
