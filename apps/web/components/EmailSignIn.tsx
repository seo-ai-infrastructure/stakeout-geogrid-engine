"use client";
import { useState } from "react";
export default function EmailSignIn() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const email = new FormData(e.currentTarget).get("email");
    try {
      const res = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to send email.");
      setSent(true);
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to connect. Try again."); }
    finally { setBusy(false); }
  }
  return sent ? <div role="status"><h2>Check your inbox</h2><p>Your sign-in link is valid for 15 minutes. Open it and select Continue to sign in.</p><p className="muted">If it does not arrive, check your spam folder.</p></div> :
    <form className="form" onSubmit={submit}>
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com" /></label>
      <button className="btn" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>;
}
