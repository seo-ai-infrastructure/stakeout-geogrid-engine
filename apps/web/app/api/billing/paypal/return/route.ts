import { NextResponse } from "next/server";
import { db } from "@geogrid/db";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/billing";
import { paypal, PayPalError, type Order, type Subscription } from "@/lib/paypal";
import { grantForCapture } from "@/lib/paypalGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (state: string) => NextResponse.redirect(`${appUrl()}/?billing=${state}`, { status: 303 });

/**
 * PayPal sends the buyer back here after approval.
 *  kind=order → ?token=<orderId>          capture now, grant the pack
 *  kind=sub   → ?subscription_id=<I-…>    credits arrive via PAYMENT.SALE.COMPLETED webhook
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return back("signin");
  const q = new URL(req.url).searchParams;

  if (q.get("kind") === "sub") {
    const subId = q.get("subscription_id");
    if (!subId) return back("error");
    const sub = await paypal<Subscription>(`/v1/billing/subscriptions/${encodeURIComponent(subId)}`);
    if (sub.custom_id !== user.id) return back("error");
    if (sub.status === "ACTIVE" || sub.status === "APPROVED") {
      await db.user.update({ where: { id: user.id }, data: { paypalSubscriptionId: sub.id } }).catch(() => {});
    }
    return back("sub_pending");
  }

  const orderId = q.get("token");
  if (!orderId) return back("error");
  let order: Order;
  try {
    // PayPal-Request-Id makes a refresh of this page replay the same capture instead of failing
    order = await paypal<Order>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      body: {},
      requestId: `capture-${orderId}`,
    });
  } catch (e) {
    if (e instanceof PayPalError && e.issue === "ORDER_ALREADY_CAPTURED") {
      order = await paypal<Order>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    } else {
      console.error("paypal capture failed", e);
      return back(e instanceof PayPalError && e.issue === "INSTRUMENT_DECLINED" ? "declined" : "error");
    }
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) return back("error");
  const outcome = await grantForCapture(
    { ...capture, custom_id: capture.custom_id ?? order.purchase_units?.[0]?.custom_id },
    user.id,
  );
  return back(outcome === "granted" || outcome === "duplicate" ? "success" : outcome === "pending" ? "pending" : "error");
}
