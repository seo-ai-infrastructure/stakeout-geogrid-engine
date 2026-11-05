import { db } from "@geogrid/db";

/** Idempotent grant: the ledger row is inserted first, so a duplicate externalId aborts before the balance moves. */
export async function grantCredits(opts: {
  userId: string;
  amount: number;
  reason: "PAYPAL_TOPUP" | "PAYPAL_SUB" | "SIGNUP_GRANT" | "ADJUSTMENT";
  externalId?: string;
}): Promise<"granted" | "duplicate"> {
  try {
    await db.$transaction([
      db.creditLedger.create({ data: { userId: opts.userId, amount: opts.amount, reason: opts.reason, externalId: opts.externalId } }),
      db.user.update({ where: { id: opts.userId }, data: { creditBalance: { increment: opts.amount } } }),
    ]);
    return "granted";
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "duplicate";
    throw e;
  }
}
