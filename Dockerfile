# Cloud Run image for ModelHub. Built remotely by Cloud Build via
#   gcloud run deploy --source .
# so no local Docker daemon is needed. See docs/DEPLOY-FIREBASE.md.

# ---------------------------------------------------------------- dependencies
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm install`, not `npm ci`, on purpose. package-lock.json was generated on
# Windows, where npm prunes the optional dependencies of sharp's non-native
# variants — so the lock has no @emnapi/runtime, and `npm ci` refuses to run on
# Linux with "package.json and package-lock.json are not in sync". npm cannot
# express one lock that satisfies both platforms here, so the image resolves
# them itself. Everything the lock *does* pin is still honoured.
# Dev dependencies are needed: the build runs tsc and the Next compiler.
RUN npm install --no-audit --no-fund

# ---------------------------------------------------------------- build
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# lib/db.ts throws at import when DATABASE_URL is unset, and `next build`
# imports it while collecting page data. The Neon driver only opens a
# connection on the first query, so a placeholder is enough to build with —
# no real credential ever enters the image, and every route is dynamic so
# nothing queries the database at build time.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run routes traffic to $PORT and the listener must bind 0.0.0.0,
# not localhost, or the health check never passes.
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# standalone/ carries its own pruned node_modules; public/ and .next/static
# are not copied into it by Next, so they come across explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
