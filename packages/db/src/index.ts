import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __geogridPrisma?: PrismaClient };

/** Singleton Prisma client (safe across Next.js hot reloads and worker imports). */
export const db: PrismaClient =
  globalForPrisma.__geogridPrisma ??
  new PrismaClient({ log: process.env.PRISMA_LOG ? ["query", "warn", "error"] : ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.__geogridPrisma = db;

export * from "@prisma/client";

/** Credits per pin by target type (spec §5). */
export const COST_PER_PIN = {
  mobile_maps: 1,
  mobile_chrome: 1,
  mobile_google: 1,
} as const;

export type TargetTypeKey = keyof typeof COST_PER_PIN;
