import { db } from "@geogrid/db";
import { grantCredits } from "./credits";
import { currency, findPack, findPlan, parseOrderCustomId } from "./billing";
import { paypal, type Capture, type Subscription } from "./paypal";

export type GrantOutcome = "granted" | "duplicate" | "pending" | "invalid";

/**
 * Grant a credit pack for a completed capture. Called from both the return
 * redirect and the PAYMENT.CAPTURE.COMPLETED webhook; the shared externalId
 * makes whichever arrives second a no-op.
 */
export async function grantForCapture(capture: Capture, expectedUserId?: string): Promise<GrantOutcome> {
  if (capture.status !== "COMPLETED") return capture.status === "PENDING" ? "pending" : "invalid";
  const ref = parseOrderCustomId(capture.custom_id);
  if (!ref) return "invalid";
  if (expectedUserId && ref.userId !== expectedUserId) return "invalid";
  const pack = findPack(ref.packId);
  if (!pack) return "invalid";
  // the amount actually captured must equal the pack price we set server-side
  if (capture.amount?.value !== pack.price || capture.amount?.currency_code !== currency()) return "invalid";
  const user = await db.user.findUnique({ where: { id: ref.userId }, select: { id: true } });
  if (!user) return "invalid";
  return grantCredits({ userId: user.id, amount: pack.credits, reason: "PAYPAL_TOPUP", externalId: `paypal:capture:${capture.id}` });
}

/**
 * Grant a subscription period's credits for a completed sale. The subscription
 * is re-fetched (event order is not guaranteed and the sale carries no user id).
 */
export async function grantForSale(saleId: string, subscriptionId: string): Promise<GrantOutcome> {
  const sub = await paypal<Subscription>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const plan = findPlan(sub.plan_id);
  const userId = sub.custom_id;
  if (!plan || !userId) return "invalid";
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return "invalid";
  await db.user.update({ where: { id: user.id }, data: { paypalSubscriptionId: sub.id } }).catch(() => {});
  return grantCredits({ userId: user.id, amount: plan.credits, reason: "PAYPAL_SUB", externalId: `paypal:sale:${saleId}` });
}
