import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";
import { operator, site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

const PROVIDERS: Array<[string, string]> = [
  ["Resend", "delivering account sign-in emails"],
  ["PayPal", "payments; PayPal handles your card or bank details, which we never receive"],
  ["Vercel", "hosting the website"],
  ["Railway", "running the scan service and its private job queue"],
  ["Neon", "the database holding accounts, sign-in sessions, credits and scan results"],
  ["Cloudflare", "storing scan videos and reports"],
  ["DuoPlus", "the cloud phones that run searches"],
  ["Proxy-Seller", "the residential internet connections the phones use"],
];

export default function PrivacyPage() {
  const who = operator();
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains what personal data {who} collects when you use {site.name}, why, and the choices you have. {who} is responsible
        for this data{site.address ? ` and can be reached at ${site.address}` : ""}.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address and sign-in information.</li>
        <li><strong>Purchase records:</strong> what you bought, when, the amount, and PayPal&apos;s transaction ID. We don&apos;t receive card or bank details.</li>
        <li><strong>Scan inputs:</strong> keywords, business names, locations and grid settings you enter.</li>
        <li><strong>Scan results:</strong> rankings, screen recordings and saved results lists from public search pages.</li>
        <li><strong>Technical data:</strong> IP address, browser type and request logs kept by our hosting providers for security and troubleshooting.</li>
      </ul>
      <p>
        Scan videos and results show public search listings, which can include business names, addresses and phone numbers. They don&apos;t
        include data about you beyond the search you asked for.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To run your scans, show your results and keep your credit balance accurate (performing our contract with you).</li>
        <li>To take payments and keep financial records (contract and legal obligations).</li>
        <li>To secure the service, prevent fraud and fix problems (our legitimate interests).</li>
        <li>To email you about your account, purchases and important changes to the service. We don&apos;t send marketing email unless you agree to it.</li>
      </ul>
      <p>We don&apos;t sell your personal data, and we don&apos;t use advertising or third-party tracking cookies.</p>

      <h2>Cookies</h2>
      <p>We use only the cookies needed to keep you signed in and protect your account. Without them you can&apos;t sign in.</p>

      <h2>Who processes data for us</h2>
      <p>These providers process data on our behalf, each only for the purpose listed:</p>
      <ul>
        {PROVIDERS.map(([name, why]) => (
          <li key={name}>
            <strong>{name}:</strong> {why}
          </li>
        ))}
      </ul>
      <p>
        Some of these providers process data in the United States and other countries. Where the law requires it, transfers are covered by
        appropriate safeguards such as standard contractual clauses.
      </p>

      <h2>Sharing reports</h2>
      <p>
        Scan pages and evidence downloads require sign-in and scan ownership. Opening evidence creates a temporary download link that
        expires after 15 minutes. Anyone with that temporary link can use it until it expires, so share it only with people you intend to.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data and scan results: while your account is open. Ask us to delete them at any time.</li>
        <li>Purchase records: as long as tax and accounting law requires, typically up to 7 years.</li>
        <li>Server logs: kept by our hosting providers for a limited period under their own policies.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you can ask to access, correct, delete or export your personal data, or object to or restrict how we use
        it. Email <Contact /> and we&apos;ll respond within 30 days. If you&apos;re in the EU or UK you can also complain to your data protection
        authority. Residents of California and other US states with privacy laws have the same rights to know, correct and delete, and we
        don&apos;t sell or share personal data for targeted advertising.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, access is limited to the systems that need it, and payment details stay with PayPal. No system is
        perfectly secure; if a breach affects your data we&apos;ll tell you as the law requires.
      </p>

      <h2>Children</h2>
      <p>{site.name} is for businesses and isn&apos;t intended for anyone under 18. We don&apos;t knowingly collect data from children.</p>

      <h2>Changes</h2>
      <p>We&apos;ll post any changes here with a new date and email account holders about significant ones.</p>

      <h2>Contact</h2>
      <p>
        Privacy questions or requests: <Contact />.
      </p>
    </LegalPage>
  );
}
