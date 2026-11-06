import { NextResponse, type NextRequest } from "next/server";

// Authentication is checked against the database in every protected handler.
// Origin checks cover all browser mutations; PayPal verifies its own signature.
export default function middleware(req: NextRequest) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.nextUrl.pathname !== "/api/webhooks/paypal") {
    const origin = req.headers.get("origin");
    const allowed = new Set([req.nextUrl.origin, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean));
    if (!origin || !allowed.has(origin) || req.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
  }
  const res = NextResponse.next();
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
