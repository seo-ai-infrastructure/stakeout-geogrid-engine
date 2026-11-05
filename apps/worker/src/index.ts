import "dotenv/config";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { db } from "@geogrid/db";
import { env, JOB_ATTEMPTS, QUEUE_NAME, requireEnv } from "./config.js";
import { closeRedis, connection } from "./redis.js";
import { processMobilePin, type PinJobData } from "./mobile.js";
import { failPin } from "./finalize.js";
import { refreshDevices } from "./boot.js";
import { health, recordPin, startHeartbeat } from "./health.js";

let worker: Worker<PinJobData> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function attachFailureHandling(w: Worker<PinJobData>) {
  w.on("completed", () => recordPin(true));
  w.on("failed", async (job: Job<PinJobData> | undefined, err: Error) => {
    if (!job) return;
    if (err?.name === "DelayedError") return; // waiting for a free phone, not a failure
    recordPin(false, err.message);
    const attempts = job.opts.attempts ?? JOB_ATTEMPTS;
    const terminal = err instanceof UnrecoverableError || err?.name === "UnrecoverableError" || job.attemptsMade >= attempts;
    console.warn(`[failed ${job.data.pinId.slice(-6)} try ${job.attemptsMade}/${attempts}${terminal ? " TERMINAL" : ""}] ${err.message}`);
    try {
      if (terminal) await failPin(job.data.pinId, job.data.scanId, err.message);
      else
        await db.gridPin.updateMany({
          where: { id: job.data.pinId, status: "IN_PROGRESS" },
          data: { status: "PENDING", lastError: err.message.slice(0, 1000) },
        });
    } catch (e) {
      console.error("failure handler error", e);
    }
  });
  w.on("error", (e) => console.error("worker error", e));
}

/** Concurrency follows the phones that can run right now; zero phones pauses intake (scans wait in the queue). */
function applyConcurrency(ready: number) {
  if (!worker) return;
  const target = env.WORKER_CONCURRENCY ?? ready;
  if (ready === 0) {
    if (!worker.isPaused()) {
      void worker.pause(true);
      console.log("worker paused: no phones ready (scans wait safely in the queue)");
    }
    health.paused = true;
    health.concurrency = 0;
    return;
  }
  if (worker.concurrency !== target) worker.concurrency = target;
  if (worker.isPaused()) worker.resume();
  health.paused = false;
  health.concurrency = worker.concurrency;
  console.log(`worker ready concurrency=${worker.concurrency} phones=${ready}`);
}

async function main() {
  requireEnv();
  heartbeatTimer = await startHeartbeat();
  const ready = await refreshDevices();

  worker = new Worker<PinJobData>(QUEUE_NAME, (job, token) => processMobilePin(job, token), {
    connection,
    concurrency: Math.max(1, env.WORKER_CONCURRENCY ?? ready),
    lockDuration: 180_000,
    stalledInterval: 60_000,
    autorun: true,
  });
  attachFailureHandling(worker);
  applyConcurrency(ready);

  let refreshing = false;
  refreshTimer = setInterval(async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      applyConcurrency(await refreshDevices());
    } catch (e) {
      console.error("device refresh failed", e);
    } finally {
      refreshing = false;
    }
  }, env.DEVICE_REFRESH_MINUTES * 60_000);

  const shutdown = async (sig: string) => {
    console.log(`${sig} received, closing worker…`);
    if (refreshTimer) clearInterval(refreshTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await worker?.close();
    await closeRedis();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});
