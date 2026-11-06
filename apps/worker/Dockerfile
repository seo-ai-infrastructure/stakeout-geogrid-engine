# Railway build context is the repo root (see railway.json)
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN pnpm install --filter @geogrid/worker... --frozen-lockfile
COPY packages/db packages/db
COPY apps/worker apps/worker
RUN pnpm --filter @geogrid/db generate
ENV NODE_ENV=production
# boot = prisma db push (idempotent) + worker; railway.json uses the same command
CMD ["pnpm", "--filter", "@geogrid/worker", "boot"]
