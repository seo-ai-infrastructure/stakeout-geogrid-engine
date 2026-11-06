import Link from "next/link";
import { validToken } from "@/lib/auth";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="page" style={{ maxWidth: 520 }}><h1>Finish signing in</h1>{token && validToken(token) ? <><p>Continue to securely open your Stakeout account.</p><form action="/api/auth/verify" method="post"><input type="hidden" name="token" value={token} /><button className="btn">Continue to dashboard</button></form></> : <p>This link is invalid. <Link href="/sign-in">Request a new sign-in link</Link>.</p>}</main>;
}
