# GeoGrid Engine — Technical Specification (`spec.md`)

**Product:** Real-device, anti-detect GeoGrid local-rank intelligence SaaS
**Version:** 1.5.0 (2026-11-05) — paid-only (no free credits), premium credit packs, public landing / pricing / legal pages (§5.4). 1.4.1: /status health page (§12a). 1.4.0: phones discovered from DuoPlus (concurrency = active phones); one rotating Proxy-Seller proxy per phone instead of per-pin proxies; 7-step on-phone flow with typed search, slow scroll and SERP XML/JSON/HTML outputs
**Stack:** Vercel (Next.js 15, App Router) · Railway (BullMQ worker, Docker) · Upstash Redis · Cloudflare R2 · Neon Postgres · PayPal (Orders v2 + Subscriptions v1). Fully hosted: no local machine runs anything.
**Providers:** DuoPlus cloud phones (Android 12) · Proxy-Seller residential (v2, login-suffix targeting)

This file is the single source of truth. Coding agents: read it before touching anything, and keep it updated when behaviour changes.

---

## 0. Ship-today checklist (≈ 3 hours, browser only, in this order)

Nothing is installed or run on a local machine. Every step happens in a vendor dashboard; everything that used to be a local script runs automatically when the Railway worker boots (§8).

| # | Step | Where | Done when |
|---|------|-------|-----------|
| 1 | Upload the repo to a private GitHub repo (web uploader) | GitHub | `apps/`, `packages/`, `railway.json` visible |
| 2 | Create Neon project; copy `DATABASE_URL` (pooled) + `DIRECT_URL` | Neon | two URLs saved |
| 3 | Create Upstash Redis (TLS, eviction off, Fixed plan); copy `REDIS_URL=rediss://…` | Upstash | URL saved |
| 4 | Create R2 bucket `geogrid-artifacts`, S3 API token, public r2.dev URL | Cloudflare | `R2_*` + public URL saved |
| 5 | Proxy-Seller API Tool list (base login + password); ISP ids per city | Proxy-Seller | credentials saved |
| 6 | DuoPlus API key; one saved proxy record bound to each phone (the worker rewrites its login) | DuoPlus | key saved; each phone shows a proxy |
| 7 | Deploy worker to Railway with §10.2 variables | Railway | boot logs show tables pushed, `DuoPlus: 3 phone(s) powered on, 3 usable … concurrency 3`, `worker ready concurrency=3 phones=3` |
| 8 | Clerk app; PayPal sandbox app; deploy web to Vercel with §10.1 variables; set `NEXT_PUBLIC_APP_URL`, redeploy | Clerk, PayPal, Vercel | sign in shows 0 credits and Buy credits; `/`, `/pricing`, `/terms`, `/privacy`, `/refunds` load signed out |
| 9 | Register PayPal webhook → `/api/webhooks/paypal` (§5.3), set `PAYPAL_WEBHOOK_ID`, redeploy | PayPal, Vercel | sandbox pack purchase adds credits once |
| 10 | Create a 3×3 `mobile_maps` scan from the UI | prod | 9 pins complete, videos play from R2, ARP/ATRP/SoLV shown |

Everything below explains the system those ten steps deploy.

---

## 1. What the product does (and will not do)

Traditional grid trackers approximate ranks with the Places API or datacenter scrapers. This platform runs **observation-only, street-level local searches on real Android cloud phones**, each session routed through an **ISP- and ZIP-matched residential exit**, and keeps **verifiable proof** per pin:

1. Residential exit proof — the full DuoPlus `proxy/check` response (IP, ISP, city, region, timezone) stored as `GridPin.proxyMeta`.
2. A 45-second screen recording (`video.mp4`) in R2.
3. Multi-stop accessibility dumps (`dumps.tar.gz`, one XML per scroll stop).
4. Computed rank per pin and scan-level **ARP / ATRP / SoLV**.

Guardrails (non-negotiable): every session is **search → scroll → dump → leave**. No clicks on results, no calls, no directions, no reviews, no form submissions. Sponsored results are recorded but excluded from organic rank.

Non-goals for v1: multi-keyword scans, scheduled re-runs, competitor history charts, team seats, white-label. The schema does not block any of these.

---

## 2. Topology

```text
+------------------------------------------------------------------------------------+
|                               VERCEL  (apps/web)                                   |
|  Next.js 15 · Clerk auth · MapLibre GeoGrid UI · PayPal orders/subs/webhook        |
|  POST /api/scans  -> atomic credit hold (Neon) -> pinQueue.addBulk (Upstash)       |
|  GET  /api/scans/:id -> grid + pins + R2 URLs (UI polls every 5 s while running)   |
+---------------------+-------------------------------------------+------------------+
                      | Prisma (pooled)                           | BullMQ (rediss://)
                      v                                           v
+-------------------------------+              +-------------------------------------+
|       NEON POSTGRES           |              |          UPSTASH REDIS              |
|  User · CreditLedger          |<-----+       |  queue   geogrid-pins               |
|  GridScan · GridPin           |      |       |  lease   lock:duoplus:<imageId>     |
|  DevicePool                   |      |       |  limiter rl:duoplus:<endpoint>      |
+-------------------------------+      |       +------------------+------------------+
                                       |                          |
                                       |                          v
                         +-------------+--------------------------------------------+
                         |   RAILWAY  (apps/worker, Docker)                         |
                         |  boot: db push · DuoPlus phone discovery · preflight (§8)|
                         |  BullMQ Worker · DuoPlus OpenAPI (1 QPS gate)            |
                         |  1 rotating proxy per phone · GPS per pin · run_pin.sh   |
                         |  polls R2 (HeadObject) · parses dumps · writes results   |
                         +-------------+--------------------------------------------+
                                       | cloudPhone/update + command (HTTPS, no ADB)
                                       v
+--------------------------------------------+        +--------------------------------------------+
|   DUOPLUS CLOUD PHONES (Android 12)        |        |   CLOUDFLARE R2  geogrid-artifacts         |
|   exit via Proxy-Seller home IP            | -----> |   scans/<scanId>/pin_<r>_<c>/              |
|   /data/local/tmp/rt/run_pin.sh            |  curl  |   video · dumps · serp.xml/json/html       |
|   clear · record · type · scroll · dump    |  -T    |   zero egress; customers stream from here  |
+--------------------------------------------+        +--------------------------------------------+
```

