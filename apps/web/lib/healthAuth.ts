import { timingSafeEqual } from "node:crypto";

/** /status and /api/health are protected by HEALTH_TOKEN (?token=…). Unset = disabled. */
export function healthAllowed(token: string | null | undefined): boolean {
  const want = process.env.HEALTH_TOKEN;
  if (!want || want.length < 12 || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
