import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appUrl, currency, findPack, orderCustomId } from "@/lib/billing";
import { approveLink, paypal, type Order } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { packId } → { url } — creates a PayPal order at the server-side price and returns the approval URL. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { packId } = (await req.json().catch(() => ({}))) as { packId?: string };
  const pack = packId ? findPack(packId) : undefined;
  if (!pack) return NextResponse.json({ error: "unknown credit pack" }, { status: 400 });

  const order = await paypal<Order>("/v2/checkout/orders", {
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: pack.id,
          custom_id: orderCustomId(user.id, pack.id),
          description: `GeoGrid Engine — ${pack.label}`,
          amount: { currency_code: currency(), value: pack.price },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "GeoGrid Engine",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: `${appUrl()}/api/billing/paypal/return?kind=order`,
            cancel_url: `${appUrl()}/?billing=cancel`,
          },
        },
      },
    },
  });
  const url = approveLink(order.links);
  if (!url) return NextResponse.json({ error: "PayPal did not return an approval link" }, { status: 502 });
  return NextResponse.json({ url });
}
