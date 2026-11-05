import { NextResponse } from "next/server";
import { db } from "@geogrid/db";
import { verifyWebhook, type Capture } from "@/lib/paypal";
import { grantForCapture, grantForSale } from "@/lib/paypalGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalEvent = {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
};

/**
 * Subscribe this URL in the PayPal app to:
 *   PAYMENT.CAPTURE.COMPLETED, PAYMENT.SALE.COMPLETED,
 *   BILLING.SUBSCRIPTION.CANCELLED, BILLING.SUBSCRIPTION.EXPIRED, BILLING.SUBSCRIPTION.SUSPENDED
 * Grants are idempotent by capture/sale id, so redeliveries are harmless.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let ok = false;
  try {
    ok = await verifyWebhook(req.headers, raw);
  } catch (e) {
    console.error("paypal webhook verify error", e);
    return new NextResponse("verification error", { status: 500 }); // PayPal retries
  }
  if (!ok) return new NextResponse("invalid signature", { status: 400 });

  const event = JSON.parse(raw) as PayPalEvent;
  const r = event.resource ?? {};
  try {
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const outcome = await grantForCapture(r as unknown as Capture);
        console.log(`paypal capture ${String(r.id)} → ${outcome}`);
        break;
      }
      case "PAYMENT.SALE.COMPLETED": {
        const subId = typeof r.billing_agreement_id === "string" ? r.billing_agreement_id : null;
        if (subId) console.log(`paypal sale ${String(r.id)} → ${await grantForSale(String(r.id), subId)}`);
        break;
      }
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
      case "BILLING.SUBSCRIPTION.SUSPENDED": {
        if (typeof r.id === "string") {
          await db.user.updateMany({ where: { paypalSubscriptionId: r.id }, data: { paypalSubscriptionId: null } });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error(`paypal webhook ${event.event_type} failed`, e);
    return new NextResponse("handler error", { status: 500 }); // PayPal retries; grants are idempotent
  }
  return NextResponse.json({ received: true });
}
