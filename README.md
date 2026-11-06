# Stakeout Search GeoGrid

Real Android search measurements with per-pin recordings and results. The current architecture is Vercel (Next.js), Neon (accounts, sessions, credits, scans and dispatch outbox), Railway (BullMQ worker and private Redis), Cloudflare R2 (private captures), Resend SMTP (email sign-in), and PayPal (credit purchases).

## Deployment

- **Vercel:** root directory `apps/web`, Node 22, install `pnpm install --frozen-lockfile`, build `pnpm --filter @geogrid/db generate && pnpm build`. Enable source files outside the root directory. Variables are documented in `apps/web/.env.example`.
- **Railway worker:** Set `DUOPLUS_GROUP_NAME` to the dedicated worker group and `DUOPLUS_IMAGE_IDS=UXsp5` for this one-device pilot. The comma-separated allowlist applies to both discovery and leasing. The phone details API resolves proxy bindings; each worker phone must have a distinct saved proxy record. Video and screen dumps are required for a completed pin.
- **Railway build:** repository root, Dockerfile `apps/worker/Dockerfile`, start `pnpm --filter @geogrid/worker boot`. Watch worker, database, and workspace configuration files. Deployment teardown uses a 600-second drain and zero overlap; pause intake and drain pending work before planned updates. The boot command applies additive schema changes; inspect any schema change before deployment and never pass `--accept-data-loss`.
- **Railway Redis:** persistent `/data` volume, AOF enabled, `maxmemory-policy=noeviction`, no public TCP proxy. Worker `REDIS_URL=${{Redis.REDIS_URL}}`. Vercel does not need Redis access.
- **Saved proxy lists:** `PROXY_MODE=saved` preserves the proxy already bound to each DuoPlus phone. It checks that proxy on every pin and requires a verified US exit in the scan's exact city and state. Leave ISP blank in this mode; numeric ISP targets cannot be verified. Rotation stays provider-managed. `PROXY_MODE=dynamic` remains the default and requires working API Tool credentials to retarget Proxy-Seller. A saved proxy cannot serve arbitrary cities.
- **Neon:** the web app and worker share the same production branch. `DATABASE_URL` uses its pooled endpoint; `DIRECT_URL` uses the direct endpoint. Use a separate branch for integration tests.
- **R2:** keep the bucket private. The authenticated artifact endpoint checks scan ownership before issuing a 15-minute signed URL. No public bucket domain is required.
- **Resend:** verified sending domain, SMTP TLS on port 465 and an explicit `SMTP_FROM`. Email links expire in 15 minutes and require a confirmation click; revocable sessions expire in 30 days. New accounts start at zero credits. Admin email addresses can open `/status` after sign-in.
- **PayPal:** credentials and webhook must use the same sandbox/live environment. Configure `/api/webhooks/paypal` on the stable app URL. The application accepts `PAYPAL_PACKS_JSON` or the existing `PAYPAL_PACK_{500,750,3000,7500}_USD_CENTS` variables. Monthly plans require `PAYPAL_PLANS_JSON` with verified prices and plan IDs.

## Reliability

A scan, its pins, credit hold and dispatch rows commit atomically in Neon. Railway retries dispatch every five seconds with stable pin job IDs. A reconciler repairs missing Redis jobs and failed-event persistence. Pin completion, refund and scan counters commit in one transaction and cannot transition between terminal states. Device leases use per-attempt owners and periodic renewal. Retries write to separate artifact paths, so stale recordings are not reused.

The status page distinguishes infrastructure availability from device readiness and untested proxy targeting. A running deployment alone does not establish that a real-device scan works.

## Launch controls and acceptance

`PLATFORM_ENABLED=false` in Vercel pauses new scans and new PayPal purchases at both the UI and API. Sign-in, balances, existing reports and payment notifications continue to work. Change it to `true` and redeploy only after the launch gates below pass, including repeatable location-correct captures and a complete customer flow.

On November 6, the worker was corrected to use Railway's private Redis instead of its stale Upstash endpoint. The heartbeat now verifies Redis and R2 access. The allowlist permits only `UXsp5`; other discovered phones are excluded even if they become powered on and ready. Its saved proxy passes the provider’s US/Mount Juliet check, but a Chrome capture displayed Uzbekistan; provider metadata alone is insufficient to accept browser location. `PROXY_MODE=saved` allows this matching area without replacing its working provider configuration. Dynamic Proxy-Seller credentials still fail authentication and must be corrected before offering arbitrary target cities.

