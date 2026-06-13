# Build stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ openssl libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN NODE_ENV=development npm ci --workspace apps/api --include-workspace-root

COPY apps/api ./apps/api

WORKDIR /usr/src/app/apps/api
RUN npx prisma generate
RUN NODE_OPTIONS='--max-old-space-size=1024' npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /usr/src/app/apps/api
RUN apk add --no-cache openssl libc6-compat freeradius-utils
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/package.json /usr/src/app/package.json
COPY --from=builder /usr/src/app/package-lock.json /usr/src/app/package-lock.json
COPY --from=builder /usr/src/app/apps/api/dist ./dist
COPY --from=builder /usr/src/app/apps/api/package.json ./
COPY apps/api/prisma ./prisma
RUN test -f prisma/migrations/20260515172000_radius_access_router_onboarding/migration.sql \
  && test -f prisma/migrations/20260515193000_dynamic_nas_quota_disconnect/migration.sql

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && if [ -f dist/main.js ]; then node dist/main.js; else node dist/src/main.js; fi"]
