import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// PayPal must reach the webhook without a Clerk session.
// /status and /api/health are protected by HEALTH_TOKEN instead of a Clerk session
const isPublic = createRouteMatcher([
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/refunds",
  "/status",
  "/api/health",
  "/api/webhooks(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
