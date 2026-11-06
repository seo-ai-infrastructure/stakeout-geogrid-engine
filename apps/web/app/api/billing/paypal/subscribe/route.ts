import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { site } from "@/lib/site";
import { appUrl, findPlan } from "@/lib/billing";
import { approveLink, paypal, type Subscription } from "@/lib/paypal";
import { platformEnabled, unavailableMessage } from "@/lib/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { planId } → { url }. The subscription is created server-side so
 * custom_id (our user id) cannot be tampered with in the browser.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!platformEnabled()) return NextResponse.json({ error: unavailableMessage }, { status: 503 });
  if (user.paypalSubscriptionId) return NextResponse.json({ error: "You already have an active subscription." }, { status: 409 });
  const { planId } = (await req.json().catch(() => ({}))) as { planId?: string };
  const plan = planId ? findPlan(planId) : undefined;
  if (!plan) return NextResponse.json({ error: "unknown plan" }, { status: 400 });

  const sub = await paypal<Subscription>("/v1/billing/subscriptions", {
    body: {
      plan_id: plan.planId,
      custom_id: user.id,
      application_context: {
        brand_name: site.name,
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: `${appUrl()}/api/billing/paypal/return?kind=sub`,
        cancel_url: `${appUrl()}/?billing=cancel`,
      },
    },
  });
  const url = approveLink(sub.links);
  if (!url) return NextResponse.json({ error: "PayPal did not return an approval link" }, { status: 502 });
  return NextResponse.json({ url });
}
