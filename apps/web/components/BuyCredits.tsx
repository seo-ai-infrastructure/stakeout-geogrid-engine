"use client";

import { useState } from "react";
import type { CreditPack, CreditPlan } from "@/lib/billing";

export default function BuyCredits({
  packs,
  plans,
  currency,
  hasSubscription,
}: {
  packs: CreditPack[];
  plans: CreditPlan[];
  currency: string;
  hasSubscription: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(key: string, path: string, body: Record<string, string>) {
    setBusy(key);
    setErr(null);
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && json.url) {
      window.location.href = json.url;
      return;
    }
    setBusy(null);
    setErr(json.error ?? "PayPal could not start the payment. Try again in a minute.");
  }

  if (!packs.length && !plans.length) return null;
  const money = (p: string) => (currency === "USD" ? `$${p}` : `${p} ${currency}`);

  return (
    <div className="form" style={{ marginTop: 16 }}>
      <strong>Buy credits</strong>
      {packs.map((p) => (
        <button key={p.id} className="btn secondary" disabled={!!busy} onClick={() => go(p.id, "/api/billing/paypal/order", { packId: p.id })}>
          {busy === p.id ? "Opening PayPal…" : `${p.label} · ${money(p.price)}`}
        </button>
      ))}
      {plans.length > 0 &&
        (hasSubscription ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Your monthly subscription is active. Credits are added each time PayPal bills you. Cancel any time from your PayPal account under Automatic payments.
          </p>
        ) : (
          plans.map((p) => (
            <button key={p.planId} className="btn" disabled={!!busy} onClick={() => go(p.planId, "/api/billing/paypal/subscribe", { planId: p.planId })}>
              {busy === p.planId ? "Opening PayPal…" : `Subscribe: ${p.label} · ${money(p.price)}/mo`}
            </button>
          ))
        ))}
      {err && <div className="error">{err}</div>}
      <div className="muted" style={{ fontSize: 12 }}>
        Payments are processed by PayPal. Credits never expire. Purchases are final (<a href="/refunds">refund policy</a>).
      </div>
    </div>
  );
}
