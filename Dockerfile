# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
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

COPY . .
RUN chmod +x scripts/run_with_heartbeat.sh

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
    && python3 scripts/fix_iotec_live_gateway_diagnostics.py \
    && python3 scripts/finalize_gateway_compile.py

RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

ENV TURBO_TELEMETRY_DISABLED=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV GENERATE_SOURCEMAP=false
ENV UV_THREADPOOL_SIZE=1

RUN --mount=type=cache,target=/usr/src/app/apps/admin-web/.next/cache \
    export NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=8' && \
    export NEXT_CPU_LIMIT=1 && \
    export CI=1 && \
    sh scripts/run_with_heartbeat.sh "AROFi Admin build" npm run build --workspace=arofi-admin

RUN --mount=type=cache,target=/usr/src/app/apps/portal-web/.next/cache \
    export NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' && \
    export NEXT_CPU_LIMIT=1 && \
    export CI=1 && \
    sh scripts/run_with_heartbeat.sh "AROFi Portal build" npm run build --workspace=arofi-portal

RUN export NODE_OPTIONS='--max-old-space-size=1024 --max-semi-space-size=8' && \
    export CI=1 && \
    sh scripts/run_with_heartbeat.sh "AROFi API build" npm run build --workspace=arofi-api

# Assemble minimal Next.js standalone bundles. Each bundle contains only the
# server files and production dependencies traced by Next.js, rather than the
# monorepo's complete node_modules tree. Static assets and public files must be
# copied beside the generated server.js manually.
RUN set -eux; \
    mkdir -p /runtime/admin /runtime/portal; \
    cp -a apps/admin-web/.next/standalone/. /runtime/admin/; \
    admin_server="$(find /runtime/admin -type f -path '*/apps/admin-web/server.js' -print -quit)"; \
    if [ -z "$admin_server" ] && [ -f /runtime/admin/server.js ]; then admin_server=/runtime/admin/server.js; fi; \
    test -f "$admin_server"; \
    admin_dir="$(dirname "$admin_server")"; \
    mkdir -p "$admin_dir/.next"; \
    cp -a apps/admin-web/.next/static "$admin_dir/.next/static"; \
    cp -a apps/admin-web/public "$admin_dir/public"; \
    cp -a apps/portal-web/.next/standalone/. /runtime/portal/; \
    portal_server="$(find /runtime/portal -type f -path '*/apps/portal-web/server.js' -print -quit)"; \
    if [ -z "$portal_server" ] && [ -f /runtime/portal/server.js ]; then portal_server=/runtime/portal/server.js; fi; \
    test -f "$portal_server"; \
    portal_dir="$(dirname "$portal_server")"; \
    mkdir -p "$portal_dir/.next"; \
    cp -a apps/portal-web/.next/static "$portal_dir/.next/static"; \
    cp -a apps/portal-web/public "$portal_dir/public"; \
    touch /runtime/builder-complete; \
    du -sh /runtime/admin /runtime/portal apps/api/dist node_modules/.prisma

# Runtime image intentionally does not copy the root monorepo node_modules.
# Install only API production dependencies and copy the two minimal Next
# standalone bundles. The API dependency install starts independently of the
# long frontend builds so Coolify does not hit its deployment time limit after
# all application builds have already succeeded.
FROM node:20-alpine AS runtime
WORKDIR /usr/src/app
RUN apk add --no-cache openssl libc6-compat freeradius-utils nginx
RUN addgroup -g 1001 -S nodejs && adduser -S arofi -u 1001 -G nodejs

COPY scripts/run_with_heartbeat.sh /usr/local/bin/run-with-heartbeat
RUN chmod +x /usr/local/bin/run-with-heartbeat
COPY apps/api/package.json ./apps/api/package.json
RUN --mount=type=cache,target=/root/.npm \
    cd apps/api && \
    /usr/local/bin/run-with-heartbeat "API runtime dependency install" \
      env NODE_OPTIONS='--max-old-space-size=256' npm_config_jobs=1 \
      npm install --omit=dev --legacy-peer-deps --no-audit --no-fund --prefer-offline

# Wait for the builder only after runtime dependencies are ready. BuildKit can
# prepare this small runtime layer while the Admin, Portal and API compile.
COPY --from=builder /runtime/builder-complete /tmp/builder-complete
COPY --from=builder --chown=arofi:nodejs /usr/src/app/apps/api/dist ./apps/api/dist
COPY --from=builder /usr/src/app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /usr/src/app/node_modules/.prisma ./apps/api/node_modules/.prisma

COPY --from=builder --chown=arofi:nodejs /runtime/admin ./standalone/admin
COPY --from=builder --chown=arofi:nodejs /runtime/portal ./standalone/portal

COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/scripts ./scripts

RUN cp config/nginx.coolify.conf /etc/nginx/nginx.conf \
    && mkdir -p /run/nginx \
    && chmod +x scripts/start-all.sh scripts/start-api.sh \
    && rm -rf /root/.npm /tmp/*

EXPOSE 3000
EXPOSE 31000-31099
ENV SERVICE_NAME=all
ENV DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/arofi_dev?schema=public}

CMD if [ "$SERVICE_NAME" = "all" ]; then \
      sh scripts/start-all.sh; \
    elif [ "$SERVICE_NAME" = "api" ]; then \
      exec sh scripts/start-api.sh; \
    elif [ "$SERVICE_NAME" = "admin" ]; then \
      server="$(find /usr/src/app/standalone/admin -type f -path '*/apps/admin-web/server.js' -print -quit)"; \
      if [ -z "$server" ] && [ -f /usr/src/app/standalone/admin/server.js ]; then server=/usr/src/app/standalone/admin/server.js; fi; \
      test -f "$server" && cd "$(dirname "$server")" && PORT=3000 HOSTNAME=0.0.0.0 exec node server.js; \
    elif [ "$SERVICE_NAME" = "portal" ]; then \
      server="$(find /usr/src/app/standalone/portal -type f -path '*/apps/portal-web/server.js' -print -quit)"; \
      if [ -z "$server" ] && [ -f /usr/src/app/standalone/portal/server.js ]; then server=/usr/src/app/standalone/portal/server.js; fi; \
      test -f "$server" && cd "$(dirname "$server")" && PORT=3000 HOSTNAME=0.0.0.0 exec node server.js; \
    elif [ "$SERVICE_NAME" = "nginx" ]; then \
      cp config/nginx.split.conf /etc/nginx/nginx.conf && \
      exec nginx -g 'daemon off;'; \
    else \
      echo "Please configure SERVICE_NAME to 'all', 'api', 'admin', 'portal', or 'nginx'"; exit 1; \
    fi
