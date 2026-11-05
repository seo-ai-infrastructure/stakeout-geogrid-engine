import { site } from "@/lib/site";

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page legal">
      <h1 className="display small-display">{title}</h1>
      <p className="muted">Last updated {site.legalUpdated}</p>
      {children}
    </main>
  );
}

/** "email us at x" or a neutral fallback until NEXT_PUBLIC_SUPPORT_EMAIL is set. */
export function Contact() {
  return site.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : <>the support address listed on this site</>;
}
