import { NextResponse } from "next/server";
import { z } from "zod";
import { db, COST_PER_PIN } from "@geogrid/db";
import { requireUser } from "@/lib/auth";
import { buildGrid, GRID_SIZES } from "@/lib/grid";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateScan = z.object({
  keyword: z.string().trim().min(2).max(120),
  targetBusiness: z.string().trim().min(2).max(200),
  targetPlaceId: z.string().trim().max(120).optional(),
  targetType: z.enum(["mobile_maps", "mobile_chrome", "mobile_google"]),
  centerLat: z.number().min(-85).max(85),
  centerLng: z.number().min(-180).max(180),
  zip: z.string().trim().regex(/^\d{5}$/),
  city: z.string().trim().min(2).max(60),
  stateCode: z.string().trim().regex(/^[a-zA-Z]{2}$/).transform((s) => s.toUpperCase()),
  ispId: z.string().trim().regex(/^\d*$/).max(40).default(""),
  gridSize: z.number().int().refine((n) => (GRID_SIZES as readonly number[]).includes(n), "gridSize must be 3,5,7,9 or 11"),
  spacingKm: z.number().min(0.25).max(10).default(1.60934),
});

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scans = await db.gridScan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, keyword: true, targetBusiness: true, targetType: true, gridSize: true, city: true, stateCode: true,
      status: true, totalPins: true, completedPins: true, failedPins: true, arp: true, atrp: true, solv: true,
      creditsCharged: true, creditsRefunded: true, createdAt: true, completedAt: true,
    },
  });
  return NextResponse.json({ creditBalance: user.creditBalance, scans });
}

/** Credit hold + scan/pins insert in one transaction, durable dispatch in the same transaction. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = CreateScan.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;

  const pins = buildGrid(input.centerLat, input.centerLng, input.gridSize, input.spacingKm);
  const cost = pins.length * COST_PER_PIN[input.targetType];

  const scan = await db.$transaction(async (tx) => {
    const held = await tx.user.updateMany({
      where: { id: user.id, creditBalance: { gte: cost } },
      data: { creditBalance: { decrement: cost } },
    });
    if (held.count !== 1) return null;
    const s = await tx.gridScan.create({
      data: {
        userId: user.id,
        keyword: input.keyword,
        targetBusiness: input.targetBusiness,
        targetPlaceId: input.targetPlaceId ?? null,
        targetType: input.targetType,
        centerLat: input.centerLat,
        centerLng: input.centerLng,
        zip: input.zip,
        city: input.city,
        stateCode: input.stateCode,
        ispId: input.ispId,
        gridSize: input.gridSize,
        spacingKm: input.spacingKm,
        totalPins: pins.length,
        creditsCharged: cost,
        pins: { createMany: { data: pins.map((p) => ({ ...p, zip: input.zip })) } },
      },
      include: { pins: { select: { id: true } } },
    });
    await tx.pinDispatch.createMany({ data: s.pins.map(p => ({ pinId: p.id })) });
    await tx.creditLedger.create({ data: { userId: user.id, amount: -cost, reason: "SCAN_HOLD", scanId: s.id } });
    return s;
  });
  if (!scan) return NextResponse.json({ error: "insufficient credits", required: cost, balance: user.creditBalance }, { status: 402 });

  return NextResponse.json({ id: scan.id, totalPins: pins.length, creditsCharged: cost }, { status: 201 });
}
