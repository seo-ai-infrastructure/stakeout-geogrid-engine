import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@geogrid/db";
import { requireUser } from "@/lib/auth";
import { r2 } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key.length > 512) return new NextResponse("Not found", { status: 404 });
  const pin = await db.gridPin.findFirst({ where: { scan: { userId: user.id }, OR: [
    { videoKey: key }, { dumpsTarKey: key }, { serpXmlKey: key }, { serpJsonKey: key }, { serpHtmlKey: key }, { metaJsonKey: key },
  ] }, select: { id: true } });
  if (!pin) return new NextResponse("Not found", { status: 404 });
  const url = await getSignedUrl(r2(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }), { expiresIn: 900 });
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