Rules of the topology:
- Vercel never talks to DuoPlus, Proxy-Seller or a browser. It writes rows and enqueues jobs. Function budget < 1 s.
- Only workers hold the DuoPlus and Proxy-Seller secrets.
- Large binaries never transit Vercel or the worker: phones `PUT` straight to R2; the worker only downloads the small `dumps.tar.gz`.
- No local machine is part of the system. The worker reaches phones only through the DuoPlus HTTPS API (no ADB, no IP whitelist), so any number of Railway replicas can run it.

---

## 3. Repository layout (pnpm workspace)

```text
geogrid-engine/
├── spec.md                      ← this file
├── README.md                    ← quickstart (mirrors §0)
├── package.json  pnpm-workspace.yaml  railway.json  .env.example
├── packages/db/                 @geogrid/db — Prisma schema + client singleton
│   ├── prisma/schema.prisma
│   └── src/index.ts
├── apps/web/                    Next.js 15 (Vercel)
│   ├── app/page.tsx                    landing (signed out) · scan list + new-scan form (signed in)
│   ├── app/pricing · terms · privacy · refunds   public pages (§5.4)
│   ├── app/scans/[id]/page.tsx         GeoGrid map + pin drawer
│   ├── app/api/scans/route.ts          POST create (credit hold + enqueue), GET list
│   ├── app/api/scans/[id]/route.ts     GET scan detail for the UI
│   ├── app/api/billing/paypal/order/route.ts      create PayPal order for a credit pack → approval URL
│   ├── app/api/billing/paypal/subscribe/route.ts  create PayPal subscription (server-side custom_id) → approval URL
│   ├── app/api/billing/paypal/return/route.ts     buyer returns: capture order / record subscription
│   ├── app/api/webhooks/paypal/route.ts           verified webhook → idempotent credit grants
│   ├── middleware.ts                       Clerk (webhook + landing page public)
│   ├── components/GeoGrid.tsx, PinDrawer.tsx, NewScanForm.tsx, BuyCredits.tsx
│   └── lib/grid.ts (N×N matrix) · queue.ts · credits.ts · auth.ts · paypal.ts · paypalGrants.ts · billing.ts · artifacts.ts
└── apps/worker/                 BullMQ worker (Railway)
    ├── Dockerfile               CMD = `boot` script: prisma db push, then the worker
    ├── device/run_pin.sh        hardened on-device macro (§7.4)
    └── src/
        ├── index.ts     boot → Worker, failed-handler → refunds, idle mode
        ├── boot.ts      discovery + preflight + script push on boot and every refresh (§8)
        ├── devices.ts   one DuoPlus list call → active phones, subscriptions, bound proxy ids, slots
        ├── config.ts    typed env
        ├── redis.ts     connection · device lease · 1 QPS limiter
        ├── duoplus.ts   OpenAPI client (list/update/check/command, script push, file pull)
        ├── proxySeller.ts  login ladder + geo match
        ├── r2.ts        presign PUT · head · get
        ├── parse.ts     uiautomator XML → ordered listings (name, rating, reviews, details), rank, flags
        ├── serp.ts      serp.xml (all stops merged) · serp.json · serp.html recreation
        ├── metrics.ts   ARP · ATRP · SoLV
        ├── finalize.ts  pin complete/fail, refund, scan finalization
        └── mobile.ts    per-pin processor (§7.3)
```

---

## 4. Data model (`packages/db/prisma/schema.prisma`)

Changes from v1.0 are marked **(new)**.

| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `User` | Clerk-backed account | `clerkId` **(new, unique)**, `creditBalance` (starts at 0: no free credits), `paypalSubscriptionId` (active `I-…` id or null) |
| `CreditLedger` | Immutable double-entry log | `amount` (±), `reason` (`PAYPAL_TOPUP`, `PAYPAL_SUB`, `SCAN_HOLD`, `PIN_REFUND`, `SCAN_CANCEL_REFUND`, `ADJUSTMENT`), `externalId` **(unique; `paypal:capture:<id>` or `paypal:sale:<id>`)** |
| `DevicePool` | Mirror of the DuoPlus phone list (rewritten on every discovery) | `imageId` (PK), `proxyId`, `slotIndex` (→ Proxy-Seller port `10000+slot`), `cooldownUntil`, `lastUsedAt`, `scriptMd5`, `setupAt`, rotating-proxy state `proxyGeoKey`/`proxyLogin`/`proxyRung`/`proxyCheck`/`proxyConfiguredAt` **(1.4)** |
| `GridScan` | One keyword × one grid | geometry, `ispId`, cost/refund counters, `status`, `arp/atrp/solv` |
| `GridPin` | One coordinate | `rankFound` (1–20 or null), `topCompetitors` Json, `proxyMeta` Json, `flags` Json, `exitIp` (sample from the phone's proxy check), `proxyRung`, artifact keys incl. `serpXmlKey`/`serpJsonKey`/`serpHtmlKey` **(1.4)**, `lastError` |

Invariants:
- `User.creditBalance` changes only inside a transaction that also inserts a `CreditLedger` row. The sum of a user's ledger always equals `creditBalance`.
- `(scanId,rowIdx,colIdx)` is unique; pin ids are the BullMQ job ids, so re-enqueueing is idempotent.
- `GridScan` terminal states: `COMPLETED` (0 failed), `PARTIAL` (≥1 failed, ≥1 completed), `FAILED` (0 completed).
- Artifact fields store **R2 object keys**, not URLs. The UI builds URLs from `NEXT_PUBLIC_R2_PUBLIC_DOMAIN`, so the bucket domain can change without migrating rows.

---

## 5. Credit economy

| Target type | Credits / pin | 3×3 | 5×5 | 7×7 | 9×9 | 11×11 |
|-------------|---------------|-----|-----|-----|-----|-------|
| `mobile_maps`, `mobile_chrome`, `mobile_google` | 1 | 9 | 25 | 49 | 81 | 121 |

Lifecycle:
1. **Hold** — `POST /api/scans` runs one transaction: conditional decrement `UPDATE "User" SET creditBalance = creditBalance - cost WHERE id = ? AND creditBalance >= cost` (0 rows → HTTP 402), insert ledger `SCAN_HOLD`, insert scan + pins. Then `addBulk`; if enqueueing throws, the same request reverses the hold (`SCAN_CANCEL_REFUND`) and marks the scan `FAILED`.
2. **Per-pin refund** — when a job exhausts its 3 attempts (or throws `UnrecoverableError`), the worker's `failed` handler atomically: pin → `FAILED`, `creditBalance += costPerPin`, `creditsRefunded += costPerPin`, ledger `PIN_REFUND` (guarded by `updateMany … WHERE status <> 'FAILED'` so it can never double-refund).
3. **Grants** — PayPal only (§5.3). One-time packs grant on a `COMPLETED` capture; subscriptions grant on every `PAYMENT.SALE.COMPLETED`. Every grant stores the PayPal capture/sale id as `externalId`, so the return redirect, the webhook, and any redelivery can all fire and the credits land exactly once.
4. **No free credits, ever.** New accounts start at 0 and no ledger row is written; the first ledger row is a purchase. Owner test credits are added by hand as an `ADJUSTMENT` row plus balance increment in one SQL transaction (tutorial Part 14), never through the app.

### 5.3 PayPal billing flow

No PayPal JS SDK; both flows are server-created and redirect-based (works on mobile, no client-side tampering):

| Flow | Start | Buyer returns to | Credits granted by |
|------|-------|------------------|--------------------|
| Credit pack | `POST /api/billing/paypal/order {packId}` → Orders v2 `intent: CAPTURE`, amount from `PAYPAL_PACKS_JSON`, `custom_id = "<userId>:<packId>"` → redirect to the `payer-action` link | `/api/billing/paypal/return?kind=order&token=<orderId>` → capture (with `PayPal-Request-Id` so refreshes replay safely; `ORDER_ALREADY_CAPTURED` falls back to GET) | return route **and** `PAYMENT.CAPTURE.COMPLETED` webhook — whichever is first; key `paypal:capture:<captureId>` |
| Monthly plan | `POST /api/billing/paypal/subscribe {planId}` → Subscriptions v1 with `custom_id = userId` → redirect to `approve` link | `/api/billing/paypal/return?kind=sub&subscription_id=I-…` → stores `paypalSubscriptionId` | `PAYMENT.SALE.COMPLETED` webhook only (each billing cycle); the handler re-fetches the subscription by `billing_agreement_id` to read `custom_id` and `plan_id`; key `paypal:sale:<saleId>` |

Validation before any grant: capture status `COMPLETED` (a `PENDING` capture waits for the webhook), `custom_id` user matches the signed-in user on the return path, pack exists, and captured amount + currency equal the configured price exactly.

Webhook (`/api/webhooks/paypal`) is verified with PayPal's postback endpoint `POST /v1/notifications/verify-webhook-signature`. The raw request body is spliced into the verification request byte-for-byte (never `JSON.parse` → `JSON.stringify`), because PayPal signs the exact bytes it sent. Handler errors return 500 so PayPal retries; grants are idempotent so retries are safe.

Subscribed events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.SALE.COMPLETED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED` (the last three clear `paypalSubscriptionId`; credits already granted are kept).

Catalog lives in env so prices change without code: `PAYPAL_PACKS_JSON` (id, credits, price, label) and `PAYPAL_PLANS_JSON` (planId, credits, display price, label). Create plans in the PayPal dashboard (business account → Subscriptions → create a monthly plan) and copy its `P-…` id; the PayPal plan, not the env, decides what is charged.

Refunds and disputes are manual in v1: refund in the PayPal dashboard, then insert an `ADJUSTMENT` ledger row (negative amount) and decrement `creditBalance` in the same transaction. Automating `PAYMENT.CAPTURE.REFUNDED` / `CUSTOMER.DISPUTE.CREATED` is on the roadmap.

---

### 5.4 Pricing and public pages

**Positioning.** Paid-only and priced above the market. Benchmark: Local Falcon sells pay-as-you-go credits at $0.05 per point and subscription credits from about $0.003 per point, with 100 free credits on sign-up (their pricing pages, Nov 2026). Our marginal cost is roughly $0.01–0.04 per point (5–10 MB of residential traffic at Proxy-Seller's $2.20–3.50/GB) plus phone time (~$22 per DuoPlus phone per month), and capacity is ~30 points per phone per hour. Price is set on the proof (a recorded real-phone search per point), not on server-check parity.

**Default packs** (`PAYPAL_PACKS_JSON`, changeable in Vercel without code):

| Pack | Credits | Price | Per point | 7×7 scans |
|---|---|---|---|---|
| Starter | 250 | $49 | $0.20 | 5 |
| Growth | 1,000 | $149 | $0.15 | 20 |
| Agency | 5,000 | $599 | $0.12 | 102 |

Pack objects take an optional `name` for display. The pricing page computes per-point price, 7×7 count and a grid-size cost table from the env, so prices change in one place.

**Pages** (all public in `middleware.ts`): `/` landing (signed out; signed-in users get the dashboard), `/pricing`, `/terms`, `/privacy`, `/refunds`. Company details come from `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_LEGAL_ADDRESS`, `NEXT_PUBLIC_LEGAL_JURISDICTION` (`lib/site.ts`); the status page fails a "Legal pages" card until name, email and jurisdiction are set. `NEXT_PUBLIC_SAMPLE_REPORT_URL` optionally adds a "real sample report" link to the hero.

**Refund policy** (`/refunds`): no trials; purchases final including unused credits; credits never expire; failed points credited back automatically; money refunded only for duplicate charges, unauthorized payments reported within 30 days, permanent shutdown (unused credit value), or where law requires; contact before disputing; credits from reversed payments removed. Legal texts are drafts for the operator's lawyer to review.

**Landing design.** One bold element: a 7×7 rank grid on survey-paper lines, pins in the app's rank colours, filling in from the centre on load (disabled under `prefers-reduced-motion`), labelled as an example. Display type IBM Plex Sans Condensed 600; body IBM Plex Sans. Sections: hero, one point's proof (phone recording beside four deliverables), real phone vs server-based checks, three-step scan sequence, pay-per-point teaser, FAQ.

---

## 6. Queue contract and distributed primitives (Upstash)

**Connection:** `new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })` — required by BullMQ, and `rediss://` enables TLS automatically.

