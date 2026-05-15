# Build stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ openssl libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --workspace apps/api --include-workspace-root

COPY apps/api ./apps/api

WORKDIR /usr/src/app/apps/api
RUN npx prisma generate
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /usr/src/app/apps/api
RUN apk add --no-cache openssl libc6-compat
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/package.json /usr/src/app/package.json
COPY --from=builder /usr/src/app/package-lock.json /usr/src/app/package-lock.json
COPY --from=builder /usr/src/app/apps/api/dist ./dist
COPY --from=builder /usr/src/app/apps/api/package.json ./
COPY --from=builder /usr/src/app/apps/api/prisma ./prisma

RUN ls -R dist

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
