import type { Metadata } from "next";
import Link from "next/link";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import BuyButton from "@/components/BuyButton";
import { money, packs, perCredit, plans } from "@/lib/billing";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

const GRIDS = [3, 5, 7, 9, 11];

export default function PricingPage() {
  const list = [...packs()].sort((a, b) => Number(a.price) - Number(b.price));
  const subs = plans();
  const best = [...list].sort((a, b) => Number(a.price) / a.credits - Number(b.price) / b.credits)[0];
  const entry = list[0];

  return (
    <main className="page narrow">
      <h1 className="display small-display">Pricing</h1>
      <p className="lede">
        Buy credits once and spend them on any scan. One credit is one point on a grid. Every point is a real phone search, recorded on video,
        so there is no free tier and no trial.
      </p>

      {list.length === 0 ? (
        <p className="error">Credit packs aren&apos;t configured yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="price-table">
            <thead>
              <tr>
                <th scope="col">Pack</th>
                <th scope="col" className="num">Credits</th>
                <th scope="col" className="num">Price</th>
                <th scope="col" className="num">Per point</th>
                <th scope="col" className="num">7×7 scans</th>
                <th scope="col"><span className="sr-only">Buy</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} data-best={best?.id === p.id}>
                  <th scope="row">
                    {p.name ?? p.label}
                    {best?.id === p.id && list.length > 1 && <span className="tag">Lowest per point</span>}
                  </th>
                  <td className="num">{p.credits.toLocaleString("en-US")}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className="num">{perCredit(p)}</td>
                  <td className="num">{Math.floor(p.credits / 49)}</td>
                  <td>
                    <SignedIn>
                      <BuyButton kind="pack" id={p.id} label={`Buy ${p.name ?? p.label}`} primary={best?.id === p.id} />
                    </SignedIn>
                    <SignedOut>
                      <SignUpButton mode="modal" forceRedirectUrl="/pricing">
                        <button className={best?.id === p.id ? "btn" : "btn secondary"}>Create account to buy</button>
                      </SignUpButton>
                    </SignedOut>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subs.length > 0 && (
        <>
          <h2>Monthly plans</h2>
          <p>Credits added each month when PayPal bills you. Cancel anytime in your PayPal account; credits already added stay yours.</p>
          <ul className="plain-list">
            {subs.map((s) => (
              <li key={s.planId}>
                <strong>{s.label}</strong> <span className="muted">{money(s.price)} a month</span>{" "}
                <SignedIn>
                  <BuyButton kind="plan" id={s.planId} label="Subscribe" />
                </SignedIn>
              </li>
            ))}
          </ul>
        </>
      )}

      {entry && best && (
        <>
          <h2>What a scan costs</h2>
          <div className="table-wrap">
            <table className="price-table compact">
              <thead>
                <tr>
                  <th scope="col">Grid</th>
                  <th scope="col" className="num">Points (credits)</th>
                  <th scope="col" className="num">On {entry.name ?? entry.label}</th>
                  {best.id !== entry.id && <th scope="col" className="num">On {best.name ?? best.label}</th>}
                </tr>
              </thead>
              <tbody>
                {GRIDS.map((g) => (
                  <tr key={g}>
                    <th scope="row">{g}×{g}</th>
                    <td className="num">{g * g}</td>
                    <td className="num">{money((g * g * Number(entry.price)) / entry.credits)}</td>
                    {best.id !== entry.id && <td className="num">{money((g * g * Number(best.price)) / best.credits)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>The fine print, up front</h2>
      <ul className="plain-list">
        <li>Credits never expire and work on every search type: Google Maps app, Google app and Chrome.</li>
        <li>A point that still fails after three tries is credited back to your balance automatically.</li>
        <li>Purchases are final; we don&apos;t refund unused credits. Read the <Link href="/refunds">refund policy</Link>.</li>
        <li>Payments are handled by PayPal. We never see your card or bank details.</li>
      </ul>
      {site.supportEmail && (
        <p className="muted">
          Buying for a large agency? Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
        </p>
      )}
    </main>
  );
}
