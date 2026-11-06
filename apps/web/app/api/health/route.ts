import { requireUser, isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { healthAllowed } from "@/lib/healthAuth";
import { overall, runChecks } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health?token=… → JSON of every platform check (for monitors and for pasting into chat). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await requireUser();
  if (!healthAllowed(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? url.searchParams.get("token")) && (!user || !isAdmin(user.email))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { checks, worker } = await runChecks(url.origin);
  const status = overall(checks);
  return NextResponse.json({ status, at: new Date().toISOString(), checks, worker }, { status: status === "fail" ? 503 : 200 });
}