**Queue `geogrid-pins`:** job name `pin`, `jobId = pinId`, data `{ scanId, pinId, targetType }`, `attempts: 3`, `backoff: { type: 'exponential', delay: 4000 }`, `removeOnComplete: 1000`, `removeOnFail: 5000`. Worker `lockDuration: 180_000` (a mobile pin takes 90–140 s). The name is defined in `apps/web/lib/queue.ts` and `apps/worker/src/config.ts` and must stay identical.

**Device lease** `lock:duoplus:<imageId>` — `SET … NX EX 180`, extended every poll via Lua compare-and-`EXPIRE`, released via Lua compare-and-`DEL`. When no device is free the processor calls `job.moveToDelayed(now + 5000, token)` and throws `DelayedError`, which does **not** consume an attempt.

**Global rate limiter** `rl:duoplus:<endpoint>` — `SET … NX PX 1100`; a caller spins until it wins the slot. This is a true cross-replica 1-request-per-1.1-s gate per endpoint (all Railway replicas share it).

**Concurrency:** set from the DuoPlus discovery (§8): the number of powered-on phones with an active subscription, a bound proxy record and passing checks. Re-evaluated every `DEVICE_REFRESH_MINUTES` (default 5) via BullMQ's runtime `worker.concurrency`; zero phones pauses intake (jobs wait in Redis). `WORKER_CONCURRENCY` overrides it.

---

## 7. Mobile pipeline (DuoPlus + Proxy-Seller)

### 7.1 Device image profile (one-time, DuoPlus dashboard)
Android 12 (ADB support) · Proxy DNS **on** · Network mode Wi-Fi (unified) · Resolution 1080×1920 @ 480 dpi (unified) · Location **Customize** · SIM/timezone/language **based on IP**. One saved proxy record per phone (`DevicePool.proxyId`). The worker never uses ADB, so no IP whitelist is needed for Railway's dynamic egress.

### 7.2 Pre-flight
Runs automatically for every phone on each worker boot (§8). A phone that fails is left out until the next deploy; results are printed to the Railway logs as `[boot] check <id> <name> PASS|WARN|FAIL …`.

### 7.3 Per-pin state machine (worker side, `mobile.ts`)

Proxies are **not** generated per pin. Each phone has one saved DuoPlus proxy record; its Proxy-Seller login is set once per scan area (§7.6) and rotates on its own. A 7×7 scan on 3 phones = 49 pins, 3 proxy setups.

| Step | Action | DuoPlus calls | Time |
|------|--------|---------------|------|
| 0 | Lease phone: enabled, `cooldownUntil <= now`, order by `lastUsedAt`; `SET lock NX EX 180` (none free → `moveToDelayed` 5 s, no attempt burned) | 0 | <1 s |
| P | **Only if the phone's `proxyGeoKey` ≠ this scan's area:** `proxy/update` (rotating login) → `proxy/check` (≤2 per rung) → `cloudPhone/update {proxy, locale}`; store result on `DevicePool` | 3–12 | 5–20 s, once per phone per scan |
| 1 | **Update GPS:** `cloudPhone/update {gps:{type:2,lat,lng}}`; sleep 6 s | 1 | 7 s |
| — | Ensure `run_pin.sh` on phone (md5 cached; normally pushed at boot) | 0 | 0 s |
| — | Presign R2 `PUT` for `dumps.tar.gz` and `video.mp4` | 0 | <1 s |
| 2–7 | Launch `run_pin.sh` backgrounded (§7.4): clear → record → open app → typed search → slow scroll + dump per stop → package + upload | 1 | ~70–100 s on phone |
| — | Sleep 55 s, poll R2 `HeadObject(dumps.tar.gz)` every 5 s (max 120 s). **Zero DuoPlus calls.** Lease extended each poll | 0 | 55–175 s |
| — | Tar missing: `cat status; tail last.log` → retryable error (or pull via command API if the phone has no curl) | 1 | — |
| — | Parse (§9); CAPTCHA → phone cooldown 30 min + retryable error; wait for `video.mp4` ≤60 s (missing = flag) | 0 | 2–60 s |
| — | Build and upload `serp.xml`, `serp.json`, `serp.html`, `meta.json` (§9) | 0 | <1 s |
| — | Pin → `COMPLETED`; release lease; finalize scan if last | 0 | <1 s |

Budget ≈ 2 minutes per pin per phone: a 7×7 on 3 phones ≈ 35 minutes; 11×11 on 3 phones ≈ 80 minutes. Throughput scales linearly with phones.

### 7.4 `device/run_pin.sh` — on-phone steps 2–7

The on-device macro is one backgrounded `/system/bin/sh` script because `cloudPhone/command` enforces a 10-second timeout and 1 QPS. Order (the worker has already done step 1, GPS):

