import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@geogrid/db";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-stakeout_session" : "stakeout_session";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export const sessionOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export const requireUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !validToken(token)) return null;
  const session = await db.session.findUnique({ where: { hash: hashToken(token) }, include: { user: true } });
  return session && session.expiresAt > new Date() ? session.user : null;
});

export function isAdmin(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "").split(",").some(e => e.trim().toLowerCase() === email.toLowerCase());
}
