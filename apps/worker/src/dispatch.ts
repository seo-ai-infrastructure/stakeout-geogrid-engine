import { Queue } from "bullmq";
import { db } from "@geogrid/db";
import { connection } from "./redis.js";
import { QUEUE_NAME, JOB_ATTEMPTS } from "./config.js";
import { failPin } from "./finalize.js";

export const pinQueue = new Queue(QUEUE_NAME, { connection });
pinQueue.on("error", e => console.error("queue error", e.message));
let busy = false;
let lastReconcile = 0;

// Redis writes are retried from durable rows. Stable pin IDs deduplicate a crash
// between addBulk and marking the outbox rows dispatched.
export async function dispatchPending() {
  if (busy) return;
  busy = true;
  try {
    const rows = await db.pinDispatch.findMany({ where: { dispatchedAt: null }, orderBy: { createdAt: "asc" }, take: 200, include: { pin: { include: { scan: true } } } });
    const pending = rows.filter(r => ["PENDING", "IN_PROGRESS"].includes(r.pin.status));
    if (pending.length) await pinQueue.addBulk(pending.map(({ pin }) => ({
      name: "pin", data: { pinId: pin.id, scanId: pin.scanId, targetType: pin.scan.targetType },
      opts: { jobId: pin.id, attempts: JOB_ATTEMPTS, backoff: { type: "exponential", delay: 4000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    })));
    if (rows.length) await db.pinDispatch.updateMany({ where: { pinId: { in: rows.map(r => r.pinId) } }, data: { dispatchedAt: new Date() } });
    if (Date.now() - lastReconcile > 60_000) {
      await reconcile(); lastReconcile = Date.now();
    }
  } finally { busy = false; }
}

async function reconcile() {
  // Recover jobs lost from Redis, or terminal events interrupted by a DB outage.
  const pins = await db.gridPin.findMany({ where: { status: { in: ["PENDING", "IN_PROGRESS"] }, dispatch: { dispatchedAt: { not: null } } }, orderBy: { updatedAt: "asc" }, take: 500, select: { id: true, scanId: true } });
  for (const pin of pins) {
    const job = await pinQueue.getJob(pin.id);
    if (!job) await db.pinDispatch.update({ where: { pinId: pin.id }, data: { dispatchedAt: null } });
    else if (await job.getState() === "failed") await failPin(pin.id, pin.scanId, job.failedReason || "Job failed");
  }
  const now = new Date();
  await Promise.all([
    db.loginToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authRateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
}
