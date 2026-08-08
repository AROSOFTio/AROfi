# syntax=docker/dockerfile:1

# Shared dependency/source stage. Every final image is separate, but BuildKit can
# reuse this stage so the monorepo dependencies and guarded source patches are
# not downloaded/applied four times.
FROM node:20-alpine AS dependencies
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ openssl libc6-compat

COPY package*.json ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
COPY apps/portal-web/package.json ./apps/portal-web/package.json
COPY packages/config-typescript/package.json ./packages/config-typescript/package.json

RUN --mount=type=cache,target=/root/.npm \
    NODE_ENV=development npm_config_jobs=1 npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline

FROM dependencies AS patched-source
COPY . .
RUN chmod +x scripts/run_with_heartbeat.sh

# Apply every guarded production patch once before any application is compiled.
# The last two commands reject the build if the proven instant captive flow or
# the permanent no-automatic-MAC-auth policy has been weakened.
RUN python3 scripts/apply_iotec_source_patches.py \
    && python3 scripts/apply_unified_gateway_patches.py \
    && python3 scripts/apply_gateway_webhook_patches.py \
    && python3 scripts/hide_pesapal_gateway.py \
    && python3 scripts/apply_live_gateway_activation.py \
    && python3 scripts/preserve_yo_uganda_gateway.py \
    && python3 scripts/apply_voucher_preview_patches.py \
    && python3 scripts/apply_voucher_dashboard_patches.py \
    && python3 scripts/finalize_voucher_dashboard.py \
    && python3 scripts/fix_lucide_icon_compat.py \
    && python3 scripts/apply_public_content_patches.py \
    && python3 scripts/apply_portal_tv_package_patches_v2.py \
    && python3 scripts/apply_router_compensation_review.py \
    && python3 scripts/apply_router_compensation_ui.py \
    && python3 scripts/fix_support_ticket_workspace.py \
    && python3 scripts/apply_router_wan_port_support.py \
    && python3 scripts/sanitize_mikrotik_command_output.py \
    && python3 scripts/apply_mikrotik_background_install.py \
    && python3 scripts/fix_router_presence_and_access_lifecycle.py \
    && python3 scripts/stabilize_router_status_hysteresis.py \
    && python3 scripts/enforce_no_idle_bundle_logout.py \
    && python3 scripts/fix_iotec_live_gateway_diagnostics.py \
    && python3 scripts/fix_iotec_oauth_compatibility.py \
    && python3 scripts/finalize_gateway_compile.py \
    && python3 scripts/forbid_mikrotik_auto_mac_auth.py

RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

ENV TURBO_TELEMETRY_DISABLED=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV GENERATE_SOURCEMAP=false
ENV UV_THREADPOOL_SIZE=1

# -----------------------------------------------------------------------------
# Admin image build — compiles only the Admin application.
# -----------------------------------------------------------------------------
FROM patched-source AS admin-builder
RUN --mount=type=cache,target=/usr/src/app/apps/admin-web/.next/cache \
    export NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=8' && \
    export NEXT_CPU_LIMIT=1 && \
    export CI=1 && \
    sh scripts/run_with_heartbeat.sh "AROFi Admin build" npm run build --workspace=arofi-admin

RUN set -eux; \
    mkdir -p /runtime/admin; \
    cp -a apps/admin-web/.next/standalone/. /runtime/admin/; \
    admin_server="$(find /runtime/admin -type f -path '*/apps/admin-web/server.js' -print -quit)"; \
    if [ -z "$admin_server" ] && [ -f /runtime/admin/server.js ]; then admin_server=/runtime/admin/server.js; fi; \
    test -f "$admin_server"; \
    admin_dir="$(dirname "$admin_server")"; \
    mkdir -p "$admin_dir/.next"; \
    cp -a apps/admin-web/.next/static "$admin_dir/.next/static"; \
    cp -a apps/admin-web/public "$admin_dir/public"

