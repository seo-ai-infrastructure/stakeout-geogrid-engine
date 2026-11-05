import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import { ClerkProvider, SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${plex.variable} ${plexCondensed.variable}`}>
        <body>
          <header className="topbar">
            <Link href="/" className="brand">{site.name}</Link>
            <span className="spacer" />
            <nav className="topnav" aria-label="Main">
              <Link href="/pricing">Pricing</Link>
              <SignedIn>
                <Link href="/">Dashboard</Link>
              </SignedIn>
            </nav>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="btn secondary">Sign in</button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </header>
          {children}
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
