import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@geogrid/db";
import { hashToken, newToken } from "@/lib/auth";
import { mailer } from "@/lib/mail";
import { appUrl } from "@/lib/billing";

export const runtime = "nodejs";
const Input = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()) });

async function limited(key: string, max: number) {
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
    VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."expiresAt" < NOW() THEN 1 ELSE "AuthRateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" < NOW() THEN NOW() + INTERVAL '15 minutes' ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "count"`;
  return rows[0].count > max;
}

export async function POST(req: Request) {
  const input = Input.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = input.data.email;
  const ip = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await limited(`ip:${hashToken(ip)}`, 20) || await limited(`email:${hashToken(email)}`, 3)) {
    return NextResponse.json({ error: "Too many requests. Please try again in 15 minutes." }, { status: 429 });
  }
  const token = newToken();
  const hash = hashToken(token);
  await db.loginToken.create({ data: { hash, email, expiresAt: new Date(Date.now() + 15 * 60_000) } });
  try {
    const url = new URL("/sign-in/verify", appUrl());
    url.searchParams.set("token", token);
    await mailer().sendMail({
      from: process.env.SMTP_FROM, to: email, subject: "Sign in to Stakeout Search",
      text: `Sign in to Stakeout Search:\n\n${url}\n\nThis single-use link expires in 15 minutes. If you did not request it, you can ignore this email.`,
      headers: { "X-Entity-Ref-ID": hash.slice(0, 16) },
    });
    return NextResponse.json({ ok: true });
  } catch {
    await db.loginToken.deleteMany({ where: { hash } });
    console.error("Sign-in email delivery failed");
    return NextResponse.json({ error: "Email could not be sent. Please try again shortly." }, { status: 503 });
  }
}
