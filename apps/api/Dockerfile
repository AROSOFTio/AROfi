# Build stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ openssl libc6-compat
COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /usr/src/app
RUN apk add --no-cache openssl libc6-compat
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/prisma ./prisma

# Find where NestJS put the compiled code (dist/main.js or dist/src/main.js)
RUN ls -R dist

EXPOSE 3000
# Use a flexible command to find and run the main entry point
CMD ["sh", "-c", "node $(find dist -name main.js | head -n 1)"]
