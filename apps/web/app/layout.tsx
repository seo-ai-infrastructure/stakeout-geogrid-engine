import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans-condensed/latin-600.css";
import { requireUser, isAdmin } from "@/lib/auth";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { site } from "@/lib/site";
import { platformEnabled, unavailableMessage } from "@/lib/availability";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: `${site.name}: local rankings recorded on real phones`, template: `%s | ${site.name}` },
  description:
    "Geo-grid rank tracking using real Android phone sessions, residential proxy targeting, and private video receipts.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <html lang="en">
        <body>
          <header className="topbar">
            <Link href="/" className="brand">{site.name}</Link>
            <span className="spacer" />
            <nav className="topnav" aria-label="Main">
              <Link href="/pricing">Pricing</Link>
              {user && <Link href="/">Dashboard</Link>}
              {user && isAdmin(user.email) && <Link href="/status">System status</Link>}
            </nav>
            {user ? <form action="/api/auth/sign-out" method="post"><button className="btn secondary">Sign out</button></form> : <Link className="btn secondary" href="/sign-in">Sign in</Link>}
          </header>
          {!platformEnabled() && <div className="service-notice" role="status">{unavailableMessage}</div>}
          {children}
          <SiteFooter />
        </body>
      </html>
    </>
  );
}
