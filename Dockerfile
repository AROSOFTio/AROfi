# syntax=docker/dockerfile:1
# Build stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ openssl libc6-compat

# Copy root configurations and lockfiles
COPY package*.json ./
COPY turbo.json ./

# Copy all package.json files for dependency bootstrapping
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
COPY apps/portal-web/package.json ./apps/portal-web/package.json
COPY packages/config-typescript/package.json ./packages/config-typescript/package.json


# Install dependencies in development mode to ensure compilers are available.
# --no-audit/--no-fund skip registry round-trips that add ~15s; --prefer-offline
# reuses the mounted npm cache so warm builds barely touch the network.
RUN --mount=type=cache,target=/root/.npm \
    NODE_ENV=development npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Build apps sequentially so heap is fully released between each build.
# NODE_OPTIONS is exported so child workers (webpack, SWC) inherit the cap.
# Suppress interactive telemetry prompts in CI.
ENV TURBO_TELEMETRY_DISABLED=1
ENV NEXT_TELEMETRY_DISABLED=1

ENV GENERATE_SOURCEMAP=false

# Build portal-web first (smaller app). The .next/cache BuildKit cache mount
# persists Next.js's compilation cache across deploys, so unchanged code is not
# recompiled — this is the single biggest repeat-build speedup. It's a cache
# mount (not an image layer), so the rm -rf of .next/cache below still applies.
RUN --mount=type=cache,target=/usr/src/app/apps/portal-web/.next/cache \
    export NODE_OPTIONS='--max-old-space-size=1024' && \
    export NEXT_CPU_LIMIT=1 && \
    npm run build --workspace=arofi-portal

# Build admin-web second (largest app — own dedicated step for memory isolation)
RUN --mount=type=cache,target=/usr/src/app/apps/admin-web/.next/cache \
    export NODE_OPTIONS='--max-old-space-size=2048' && \
    export NEXT_CPU_LIMIT=1 && \
    npm run build --workspace=arofi-admin

# Build API last
RUN export NODE_OPTIONS='--max-old-space-size=2048' && \
    npm run build --workspace=arofi-api

# Prune development dependencies to make production node_modules as small as
# possible. --no-audit/--no-fund drop the registry audit that made this step
# take ~90s; the prune itself is local and fast.
RUN npm prune --omit=dev --legacy-peer-deps --no-audit --no-fund

# Remove build caches, source files, and dev tooling — only keep runtime artifacts.
# This shrinks what the builder exposes so the selective COPY below is fast.
RUN rm -rf \
    apps/admin-web/.next/cache \
    apps/portal-web/.next/cache \
    apps/admin-web/src \
    apps/portal-web/src \
    apps/api/src \
    packages \
    .turbo .git .github docs

# Runtime stage — copy only what is needed to RUN the app, not build it.
# Previously we did "COPY --from=builder /usr/src/app ./" which copied the entire
# 3-5 GB builder workspace (source files + dev node_modules residue) to the
# runtime layer, exhausting disk space on the VPS. Selective COPY copies only
# the ~1 GB of production artifacts and avoids the OOM/disk-full crash.
FROM node:20-alpine AS runtime
WORKDIR /usr/src/app
RUN apk add --no-cache openssl libc6-compat freeradius-utils nginx
RUN addgroup -g 1001 -S nodejs && adduser -S arofi -u 1001 -G nodejs

# Hoisted production node_modules (shared by all three apps)
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

# NestJS API
COPY --from=builder --chown=arofi:nodejs /usr/src/app/apps/api/dist ./apps/api/dist
COPY --from=builder /usr/src/app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /usr/src/app/apps/api/prisma ./apps/api/prisma

# Admin web (Next.js)
COPY --from=builder --chown=arofi:nodejs /usr/src/app/apps/admin-web/.next ./apps/admin-web/.next
COPY --from=builder /usr/src/app/apps/admin-web/public ./apps/admin-web/public
COPY --from=builder /usr/src/app/apps/admin-web/package.json ./apps/admin-web/package.json
COPY --from=builder /usr/src/app/apps/admin-web/next.config.js ./apps/admin-web/next.config.js

# Portal web (Next.js)
COPY --from=builder --chown=arofi:nodejs /usr/src/app/apps/portal-web/.next ./apps/portal-web/.next
COPY --from=builder /usr/src/app/apps/portal-web/public ./apps/portal-web/public
COPY --from=builder /usr/src/app/apps/portal-web/package.json ./apps/portal-web/package.json
COPY --from=builder /usr/src/app/apps/portal-web/next.config.js ./apps/portal-web/next.config.js

# nginx config and startup scripts
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/scripts ./scripts

RUN cp config/nginx.coolify.conf /etc/nginx/nginx.conf \
    && mkdir -p /run/nginx \
    && chmod +x scripts/start-all.sh

EXPOSE 3000
# Remote WinBox proxy ports — one port per registered router (31000–31099).
# In Coolify: add "31000-31099:31000-31099" in the service port-mappings UI
# so that WinBox clients can reach arofi.net:310XX directly.
EXPOSE 31000-31099
# Default service to run. "all" = nginx + api + admin-web + portal-web in one
# container (single domain). Set SERVICE_NAME=api|admin|portal to run just one.
ENV SERVICE_NAME=all
# Non-secret local default. Production still must provide DATABASE_URL.
ENV DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/arofi_dev?schema=public}

# Start appropriate service based on SERVICE_NAME environment variable
CMD if [ "$SERVICE_NAME" = "all" ]; then \
      sh scripts/start-all.sh; \
    elif [ "$SERVICE_NAME" = "api" ]; then \
      cd apps/api && \
      if [ -n "$DATABASE_URL" ]; then npx prisma migrate deploy || true; fi && \
      (if [ -f dist/main.js ]; then node dist/main.js; else node dist/src/main.js; fi); \
    elif [ "$SERVICE_NAME" = "admin" ]; then \
      cd apps/admin-web && npm run start; \
    elif [ "$SERVICE_NAME" = "portal" ]; then \
      cd apps/portal-web && npm run start; \
    elif [ "$SERVICE_NAME" = "nginx" ]; then \
      cp config/nginx.split.conf /etc/nginx/nginx.conf && \
      exec nginx -g 'daemon off;'; \
    else \
      echo "Please configure SERVICE_NAME to 'all', 'api', 'admin', 'portal', or 'nginx'"; exit 1; \
    fi
