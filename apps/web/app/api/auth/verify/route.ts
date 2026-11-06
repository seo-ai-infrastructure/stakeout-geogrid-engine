import { NextResponse } from "next/server";
import { db } from "@geogrid/db";
import { hashToken, newToken, validToken, SESSION_COOKIE, sessionOptions } from "@/lib/auth";
import { appUrl } from "@/lib/billing";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const failure = () => NextResponse.redirect(new URL("/sign-in?error=expired", appUrl()), 303);
  if (!validToken(token)) return failure();
  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600_000);
  const ok = await db.$transaction(async tx => {
    const link = await tx.loginToken.findUnique({ where: { hash: hashToken(token) } });
    if (!link || link.expiresAt <= new Date()) return false;
    const consumed = await tx.loginToken.deleteMany({ where: { hash: link.hash, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) return false;
    const user = await tx.user.upsert({
      where: { email: link.email }, update: {},
      create: { email: link.email, clerkId: `email:${hashToken(link.email)}`, creditBalance: 0 },
    });
    await tx.session.create({ data: { hash: hashToken(sessionToken), userId: user.id, expiresAt } });
    return true;
  });
  if (!ok) return failure();
  const res = NextResponse.redirect(new URL("/", appUrl()), 303);
  res.cookies.set(SESSION_COOKIE, sessionToken, { ...sessionOptions, expires: expiresAt });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
