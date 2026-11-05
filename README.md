# GeoGrid Engine

Real-device local rank grids with 45-second video proof per pin, run on DuoPlus cloud phones.
Fully hosted: Vercel (website) + Railway (worker) + Neon + Upstash + Cloudflare R2 + PayPal.
Nothing runs on a local machine. Architecture and contracts: [`spec.md`](./spec.md).

## Deploy (browser only)

| Piece | Where | How |
|-------|-------|-----|
| `apps/worker` | Railway | Deploy from GitHub; `railway.json` builds `apps/worker/Dockerfile`. Paste the variables from `apps/worker/.env.example` (filled in). On boot it creates the database tables, discovers your powered-on DuoPlus phones (one API call; concurrency = usable phones), checks each phone, and starts. Every 5 minutes it re-reads the phone list. Deploy this first. |
| `apps/web` | Vercel | Root directory `apps/web`; variables from `apps/web/.env.example`; PayPal webhook → `/api/webhooks/paypal`. |

Read the Railway deploy logs: every `[boot]` line reports a setup step (tables, phones, checks).

After deploying, open `/status?token=<HEALTH_TOKEN>` on the site: one card per platform, green/amber/red, each with the fix.

## Layout

- `packages/db` — Prisma schema + client singleton (`@geogrid/db`)
- `apps/web` — Next.js 15 UI, scan API, PayPal billing (packs + monthly plans)
- `apps/worker` — BullMQ worker, boot tasks, DuoPlus / Proxy-Seller / R2 clients, on-device `run_pin.sh`
