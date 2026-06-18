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

# Install dependencies in development mode to ensure compilers are available
RUN --mount=type=cache,target=/root/.npm \
    NODE_ENV=development npm install --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma Client and build all packages using Turbo.
# Build one app at a time (--concurrency=1) and cap Node heap so the build
# stays within the RAM of a small (4GB) server instead of OOM-killing other
# containers (including Coolify's own services).
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN NODE_OPTIONS='--max-old-space-size=900' NEXT_CPU_LIMIT=1 npx turbo run build --concurrency=1

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /usr/src/app
RUN apk add --no-cache openssl libc6-compat freeradius-utils nginx

# Copy builds and node_modules from builder
COPY --from=builder /usr/src/app ./

# nginx config for all-in-one mode + make the startup script executable
RUN cp config/nginx.coolify.conf /etc/nginx/nginx.conf \
    && mkdir -p /run/nginx \
    && chmod +x scripts/start-all.sh

RUN addgroup -g 1001 -S nodejs && adduser -S arofi -u 1001 -G nodejs
# chown only the runtime artifacts needed, not the whole tree
RUN chown -R arofi:nodejs /usr/src/app/apps/api/dist \
    && chown -R arofi:nodejs /usr/src/app/apps/admin-web/.next \
    && chown -R arofi:nodejs /usr/src/app/apps/portal-web/.next || true

EXPOSE 3000
# Default service to run. "all" = nginx + api + admin-web + portal-web in one
# container (single domain). Set SERVICE_NAME=api|admin|portal to run just one.
ENV SERVICE_NAME=all
# Provide defaults for development if not set in environment
ENV DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/arofi_dev?schema=public}
ENV JWT_SECRET=${JWT_SECRET:-dev-jwt-secret-change-in-production}
ENV PORTAL_TOKEN_SECRET=${PORTAL_TOKEN_SECRET:-dev-portal-secret-change-in-production}
ENV ROUTER_CREDENTIAL_SECRET=${ROUTER_CREDENTIAL_SECRET:-dev-router-secret-change-in-production}
ENV RADIUS_INTERNAL_API_KEY=${RADIUS_INTERNAL_API_KEY:-dev-radius-api-key-change-in-production}
ENV RADIUS_SHARED_SECRET=${RADIUS_SHARED_SECRET:-dev-radius-secret-change-in-production}

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
