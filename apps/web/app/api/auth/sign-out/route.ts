import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@geogrid/db";
import { hashToken, SESSION_COOKIE, sessionOptions } from "@/lib/auth";
import { appUrl } from "@/lib/billing";
export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { hash: hashToken(token) } });
  const res = NextResponse.redirect(new URL("/", appUrl()), 303);
  res.cookies.set(SESSION_COOKIE, "", { ...sessionOptions, maxAge: 0 });
  return res;
}
