import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";
import { operator, site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const who = operator();
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and {who} (&quot;we&quot;, &quot;us&quot;), which operates {site.name}
        {site.address ? `, ${site.address}` : ""}. By creating an account or buying credits you accept them. If you use {site.name} for a
        company, you accept them for that company.
      </p>

      <h2>1. The service</h2>
      <p>
        {site.name} runs local searches on cloud-hosted Android phones at points you choose on a map, records each search, and reports where a
        business appears in the results. Results show what that phone saw at that moment. Search results change constantly and vary by device,
        time and many other factors, so we don&apos;t promise that any result matches what every person in that area sees.
      </p>
      <p>
        {site.name} is independent and isn&apos;t affiliated with, endorsed by or sponsored by Google. Google Maps is a trademark of Google LLC.
      </p>

      <h2>2. Your account</h2>
      <p>
        You must be at least 18 and give accurate account details. You&apos;re responsible for everything done through your account and for
        keeping your sign-in secure. Tell us at <Contact /> if you think someone else has used it.
      </p>

      <h2>3. Credits and payment</h2>
      <ul>
        <li>Scans are paid for with prepaid credits. One credit pays for one grid point. Prices are shown on the <Link href="/pricing">pricing page</Link> before you pay.</li>
        <li>There are no free credits or trials. Payments are processed by PayPal under PayPal&apos;s own terms.</li>
        <li>When you start a scan, the credits for every point are reserved. Credits for points that can&apos;t be completed are returned automatically.</li>
        <li>Credits don&apos;t expire, have no cash value, and can&apos;t be transferred or resold.</li>
        <li>Prices may change; a change never affects credits you&apos;ve already bought.</li>
        <li>Monthly plans renew until you cancel them in PayPal. Credits already added stay in your account after you cancel.</li>
        <li>You&apos;re responsible for any taxes that apply to your purchase.</li>
      </ul>
      <p>Refunds are covered by our <Link href="/refunds">refund policy</Link>.</p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use {site.name} for anything unlawful, deceptive or harmful;</li>
        <li>misrepresent our reports, for example by editing a video or report and presenting it as unedited;</li>
        <li>copy, resell or give others direct access to the service, or try to extract its code or data in bulk, without our written permission;</li>
        <li>interfere with the service, test its security without permission, or get around limits we set;</li>
        <li>share your account with people outside your organization.</li>
      </ul>

      <h2>5. Your data and reports</h2>
      <p>
        You keep the rights to the information you enter (keywords, business names, locations). You give us permission to use it to run your
        scans and operate the service. Reports, videos and data we produce for you are yours to use for your business and your clients.
        Report links are private but unguessable, so anyone you share a link with can open it. How we handle personal data is described in our{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>6. Availability</h2>
      <p>
        {site.name} depends on outside services, including cloud phones, internet providers, hosting, payment processing and the search
        services being measured. Any of them can slow down, change, block or stop working. We work to keep scans running but don&apos;t guarantee
        the service will be uninterrupted or that any particular search can be completed. Our remedy for a point we can&apos;t complete is the
        automatic credit described above.
      </p>

      <h2>7. Disclaimer</h2>
      <p>
        Apart from what these terms expressly promise, the service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of
        any kind, including fitness for a particular purpose, accuracy or non-infringement, to the extent the law allows. Rankings are
        observations, not advice; decisions you make based on them are your own.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the extent the law allows, neither we nor our suppliers are liable for indirect, incidental, special or consequential damages, or for
        lost profits, revenue or data. Our total liability for any claim relating to the service is limited to the amount you paid us in the
        three months before the claim arose. Nothing in these terms limits liability that can&apos;t be limited by law.
      </p>

      <h2>9. Indemnity</h2>
      <p>
        You&apos;ll cover our reasonable losses and costs from claims by third parties that arise from your breach of these terms or your misuse
        of the service.
      </p>

      <h2>10. Suspension and ending</h2>
      <p>
        You can stop using {site.name} at any time. We may suspend or close an account that breaches these terms, puts the service at risk, or
        is linked to an open payment dispute; credits on an account closed for a breach are forfeited. If we shut the service down permanently,
        we&apos;ll give at least 30 days&apos; notice where we can and refund the purchase value of unused credits.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms. We&apos;ll post the new version here with a new date and, for significant changes, tell account holders by
        email. Continuing to use the service after a change means you accept the updated terms.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of {site.jurisdiction || "the place where the operator is established"}, without regard to its
        conflict-of-law rules, and disputes will be handled by the courts located there, unless the law of your country gives you a right to
        bring a claim elsewhere.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these terms: <Contact />.
      </p>
    </LegalPage>
  );
}
