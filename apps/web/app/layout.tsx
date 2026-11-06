import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import { requireUser, isAdmin } from "@/lib/auth";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { site } from "@/lib/site";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex" });
const plexCondensed = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-plex-condensed" });

export const metadata: Metadata = {
  title: { default: `${site.name}: local rankings recorded on real phones`, template: `%s | ${site.name}` },
  description:
    "Geo-grid rank tracking where every point is a real Android phone on a home internet connection in that neighborhood, recorded on video.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <html lang="en" className={`${plex.variable} ${plexCondensed.variable}`}>
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
          {children}
          <SiteFooter />
        </body>
      </html>
    </>
  );
}
