FROM node:20-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN apk add --no-cache python3 make g++
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/prisma ./prisma

# Find where NestJS put the compiled code (dist/main.js or dist/src/main.js)
RUN ls -R dist

EXPOSE 3000
# Use a flexible command to find and run the main entry point
CMD ["sh", "-c", "node $(find dist -name main.js | head -n 1)"]