FROM node:20-alpine AS admin-runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=admin-builder --chown=node:node /runtime/admin ./standalone
USER node
EXPOSE 3000
CMD ["sh", "-c", "server=$(find /usr/src/app/standalone -type f -path '*/apps/admin-web/server.js' -print -quit); if [ -z \"$server\" ] && [ -f /usr/src/app/standalone/server.js ]; then server=/usr/src/app/standalone/server.js; fi; test -f \"$server\"; cd $(dirname \"$server\"); exec node server.js"]

# -----------------------------------------------------------------------------
# Customer portal image build — compiles only the Portal application.
# -----------------------------------------------------------------------------
FROM patched-source AS portal-builder
RUN --mount=type=cache,target=/usr/src/app/apps/portal-web/.next/cache \
    export NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' && \
    export NEXT_CPU_LIMIT=1 && \
    export CI=1 && \
    sh scripts/run_with_heartbeat.sh "AROFi Portal build" npm run build --workspace=arofi-portal

RUN set -eux; \
    mkdir -p /runtime/portal; \
    cp -a apps/portal-web/.next/standalone/. /runtime/portal/; \
    portal_server="$(find /runtime/portal -type f -path '*/apps/portal-web/server.js' -print -quit)"; \
    if [ -z "$portal_server" ] && [ -f /runtime/portal/server.js ]; then portal_server=/runtime/portal/server.js; fi; \
    test -f "$portal_server"; \
    portal_dir="$(dirname "$portal_server")"; \
    mkdir -p "$portal_dir/.next"; \
    cp -a apps/portal-web/.next/static "$portal_dir/.next/static"; \
    cp -a apps/portal-web/public "$portal_dir/public"

FROM node:20-alpine AS portal-runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=portal-builder --chown=node:node /runtime/portal ./standalone
USER node
EXPOSE 3000
CMD ["sh", "-c", "server=$(find /usr/src/app/standalone -type f -path '*/apps/portal-web/server.js' -print -quit); if [ -z \"$server\" ] && [ -f /usr/src/app/standalone/server.js ]; then server=/usr/src/app/standalone/server.js; fi; test -f \"$server\"; cd $(dirname \"$server\"); exec node server.js"]

# -----------------------------------------------------------------------------
# API image build — compiles only NestJS and includes Prisma migration tooling.
# -----------------------------------------------------------------------------
FROM patched-source AS api-builder
RUN export NODE_OPTIONS='--max-old-space-size=1024 --max-semi-space-size=8' && \
    export CI=1 && \
    sh scripts/run_with_heartbeat.sh "AROFi API build" npm run build --workspace=arofi-api

FROM node:20-alpine AS api-runtime
WORKDIR /usr/src/app
RUN apk add --no-cache openssl libc6-compat freeradius-utils

COPY scripts/run_with_heartbeat.sh /usr/local/bin/run-with-heartbeat
COPY scripts/start-api.sh /usr/local/bin/start-api
RUN chmod +x /usr/local/bin/run-with-heartbeat /usr/local/bin/start-api

COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
RUN --mount=type=cache,target=/root/.npm \
    cd apps/api && \
    /usr/local/bin/run-with-heartbeat "API runtime dependency install" \
      env NODE_OPTIONS='--max-old-space-size=384' npm_config_jobs=1 \
      npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline

COPY --from=api-builder /usr/src/app/apps/api/dist ./apps/api/dist
COPY --from=api-builder /usr/src/app/apps/api/prisma ./apps/api/prisma
COPY --from=api-builder /usr/src/app/node_modules/.prisma ./apps/api/node_modules/.prisma

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
EXPOSE 31000-31100
CMD ["/usr/local/bin/start-api"]

# -----------------------------------------------------------------------------
# Nginx gateway image — no Node.js application code is included.
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS nginx-runtime
COPY config/nginx.split.conf /etc/nginx/nginx.conf
EXPOSE 3000 3001
CMD ["nginx", "-g", "daemon off;"]