2. **Clear** — `am force-stop` + `pm clear` Maps, Google app and Chrome (cookies, history, app data; never `com.google.android.gms`); re-grant location to the target app.
3. **Record** — `screenrecord --time-limit 45` in the background.
4. **Open** — launch the target app from its launcher activity; tap away first-run screens (dump → find "Accept & continue / Skip / No thanks / Not now / Got it…" → `input tap`).
5. **Search** — dump, tap the app's search box by resource-id (Maps `search_omnibox_text_box`, Google app `googleapp_search_box|search_box`, Chrome `search_box_text|url_bar`) or by hint text, `input text <query with %s for spaces>`, Enter. No box found → deep-link fallback (`geo:lat,lng?q=…&z=15`, `WEB_SEARCH`, or a Google URL). `meta.txt` records `search=typed|deeplink`.
6. **Slow scroll** — wait for results to settle; Maps pulls the results sheet up first; then repeat: dump → swipe a third of the screen over 900 ms → 1.4 s pause, until two consecutive dumps have the same content (bottom reached) or 14 stops.
7. **Package** — `meta.txt`, `flags.txt`, `dump_N.xml` → `<scan>_<pin>.tar.gz`; upload tarball and video with `curl -T` to the presigned URLs.

Recording starts before the app opens, so the video shows the first-run screens, the typed query and the whole scroll. Dumps may continue a few seconds past the 45 s mark on long lists.

Four Toybox-specific bugs found in review are baked in (do not regress):

1. **Single-line XML.** `uiautomator dump` writes the whole hierarchy on one line. Every parse first splits nodes with a POSIX backslash-newline sed (`s/><node/>\<newline><node/g`) and matches with `grep -E` (basic `\|` alternation fails silently on some Toybox builds).
2. **"Search this area" false positive.** The pill exists in the tree (even when not visible) right after a `geo:` launch. The Maps URI always carries `&z=15`, and the drift flag is evaluated only on `dump_[1-9].xml` (after the drawer expand), never on `dump_0.xml`.
3. **No `force-stop` after FRE dismissal.** Force-stopping within ~1 s of tapping *Skip* loses the un-flushed SharedPreferences and the sign-in sheet returns. The app stays open for the typed search (or the fallback `VIEW` intent).
4. **Content hash, not file hash.** The end-of-list detector hashes only `text=`/`content-desc=` attributes with `com.android.systemui` nodes removed, so the status-bar clock and ±2 px over-scroll bounds no longer defeat early-exit.

Additional hardening in v1.1: `DuoPlusDumpUI` → `uiautomator dump` fallback; `tar -czf` → `tar -cf | gzip` fallback; recording completion is enforced by a time floor plus `pidof`/`pgrep`; status file values are `done`, `uploaded`, `upload_failed`, `no_curl`.

Script arguments: `app(maps|google|chrome) lat lng query queryEncoded queryTyped scanId pinId` (`queryTyped` = `[A-Za-z0-9 .,-]` only, spaces as `%s`, built by `typedQuery()`); env `UPLOAD_TAR`, `UPLOAD_VIDEO` (presigned PUT URLs, optional), `REC_SECS` (default 45), `MAX_STOPS` (default 14).

### 7.5 Artifact egress and residential bandwidth
Maps tiles cost 5–10 MB of residential traffic per pin; the 45 s video is ~8 MB more if it rides the proxy. Pre-flight step 3 decides:
- Shell `curl` goes direct → leave `UNBIND_PROXY_BEFORE_UPLOAD=false`; the script uploads both artifacts itself.
- Shell `curl` rides `tun0` → set `UNBIND_PROXY_BEFORE_UPLOAD=true`; the worker leaves `UPLOAD_*` empty, waits for `status=done`, unbinds the proxy (`cloudPhone/update` with `proxy:{id:'',dns:0}`), issues one `curl -T` per artifact, and re-binds the proxy only after the video has landed in R2 (if the pin errors first, `proxyGeoKey` is cleared so the next pin sets the proxy up again).

### 7.6 Proxy-Seller: one rotating proxy per phone

**Model.** Each phone owns one saved DuoPlus proxy record (bound in the dashboard) and one Proxy-Seller port, `10000 + slotIndex`. The worker rewrites that record's login when a phone takes its first pin of a scan whose area (`zip|city|state|isp|rotation`) differs from the phone's current `proxyGeoKey`. Within a scan the proxy is never touched again: Proxy-Seller rotates the exit IP itself. A grid of N pins on D phones → D proxy setups, not N.

**Rotation** (`PROXY_ROTATION`):
- `request` (default) — no session suffix: Proxy-Seller assigns a new exit IP on every request, all inside the targeted area.
- `sticky` — suffix `_s_<phoneTag>_ttl_<PROXY_STICKY_MINUTES>m`: one IP per phone that expires and rotates on its own after N minutes (default 2 ≈ one pin), with no API call.

Trade-off, decided by the operator: `request` maximises IP spread, but one search session can leave from several IPs and the stored IP is a sample taken at setup, not the exact IP Google saw. `sticky` keeps one IP for most of a pin. Both keep every exit inside the targeted city/ISP.

**Ladder** (tried once per setup, each rung checked up to twice; per the vendor docs: order country → city/subdivision → ISP/ZIP → session → TTL; case-sensitive; `_zip_` needs `_c_`; city spaces → `-`; `_sd_` takes a numeric subdivision id; session ids alphanumeric; `_ttl_` must follow `_s_`; login targeting needs the "API Tool" list):

| Rung | Login (`<rot>` = empty or `_s_…_ttl_Nm`) |
|------|-------|
| 1 ZIP+ISP | `<base>_c_US_zip_<ZIP>_isp_<ISP_ID><rot>` |
| 2 City+ISP | `<base>_c_US_city_<City-Name>_isp_<ISP_ID><rot>` |
| 3 City | `<base>_c_US_city_<City-Name><rot>` |
| 4 State (only if an id is configured) | `<base>_c_US_sd_<SUBDIVISION_ID><rot>` from `PROXY_SELLER_SD_IDS_JSON` |

