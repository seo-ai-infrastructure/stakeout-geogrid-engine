import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";
import { operator, site } from "@/lib/site";

export const metadata: Metadata = { title: "Refund policy" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy">
      <p>
        {site.name} sells prepaid credits. One credit pays for one point on a scan grid, and every point is carried out on a real phone with a
        paid network connection. This policy explains when money or credits come back to you.
      </p>

      <h2>No free trials</h2>
      <p>We don&apos;t offer free credits, free trials or free scans. You buy credits before running a scan.</p>

      <h2>Purchases are final</h2>
      <p>Credit purchases are non-refundable, including unused credits. Credits never expire, so you can use them whenever you need them.</p>

      <h2>Points that fail are credited back automatically</h2>
      <p>
        If a point can&apos;t be completed after three attempts, the credit for that point is returned to your balance automatically. You can see
        every charge and every credit returned in your scan history. Credits returned this way are not converted to money.
      </p>

      <h2>When we refund money</h2>
      <ul>
        <li>You were charged twice for the same purchase.</li>
        <li>A payment was made from your PayPal account without your authorization, reported within 30 days.</li>
        <li>We close the service permanently: we refund the purchase value of your unused credits.</li>
        <li>The law that applies to you gives you a right to a refund that this policy can&apos;t exclude.</li>
      </ul>
      <p>
        Refunds go back to the PayPal account that paid. To ask for one, email <Contact /> with the PayPal transaction ID. We answer within 5
        business days.
      </p>

      <h2>Disputes and chargebacks</h2>
      <p>
        Please contact us before opening a PayPal dispute; most problems are fixed faster that way. While a dispute or chargeback is open, we may
        pause the account it relates to. Credits from a purchase that is reversed are removed from your balance.
      </p>

      <p className="muted">This policy is part of the Terms of Service between you and {operator()}.</p>
    </LegalPage>
  );
}
