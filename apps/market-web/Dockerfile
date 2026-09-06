FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN NODE_ENV=development npm install --legacy-peer-deps
COPY . .
RUN NODE_OPTIONS='--max-old-space-size=1024' NEXT_CPU_LIMIT=1 npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 4020
CMD ["npm", "run", "start"]