The winning rung, login and `proxy/check` sample are stored on `DevicePool` and copied into each pin's `proxyMeta` (`{rotation, rung, configuredAt, sample}`); the UI labels the IP "sample IP".

Geo match policy (`PROXY_GEO_MATCH`): `state` (default — region/state must match), `city`, or `none`. `proxy/check` field names are normalised defensively (`ip|proxyIp`, `region|province|state`, `timezone|timeZone`).

---

## 8. Worker boot and phone discovery (replaces all local scripts)

The Railway start command is `pnpm --filter @geogrid/worker boot`, which runs:

1. **`prisma db push --skip-generate`** against `DIRECT_URL` — creates or updates tables; a no-op when in sync. A schema change that would drop data fails the boot instead of deleting anything.
2. **Env check** — missing DuoPlus / Proxy-Seller / R2 variables stop the boot with `Missing env: …`.
3. **Discovery: one `cloudPhone/list` call** (`link_status:["1"], adb_status:["1"]`) → every powered-on phone. Kept: phones in `DUOPLUS_GROUP_NAME` (if the list reports groups), with an active subscription (any expiry field in the past = expired; no expiry field = active), and with a saved proxy record (bound proxy id read from the row, or the `DEVICE_PROXY_IDS_JSON` override). Each skipped phone is logged with its reason. Slots are assigned by sorted phone id, so ports stay stable. `DevicePool` is rewritten to match; a phone whose proxy record or slot changed has its proxy state cleared.
4. **Preflight** for each phone not yet checked in this process (`PREFLIGHT_ON_BOOT`, default on), five `cloudPhone/command` calls, each < 10 s:
    - `build` — Android version and `ro.debuggable`.
    - `screen dump` — `DuoPlusDumpUI` or the `uiautomator dump` fallback must work.
    - `tools` — `screenrecord tar gzip md5sum pidof nohup monkey sed grep base64 curl`; only `curl` may be missing.
    - `upload route` — `curl ipinfo.io/json` from the phone: a home-ISP `org` → the log says set `UNBIND_PROXY_BEFORE_UPLOAD="true"` (§7.5).
    - `animations off`.
5. **Script push** — `run_pin.sh` pushed (md5-checked) once per phone.
6. **Concurrency** — logs `DuoPlus: P phone(s) powered on, U usable (active subscription + proxy record), R ready → concurrency R`, then `worker ready concurrency=R phones=R`. R = 0 pauses the worker; scans wait in Redis.
7. **Refresh** — steps 3–6 repeat every `DEVICE_REFRESH_MINUTES` (default 5): phones switched on or renewed join automatically, failed phones are re-checked, concurrency follows.

---

---

## 9. Parsing and metrics (`parse.ts`, `metrics.ts`)

- XML is parsed with `fast-xml-parser` in `preserveOrder` mode and walked depth-first, which is the on-screen reading order.
- Business titles are detected two ways, union-ed in order: (A) `content-desc` of the form `"<Name> <rating> stars …"`; (B) a `text` node followed within three strings by a rating (`4.8`) or review count (`(312)`) token. Known chrome strings ("Directions", "Website", "Search this area", "Sponsored", …) are excluded. Titles immediately preceded by `Sponsored`/`Ad` are kept but marked `sponsored` and skipped for rank.
- For each title, the following strings up to the next title fill `rating`, `reviews` and up to 4 `details` (category, address, hours, phone); content-desc titles are split on commas for the same fields.
- Dedupe is by normalised name across all dumps (first appearance wins); organic capped at 20, sponsored at 5.
- **SERP outputs (step 7)** — `serp.xml`: every `dump_N.xml` wrapped in `<stop index=…>` inside one `<serp keyword=… lat=… lng=… captured=…>` document, i.e. the entire results list in scroll order; `serp.json`: `{scan, pin, coords, keyword, surface, exit, rank, flags, listings:[{position|null, name, sponsored, rating, reviews, details, isTarget}]}`; `serp.html`: self-contained light/dark recreation of the list (target highlighted, ads marked) for reports and sharing. All three sit next to the video in R2 and are linked from the pin drawer.
- Target match: normalised equality, containment (≥4 chars), or token-Jaccard ≥ 0.75. `targetBusiness` may contain `|`-separated aliases.
- Flags recorded on the pin: `captcha`, `map_drift` (from `flags.txt`), `video_missing`, `parser_low_confidence` (<3 titles found), `stops=<n>`.
- Metrics over **completed** pins: `ARP = mean(rank | found)`, `ATRP = mean(rank ?? 21)`, `SoLV = 100 × count(rank ≤ 3) / completed`. Computed once, by whichever worker observes `completedPins + failedPins === totalPins` from its own atomic increment.

UI colour convention (fixed): 1–3 green, 4–10 amber, 11–20 red, not found grey, pending hollow, failed crossed.

---

## 10. Environment variables

### 10.1 Vercel (`apps/web`)
```ini
DATABASE_URL="postgresql://…-pooler.…neon.tech/neondb?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://…neon.tech/neondb?sslmode=require"
REDIS_URL="rediss://default:…@….upstash.io:6379"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_…"
CLERK_SECRET_KEY="sk_…"
PAYPAL_ENV="sandbox"              # sandbox | live
PAYPAL_CLIENT_ID="…"
PAYPAL_CLIENT_SECRET="…"
PAYPAL_WEBHOOK_ID="…"
PAYPAL_CURRENCY="USD"
PAYPAL_PACKS_JSON='[{"id":"starter","name":"Starter","credits":250,"price":"49.00","label":"250 credits"},{"id":"growth","name":"Growth","credits":1000,"price":"149.00","label":"1,000 credits"},{"id":"agency","name":"Agency","credits":5000,"price":"599.00","label":"5,000 credits"}]'
PAYPAL_PLANS_JSON='[{"planId":"P-…","credits":1000,"price":"199.00","label":"Pro · 1,000 credits a month"}]'
NEXT_PUBLIC_APP_URL="https://app.yourdomain.com"
NEXT_PUBLIC_R2_PUBLIC_DOMAIN="https://pub-xyz.r2.dev"
NEXT_PUBLIC_MAP_STYLE_URL=""   # optional MapTiler/Stadia style; OSM raster fallback
HEALTH_TOKEN="…"                # /status and /api/health (§12a)
NEXT_PUBLIC_SITE_NAME="GeoGrid Engine"
NEXT_PUBLIC_LEGAL_NAME="…"  NEXT_PUBLIC_SUPPORT_EMAIL="…"  NEXT_PUBLIC_LEGAL_JURISDICTION="the State of …, USA"
NEXT_PUBLIC_LEGAL_ADDRESS=""  NEXT_PUBLIC_SAMPLE_REPORT_URL=""
```

