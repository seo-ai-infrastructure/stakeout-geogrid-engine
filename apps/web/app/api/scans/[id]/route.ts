import { NextResponse } from "next/server";
import { db } from "@geogrid/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const scan = await db.gridScan.findFirst({
    where: { id, userId: user.id },
    include: {
      pins: {
        orderBy: [{ rowIdx: "asc" }, { colIdx: "asc" }],
        select: {
          id: true, rowIdx: true, colIdx: true, lat: true, lng: true, status: true, attempts: true, rankFound: true,
          topCompetitors: true, proxyMeta: true, proxyRung: true, exitIp: true, flags: true,
          videoKey: true, dumpsTarKey: true, serpXmlKey: true, serpJsonKey: true, serpHtmlKey: true, metaJsonKey: true,
          lastError: true, startedAt: true, finishedAt: true,
        },
      },
    },
  });
  if (!scan) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(scan);
}
