import Link from "next/link";
import { site, operator } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <strong>{site.name}</strong>
          <div className="muted">Local rankings recorded on real phones.</div>
        </div>
        <nav aria-label="Footer">
          <Link href="/pricing">Pricing</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refunds">Refund policy</Link>
          {site.supportEmail && <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>}
        </nav>
        <div className="muted small">
          © {new Date().getFullYear()} {operator()}. Not affiliated with Google. Google Maps is a trademark of Google LLC.
        </div>
      </div>
    </footer>
  );
}
