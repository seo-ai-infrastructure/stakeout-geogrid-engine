import Link from "next/link";
import { db } from "@geogrid/db";
import { requireUser } from "@/lib/auth";
import NewScanForm from "@/components/NewScanForm";
import Landing from "@/components/Landing";
import BuyCredits from "@/components/BuyCredits";
import { currency, packs, plans } from "@/lib/billing";
import { platformEnabled } from "@/lib/availability";

export const dynamic = "force-dynamic";

const BILLING_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  success: { text: "Payment received. Your credits have been added." },
  pending: { text: "PayPal is still processing this payment. Credits are added automatically once it clears." },
  sub_pending: { text: "Subscription approved. Your first month of credits appears within a minute of PayPal's first charge." },
  cancel: { text: "Payment cancelled. You were not charged." },
  declined: { text: "PayPal declined that payment method. Choose another funding source in PayPal and try again.", error: true },
  error: { text: "The payment could not be confirmed. If PayPal charged you, the credits are added automatically within a few minutes.", error: true },
  signin: { text: "Sign in again to finish the payment.", error: true },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const billing = typeof sp.billing === "string" ? BILLING_MESSAGES[sp.billing] : undefined;
  const user = await requireUser();
  if (!user) return <Landing />;
  const enabled = platformEnabled();
  const scans = await db.gridScan.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <main className="page">
      <div className="two-col">
        <section>
          {billing && (
            <p className={billing.error ? "error" : "muted"} role="status" style={{ marginTop: 0 }}>{billing.text}</p>
          )}
          <h1>Scans</h1>
          <p className="muted">
            Credits available: <strong className="num">{user.creditBalance}</strong>. Each point costs 1 credit. Points that fail are credited back automatically.
          </p>
          {!enabled && scans.length === 0 ? <p className="muted">Your account is ready. New scans will be available when service setup is complete.</p> : user.creditBalance === 0 && scans.length === 0 ? (
            <div className="empty">
              <h2>Buy credits to run your first scan</h2>
              <p>
                A 3×3 grid uses 9 credits and a 7×7 uses 49. Pick a pack under Buy credits, pay with PayPal, and your balance updates as soon as you
                return. <Link href="/pricing">Compare packs</Link>
              </p>
            </div>
          ) : scans.length === 0 ? (
            <p className="muted">No scans yet. Start one on the right: a 3×3 is a good first run and uses 9 credits.</p>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Target</th>
                  <th>Grid</th>
                  <th>Status</th>
                  <th className="num">ARP</th>
                  <th className="num">ATRP</th>
                  <th className="num">SoLV</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/scans/${s.id}`}>{s.keyword}</Link><div className="muted" style={{ fontSize: 12 }}>{s.city}, {s.stateCode} · {s.targetType}</div></td>
                    <td>{s.targetBusiness.split("|")[0]}</td>
                    <td className="num">{s.gridSize}×{s.gridSize} · {s.completedPins + s.failedPins}/{s.totalPins}</td>
                    <td><span className="status" data-s={s.status}>{s.status.toLowerCase()}</span></td>
                    <td className="num">{s.arp ?? "–"}</td>
                    <td className="num">{s.atrp ?? "–"}</td>
                    <td className="num">{s.solv != null ? `${s.solv}%` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {enabled && <aside>
          <NewScanForm creditBalance={user.creditBalance} />
          <BuyCredits packs={packs()} plans={plans()} currency={currency()} hasSubscription={!!user.paypalSubscriptionId} />
        </aside>}
      </div>
    </main>
  );
}
