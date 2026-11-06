import { db, COST_PER_PIN, type TargetTypeKey, type Prisma } from "@geogrid/db";
import { computeMetrics } from "./metrics.js";

export type PinResult = {
  rankFound: number | null;
  matchedDumpIdx: number | null;
  topCompetitors: unknown;
  proxyMeta?: unknown;
  proxyRung?: string | null;
  exitIp?: string | null;
  flags: string[];
  videoKey?: string | null;
  dumpsTarKey?: string | null;
  serpXmlKey?: string | null;
  serpJsonKey?: string | null;
  serpHtmlKey?: string | null;
  metaJsonKey?: string | null;
  assignedDeviceId?: string | null;
};

/** Mark a pin COMPLETED and finalize the scan if it was the last one. */
export async function completePin(pinId: string, scanId: string, r: PinResult): Promise<void> {
  await db.$transaction(async tx => {
  const changed = await tx.gridPin.updateMany({
    where: { id: pinId, scanId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    data: {
      status: "COMPLETED",
      rankFound: r.rankFound,
      matchedDumpIdx: r.matchedDumpIdx,
      topCompetitors: r.topCompetitors as Prisma.InputJsonValue,
      proxyMeta: (r.proxyMeta ?? undefined) as Prisma.InputJsonValue | undefined,
      proxyRung: r.proxyRung ?? undefined,
      exitIp: r.exitIp ?? undefined,
      flags: r.flags as Prisma.InputJsonValue,
      videoKey: r.videoKey ?? undefined,
      dumpsTarKey: r.dumpsTarKey ?? undefined,
      serpXmlKey: r.serpXmlKey ?? undefined,
      serpJsonKey: r.serpJsonKey ?? undefined,
      serpHtmlKey: r.serpHtmlKey ?? undefined,
      metaJsonKey: r.metaJsonKey ?? undefined,
      assignedDeviceId: r.assignedDeviceId ?? undefined,
      finishedAt: new Date(),
      lastError: null,
    },
  });
  if (changed.count !== 1) return; // already completed by another attempt — nothing to count
  const scan = await tx.gridScan.update({
    where: { id: scanId },
    data: { completedPins: { increment: 1 }, status: "RUNNING" },
    select: { completedPins: true, failedPins: true, totalPins: true },
  });
  if (scan.completedPins + scan.failedPins >= scan.totalPins) await finalizeScan(tx, scanId);
  });
}

/**
 * Terminal failure: refund one pin's credits exactly once (guarded by the
 * status predicate), then finalize the scan if it was the last pin.
 */
export async function failPin(pinId: string, scanId: string, error: string): Promise<void> {
  const scan = await db.gridScan.findUnique({ where: { id: scanId }, select: { userId: true, targetType: true } });
  if (!scan) return;
  const cost = COST_PER_PIN[scan.targetType as TargetTypeKey] ?? 1;
  const counted = await db.$transaction(async (tx) => {
    const changed = await tx.gridPin.updateMany({
      where: { id: pinId, scanId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "FAILED", lastError: error.slice(0, 1000), finishedAt: new Date() },
    });
    if (changed.count !== 1) return null;
    await tx.user.update({ where: { id: scan.userId }, data: { creditBalance: { increment: cost } } });
    await tx.creditLedger.create({
      data: { userId: scan.userId, amount: cost, reason: "PIN_REFUND", scanId, pinId },
    });
    const counted = await tx.gridScan.update({
      where: { id: scanId },
      data: { failedPins: { increment: 1 }, creditsRefunded: { increment: cost } },
      select: { completedPins: true, failedPins: true, totalPins: true },
    });
    if (counted.completedPins + counted.failedPins >= counted.totalPins) await finalizeScan(tx, scanId);
    return counted;
  });
}

async function finalizeScan(tx: Prisma.TransactionClient, scanId: string): Promise<void> {
  const pins = await tx.gridPin.findMany({ where: { scanId }, select: { status: true, rankFound: true } });
  const m = computeMetrics(pins);
  const completed = pins.filter((p) => p.status === "COMPLETED").length;
  const failed = pins.filter((p) => p.status === "FAILED").length;
  const status = completed === 0 ? "FAILED" : failed === 0 ? "COMPLETED" : "PARTIAL";
  await tx.gridScan.update({
    where: { id: scanId },
    data: { ...m, status, completedAt: new Date() },
  });
}
