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
RUN NODE_ENV=development npm install --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma Client and build all packages using Turbo
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN NODE_OPTIONS='--max-old-space-size=1024' NEXT_CPU_LIMIT=1 npx turbo run build

# Runtime stage
FROM node:20-alpine
WORKDIR /usr/src/app
RUN apk add --no-cache openssl libc6-compat freeradius-utils

# Copy builds and node_modules from builder
COPY --from=builder /usr/src/app ./

EXPOSE 3000
# Default service to run if SERVICE_NAME is not specified in the environment
ENV SERVICE_NAME=api

# Start appropriate service based on SERVICE_NAME environment variable
CMD if [ "$SERVICE_NAME" = "api" ]; then \
      cd apps/api && npx prisma migrate deploy && (if [ -f dist/main.js ]; then node dist/main.js; else node dist/src/main.js; fi); \
    elif [ "$SERVICE_NAME" = "admin" ]; then \
      cd apps/admin-web && npm run start; \
    elif [ "$SERVICE_NAME" = "portal" ]; then \
      cd apps/portal-web && npm run start; \
    else \
      echo "Please configure SERVICE_NAME to 'api', 'admin', or 'portal'"; exit 1; \
    fi