### 10.2 Railway (`apps/worker`)
```ini
DATABASE_URL=…  DIRECT_URL=…  REDIS_URL=…
WORKER_CONCURRENCY=""           # blank = phones found by discovery (§8)
PREFLIGHT_ON_BOOT="true"
DEVICE_REFRESH_MINUTES="5"
DUOPLUS_API_KEY="…"
DUOPLUS_BASE_URL="https://openapi.duoplus.net"
DUOPLUS_GROUP_NAME="Stakeout Workers Basic"   # blank = every powered-on phone
DEVICE_PROXY_IDS_JSON='{}'                    # only if the list doesn't report bound proxies
PROXY_SELLER_BASE_LOGIN="…"  PROXY_SELLER_PASSWORD="…"  PROXY_SELLER_HOST="us.res.proxy-seller.com"
PROXY_ROTATION="request"                      # request | sticky
PROXY_STICKY_MINUTES="2"
PROXY_GEO_MATCH="state"
PROXY_SELLER_SD_IDS_JSON='{}'
UNBIND_PROXY_BEFORE_UPLOAD="false"
R2_ACCOUNT_ID=…  R2_ACCESS_KEY_ID=…  R2_SECRET_ACCESS_KEY=…  R2_BUCKET_NAME="geogrid-artifacts"
```

---

## 11. Deployment

**Vercel** — import repo, Root Directory `apps/web`, framework Next.js. Build runs `pnpm --filter @geogrid/db generate && next build` (Prisma client is generated against the schema in `packages/db`). Add §10.1 env. PayPal Developer → Apps & Credentials → your app → Webhooks → add `https://<app>/api/webhooks/paypal` with the §5.3 events, copy its id into `PAYPAL_WEBHOOK_ID`. Sandbox and live apps have separate credentials and separate webhooks; switch all four PayPal values together when going live.

**Railway** — new service from the repo, builder Dockerfile (`railway.json` points at `apps/worker/Dockerfile`, start command `pnpm --filter @geogrid/worker boot`), env §10.2. Deploy Railway before Vercel: its boot creates the tables. Scale replicas freely: leases and the limiter are in Redis.

**Database changes** — applied by the worker's boot (`prisma db push`); switch to `prisma migrate deploy` once the schema stabilises. Inspect data in Neon's Tables view or SQL Editor.

---

## 12. Failure matrix

| Symptom | Detection | Response |
|---------|-----------|----------|
| No free device | lease `SET NX` fails for all | `moveToDelayed(5 s)` + `DelayedError` (no attempt burned) |
| Proxy geo mismatch | `proxy/check` region/city ≠ target | re-roll session ×3, then next rung; all rungs fail → retryable error |
| DuoPlus `code ≠ 200` / HTTP 429 | client | retryable error; limiter already spaces calls 1.1 s |
| Device offline mid-run | `cloudPhone/command` error | release lease, retryable error |
| CAPTCHA | dump text | phone cooldown 30 min, retryable error (rotating proxy → different IP next try) |
| `dumps.tar.gz` never lands | R2 HEAD misses for 90 s | read `status`/`last.log`, retryable error |
| `curl` missing on image | status `no_curl` | pull tar via base64 chunks over command API; video flagged missing |
| `video.mp4` missing | R2 HEAD misses for 60 s | pin still completes; flag `video_missing` |
| 3 attempts exhausted | BullMQ `failed` event | refund 1 pin's credits, pin `FAILED`, scan may end `PARTIAL` |
| Enqueue fails after hold | `addBulk` throws | reverse hold, scan `FAILED`, HTTP 500 |
| Phone skipped at discovery | `[boot] skipped <id>: …` | expired subscription → renew; no proxy record → bind one in DuoPlus or set `DEVICE_PROXY_IDS_JSON` |
| No usable phones | `worker paused: no phones ready` | worker idles; the 5-minute refresh resumes it automatically |
| Proxy setup fails for a scan area | `proxy ladder exhausted` on a phone's first pin of the scan | retryable; check ISP id / city spelling; `PROXY_GEO_MATCH=none` to diagnose |
| Phone fails a boot check | `[boot] check … FAIL` | phone left out until next deploy; other phones keep working |
| Schema change would drop data | `prisma db push` fails at boot | deploy fails, nothing deleted; migrate deliberately |
| Duplicate PayPal webhook / return + webhook race | `externalId` unique violation | ignore (200) — credits granted once |
| Buyer closes tab after paying | no return request | `PAYMENT.CAPTURE.COMPLETED` webhook grants the pack |
| Capture `PENDING` (eCheck / review) | capture status | user sees "pending"; webhook grants when it completes |
| Webhook signature invalid | verify returns ≠ `SUCCESS` | 400, nothing granted |

---

## 12a. Status page and worker heartbeat

One page tests every platform: `/status?token=<HEALTH_TOKEN>` (human) and `/api/health?token=<HEALTH_TOKEN>` (JSON, HTTP 503 when anything fails). Both 404 without a token of ≥12 characters matching `HEALTH_TOKEN` (constant-time compare); Clerk middleware lets them through so they work signed out.