An internal one-pin acceptance scan, `acceptance-uxsp5-20261106-1025`, completed on `UXsp5` on its first attempt. The query was “coffee shops near me,” target Starbucks, at 36.213258, -86.533173. It captured nine organic listings and placed Starbucks seventh. The worker saved the MP4, raw dump archive, XML, JSON, HTML and metadata in private R2. Owner downloads and byte-range video access passed. This operator test used a transactional database seed while public scan creation remained paused; it does not establish a completed paid customer checkout-to-scan flow.

The preceding failed scan exposed current Maps rating labels (`4.7 stars (105)`) and digit-prefixed business names (`7 Brew Coffee`) that the parser did not recognize. Regression tests cover both. Failed attempts refunded the held credit exactly once. A capture that lacks the target and contains fewer than 20 recognized organic listings now fails rather than claiming a verified 20+ rank.

Chrome scan `acceptance-uxsp5-20261106-1035-chrome` completed on retry and its recording decoded successfully. The capture includes AI Overview business cards. Its rank 1 for Compassion Coffeehouse is parsed card order, not a separately verified Local Pack ranking. The current parser does not distinguish AIO and Local Pack sections. The 1925-chrome repeat failed after three attempts and refunded once. Its first recording and XML showed an Uzbek interface and Uzbekistan businesses despite the intended Mount Juliet point. Chrome location and capture reliability remain unaccepted for public sales.

The Google app was installed from DuoPlus’s official catalog. Standard Android UI dumping fixed the shell-only XML problem. Scan `acceptance-uxsp5-20261106-1925-google` completed on attempt 2: Compassion Coffeehouse first among three organic listings, with the sponsored Scooter’s card excluded. The 45.014-second MP4 decoded and visibly confirms Mount Juliet and the target’s order. All six private artifacts downloaded. This is an accepted one-pin result, not full-grid repeatability.

Capture hardening now includes app-package validation, bounded cold-start onboarding, Android-compatible archive decompression checks, and exclusion of entire sponsored-result groups. The worker waits 150 seconds for a video upload and can recover a failed upload through the command API with byte-count and checksum verification while retaining the phone lease. This recovery branch passed unit/type/build checks; the accepted Google run used direct upload and did not exercise that branch.

A sign-in email to the configured administrator was delivered according to Resend; the confirmation and authenticated session passed. Current authentication remains email-link based. The supplied Clerk public verification key is staged in Vercel as `CLERK_JWT_KEY`, but Clerk is not enabled: its application credentials and integration still require completion. The privacy page describes the currently active providers.

Before public sales, resolve Chrome’s observed location mismatch, establish capture repeatability and separate AIO/Local Pack attribution, supply the actual legal entity name and jurisdiction, finish the chosen authentication setup, restore and test dynamic targeting if selling multiple cities, and verify a buyer-approved PayPal transaction. Live payment execution remains untested. Monthly subscriptions remain unconfigured; the four existing one-time credit packs are supported. Keep `PLATFORM_ENABLED=false` until these launch requirements are met.

## Development and validation

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm --filter web build
pnpm --filter web start
```

`tests/integration.ts` exercises auth expiry/replay, revocation, CSRF, ownership, concurrent credit holds, durable outbox, idempotent grants/refunds and ledger consistency against a running app and an **isolated** database. It refuses to run without `TEST_DATABASE=1`:

```sh
TEST_DATABASE=1 pnpm --filter @geogrid/worker exec tsx ../../tests/integration.ts
```

Never point that test at production. Real phone captures, proxy location accuracy, video playback, PayPal buyer checkout and email inbox delivery also require live acceptance checks. `spec.md` contains the original device contracts and product scope; its deployment/authentication sections are superseded by this README.

The pinned GitHub Actions workflow runs Node 22 / pnpm 9.15.9 type checks, device/parser/map regressions, and the web build without production secrets. See `docs/SETUP_ACCEPTANCE_2026-11-06.md` for the recorded results and remaining gates.
