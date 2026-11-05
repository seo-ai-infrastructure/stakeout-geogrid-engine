"use client";

import { useState } from "react";

/** Starts a PayPal checkout for a pack (or a subscription for a plan) and sends the buyer to PayPal. */
export default function BuyButton({ kind, id, label, primary }: { kind: "pack" | "plan"; id: string; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    const res = await fetch(kind === "pack" ? "/api/billing/paypal/order" : "/api/billing/paypal/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "pack" ? { packId: id } : { planId: id }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && json.url) {
      window.location.href = json.url;
      return;
    }
    setBusy(false);
    setErr(json.error ?? "PayPal couldn't start the payment. Try again in a minute.");
  }

  return (
    <span className="buy">
      <button className={primary ? "btn" : "btn secondary"} disabled={busy} onClick={go}>
        {busy ? "Opening PayPal…" : label}
      </button>
      {err && <span className="error" role="alert">{err}</span>}
    </span>
  );
}