The worker writes `geogrid:health:worker` to Redis every 30 s (expires 120 s): version (`RAILWAY_GIT_COMMIT_SHA`), boot time, concurrency, paused, latest discovery (powered on / usable / ready / skipped reasons / per-phone check problems), last proxy setup result, pin counters and last error, and its R2 write test (it uploads `health/worker.json` on boot).

| Card (in dependency order) | Test |
|---|---|
| Vercel settings | required env present and not a template value; request host vs `NEXT_PUBLIC_APP_URL` |
| Legal pages | `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_LEGAL_JURISDICTION` set |
| Neon database | `SELECT 1` + counts; missing tables → "deploy Railway first" |
| Upstash Redis queue | `PING` + BullMQ job counts; reads the heartbeat |
| Railway worker | heartbeat age < 90 s; paused; pin counters; last error |
| GitHub deploys | `VERCEL_GIT_COMMIT_SHA` vs heartbeat version |
| DuoPlus phones | heartbeat discovery + per-phone problems |
| Proxy-Seller | heartbeat last proxy setup (grey until the first scan) |
| Cloudflare R2 | worker write result + public fetch of `health/worker.json` |
| Clerk sign-in | `users.getCount()` with the secret key; test/live key mix |
| PayPal payments | OAuth with the configured mode; webhook exists, URL = `NEXT_PUBLIC_APP_URL/api/webhooks/paypal`, required events ticked; pack count |
| Scans (last 24 h) | completed vs failed pins, top 3 failure messages |

Each check has an 8 s timeout and a "Fix:" line naming the setting to change.

## 13. Acceptance tests (run before calling v1 done)

1. **Ledger invariant** — after any sequence of scans/refunds/grants, `SUM(CreditLedger.amount) = User.creditBalance` for every user.
2. **3×3 mobile_maps** — 9 pins `COMPLETED`, each with a playable `video.mp4`, `dumps.tar.gz` with ≥1 dump, `serp.xml`/`serp.json`/`serp.html` that open and list the same businesses as the video, `proxyMeta.sample` present, metrics populated; `meta.txt` shows `search=typed` on most pins.
3. **Forced failure** — set a bogus `PROXY_SELLER_PASSWORD` for one scan: all pins fail after 3 attempts, full refund, scan `FAILED`.
4. **Replica safety** — run two worker replicas against 1 device: no two pins ever hold the same lease (check `assignedDeviceId` timestamps don't overlap).
5. **Rate limit** — DuoPlus never returns a rate-limit error across a 5×5 run with 2 replicas.
6. **Drift flag** — a pin whose `dump_1+.xml` contains "Search this area" is flagged `map_drift`; a pin whose `dump_0.xml` alone contains it is not.
7. **PayPal sandbox** — buy a pack with a sandbox buyer: credits land once even after refreshing the return page; replay the webhook from the dashboard: no second grant; a subscription's first `PAYMENT.SALE.COMPLETED` adds the plan's credits.
8. **Proxy setups per scan** — a 7×7 on 3 phones logs exactly 3 `rotating proxy set` lines (one per phone), not 49.
9. **Paid-only** — a brand-new account shows 0 credits, no ledger rows, and a disabled Start scan; `/`, `/pricing`, `/terms`, `/privacy`, `/refunds` load signed out; the status page "Legal pages" card is green.

---

## 14. Vendor contract assumptions (verify on the first real pin)

The code isolates every vendor-specific shape so a mismatch is a one-line fix:

| Assumption | Where | If wrong |
|------------|-------|----------|
| DuoPlus `cloudPhone/command` body is `{ image_ids: [...], command }` and `data` carries stdout | `duoplus.ts` `command()` / `normalizeOutput()` | rename the field; the output normaliser already tolerates string / object / array shapes |
| `proxy/update` fields `id, host, port, user, password, protocol, ip_scan_channel` | `duoplus.ts` `updateProxy()` | rename fields |
| `proxy/check` returns ip / country / region / city / timezone (names vary) | `duoplus.ts` `checkProxy()` `pick()` lists | add the real key to the candidate list |
| `cloudPhone/update` accepts `proxy{id,dns}` + `gps{type:2}` + `locale{type:2}` in one `images[]` payload | `duoplus.ts` `updatePhones()` | split into two calls |
| Proxy-Seller suffix grammar `_c_US_zip_…_isp_…_s_…_ttl_10m` on port `10000+slot` | `proxySeller.ts` `buildLadder()` | edit one template string |
| `DuoPlusDumpUI` may be absent in a backgrounded shell | `run_pin.sh` `dump()` | nothing — falls back to `uiautomator dump` |
| Image ships `curl`; `tar -z` works | pre-flight #4 | worker pulls the tarball via command API; script falls back to `tar | gzip` |
| `cloudPhone/list` rows carry the bound proxy as `proxy_id` / `proxy.id`, an expiry field, and a group name | `devices.ts` `boundProxyId()`, `subscriptionActive()`, `inGroup()` | add the real key; `DEVICE_PROXY_IDS_JSON` covers a missing proxy field; no expiry field counts as active |
| Search boxes keep their resource-ids (`search_omnibox_text_box`, `googleapp_search_box`, `search_box_text`/`url_bar`) | `run_pin.sh` step 5 | hint-text match, then deep-link fallback (`search=deeplink` in `meta.txt`) |
| Proxy-Seller rotates per request when the login has no `_s_` session | `proxySeller.ts` `rotationSuffix()` | set `PROXY_ROTATION=sticky` |
| PayPal order approval link is `rel: payer-action` (with `payment_source.paypal.experience_context`) or `approve` | `lib/paypal.ts` `approveLink()` | both rels already accepted |
| Capture resource carries `custom_id` | `paypalGrants.ts` | return route already falls back to the purchase unit's `custom_id` |

## 15. Roadmap after today
Automated PayPal refund/dispute clawback · in-app subscription cancel · scheduled re-scans (BullMQ repeatable jobs) · competitor trend table · per-pin reverse-geocoded ZIP (rung 1 precision for edge pins) · public share links for proof pages · team workspaces · webhook/API access for agencies.
