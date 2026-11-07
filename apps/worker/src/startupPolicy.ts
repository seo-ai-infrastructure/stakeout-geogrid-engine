type Row = Record<string, unknown>;
function unexpired(value: unknown, now: number): boolean {
  if (value == null || value === "") return false;
  const n = Number(value);
  const time = Number.isFinite(n) ? n * (n < 1e12 ? 1000 : 1) : Date.parse(String(value));
  return Number.isFinite(time) && time > now;
}

/** Only existing, available subscription slots may be used for automatic wake-up. */
export function startupCapacity(plans: Row[], now = Date.now()): number {
  return plans.filter(p => Number(p.free_status) === 1 && unexpired(p.expired_at, now)).length;
}

export function startupCandidates(rows: Row[], allowlist: string[], group: string, capacity: number, now = Date.now()): string[] {
  if (!allowlist.length || !group || capacity < 1) return [];
  return rows.filter(p => {
    const id = String(p.image_id ?? p.id ?? "");
    const groups = Array.isArray(p.group) ? p.group : [];
    return allowlist.includes(id) && Number(p.status) === 2 && Number(p.adb_status) === 1 &&
      unexpired(p.expired_at, now) && groups.some(g => String(g?.name ?? "").toLowerCase() === group.toLowerCase());
  }).map(p => String(p.image_id ?? p.id)).slice(0, capacity);
}
