# Stakeout setup acceptance — 6 November 2026

Production intake remains paused (`PLATFORM_ENABLED=false`). These internal operator scans were seeded transactionally with explicit test-credit ledger entries and processed by the normal outbox/queue/worker. They do not establish a buyer checkout-to-grid flow.

## Infrastructure and code

- Correct GitHub repository: seo-ai-infrastructure/stakeout-geogrid-engine. Vercel: stakeoutsearch/stakeout-search-sass-boilerplate. Railway project: 68535eba-e2c2-4c6d-b9db-90377cfba193.
- Private Railway Redis, Neon production branch, private R2 and email-link sign-in were verified. Provider health is separate from measurement acceptance.
- Pilot discovery and device leasing are restricted to DUOPLUS_IMAGE_IDS=UXsp5, concurrency 1. Other powered-on phones are excluded.
- Latest worker deployment f6ca1d50-80bd-4a56-87ea-b6e56db82692 succeeded on source 71b9ea8 after the queue emptied.
- Capture source 534e17c passed quality workflow 42279213433. Video-recovery source 71b9ea8 passed workflow 42280649889, including type checks, regressions and the web build.
- Fixes include current Maps rating labels and digit-prefixed names, grouped-ad exclusion, requested-app validation, complete archive checks, standard Google UI dumping, cold-start onboarding, and a 150-second video wait.
- Command-API video recovery verifies byte count and checksum, retains the phone lease and flags recovered receipts. This new branch has unit/type/build validation; the accepted Google run below used direct upload.
- Railway teardown is configured for a 600-second drain and zero overlap. Avoid manual phone commands while a worker holds the device lease.

## Observed results

| Scan | Result | Evidence and limit |
| --- | --- | --- |
| acceptance-uxsp5-20261106-1025 | Maps completed, attempt 1 | Starbucks seventh among nine organic listings. Six artifacts downloaded; MP4 decoded; owner video range request returned 206. |
| acceptance-uxsp5-20261106-1035-chrome | Chrome completed on retry | Compassion Coffeehouse first among captured cards, including AI Overview content. This is not a separately validated Local Pack rank. |
| acceptance-uxsp5-20261106-1057-google | Failed and refunded | Video showed businesses, but provider XML omitted them. Failure described extraction, not absence from Google. |
| acceptance-uxsp5-20261106-1905-chrome | Failed and refunded | First-run screen in saved XML; a separate retry received a duplicate-operation error. A restart caused four starts across three queue failure attempts. |
| acceptance-uxsp5-20261106-1905-google | Failed and refunded | Standard dumping returned readable business listings, but required MP4 upload timed out. |
| acceptance-uxsp5-20261106-1925-chrome | Failed after 3 attempts; refunded once | First recording and XML showed Uzbekistan and an Uzbek UI despite the intended Mount Juliet point and provider check. No rank accepted. |
| acceptance-uxsp5-20261106-1925-google | Completed on attempt 2, 19:36:32 UTC | Compassion Coffeehouse first among three organic listings; sponsored Scooter’s excluded. Six artifacts downloaded; 1,908,228-byte, 45.014-second MP4 decoded without errors. At 35 seconds Google shows Mt. Juliet, TN 37122; at 43 seconds the target follows the sponsored card. |

The earlier 1048-google test reached another discovered phone before the allowlist fix; it is not UXsp5 acceptance. It failed and refunded. Historical 1048-chrome packaging failure also refunded once.

At 19:38 UTC, administrator balance and ledger sum both equal 1 internal test credit, with zero pending/in-progress pins. Failed pins refunded once; the successful latest Google pin consumed its one-credit hold.

## Authentication, storage and billing

Email sign-in delivery was reported by Resend, and confirmation/session passed; human inbox placement was not inspected. Owner downloads passed, anonymous evidence access was rejected, and an unrelated authenticated artifact request returned 404. R2 remains private with canonical-origin CORS.

Clerk’s public key is staged but integration is inactive. Its dashboard sign-in retry was canceled; existing email-link authentication remains active. A public verification key is not application credentials or a completed Clerk migration.

Automatic approval review rejected a live PayPal order test because it could initiate checkout. No live order retry, buyer payment or capture was performed. Four credit packs are configured; monthly plans and buyer-approved payment acceptance remain unfinished.

## Remaining launch gates

- Resolve the observed Chrome geography mismatch with actual browser/network/location evidence. A provider proxy check is insufficient. Dynamic Proxy-Seller credentials still fail; arbitrary-city service is not accepted.
- Establish repeated captures and a full customer grid flow. Separate AIO from Local Pack observations; current matching uses business names/aliases rather than stored Place ID.
- Complete the chosen authentication setup, actual legal entity/jurisdiction, isolated database integration checks and buyer-approved payment testing.
- Preserve exact evidence scope: a 45-second recording begins before app launch, so later dumps may outlast it.

Main also includes the independent demographic sales-demo commit 761bd1d. Vercel deployment dpl_CRDn5imFbVjtoHabwArwz2s8QoNB was READY; that concurrent work was preserved.
