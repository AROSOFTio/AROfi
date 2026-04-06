# AROFi - Hotspot Billing & Network Management System

AROFi is a complete, production-ready, multi-tenant hotspot billing system.

## Stack Overview
- **Monorepo Manager**: TurboRepo
- **Admin Portal**: Next.js (App router), Tailwind `apps/admin-web`
- **Customer Portal**: Next.js (App router), Tailwind `apps/portal-web`
- **Backend API**: NestJS, PostgreSQL, Prisma, BullMQ `apps/api`
- **Infrastructure**: Docker Compose, Nginx (with wildcard Certbot support), Redis, FreeRADIUS

## Prerequisites
To run this application natively in development:
- Node.js & npm (for TurboRepo)
- Followed by `npm install` and `npm run dev`

To run in **Production Deployment**:
- Docker & Docker Compose
- A live server (e.g., Contabo VPS)
- Cloudflare DNS pointing `arofi.arosoft.io` to your server IP

## Production Deployment

Since AROFi is configured strictly for a live server implementation:

1. Clone the repository to your live VPS.
2. Ensure domains correctly propagate through Cloudflare or standard DNS.
3. Start the entire stack with Docker Compose:
   ```bash
   docker-compose up --build -d
   ```
4. The Nginx router listens cleanly on port `80` and `443`. Upon initialization, `certbot` will run continuously traversing the `letsencrypt` companion volumes to authorize against your domain.

### Initializing the Database

Once the containers are running, you must push the database schema and seed the Master tenant.
Connect to the API container and run Prisma commands:

```bash
docker exec -it arofi-api /bin/sh
npx prisma db push
npx prisma db seed
```

---
*Built by AROSOFT Innovations Ltd*
