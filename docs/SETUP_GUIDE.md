# AROFi System Setup Guide

This document provides a clean, step-by-step guide to setting up the **AROFi Hotspot Billing & Mobile Money Management Platform** in both local development and production environments.

---

## 📋 System Prerequisites
Ensure your server or local machine has the following tools installed:
* **Operating System:** Ubuntu 22.04 LTS (recommended for production) or Windows/macOS (for development)
* **Docker & Docker Compose** (Docker v20.10+ / Compose v2.0+)
* **Node.js** (v20+ LTS) and **npm**
* **Git**
* **Ports Required (must be open/unbound):**
  * `80` / `443` (for web traffic reverse proxy)
  * `1812` / `1813` (UDP, for FreeRADIUS authentication and accounting)
  * `3000` (API backend)
  * `4012` (Containerized Nginx entry point)

---

## 🛠️ Step-by-Step Installation

### Step 1: Clone the Repository
Clone the codebase to your deployment target directory:
```bash
git clone https://github.com/arosoftio/arofi.git
cd arofi
```

### Step 2: Environment Configuration
Copy the template configuration file to establish your active environment file:
```bash
cp .env.example .env
```
Open `.env` in a text editor and fill in the necessary secrets and settings:
1. **Database Credentials:** Update `POSTGRES_USER` and `POSTGRES_PASSWORD` with secure credentials.
2. **Secrets:** Set secure values for `JWT_SECRET`, `PORTAL_TOKEN_SECRET`, and `ROUTER_CREDENTIAL_SECRET`.
3. **RADIUS Host & Secret:** Set `RADIUS_PUBLIC_HOST` to your server's public IP address, and choose a strong value for `RADIUS_SHARED_SECRET`.
4. **Mobile Money Credentials:** Input your MTN MoMo API values and Airtel Money secrets. If credentials are pending, configure the aggregator fallback (`MTN_COLLECTION_PROVIDER=AGGREGATOR` with Pesapal details).

### Step 3: Spin Up Containers with Docker Compose
Start the backend services, database, cache, proxy, and RADIUS server:
```bash
# Build the images and launch the services in detached (background) mode
docker compose up -d --build
```
Verify that all containers are healthy and running:
```bash
docker compose ps
```

### Step 4: Run Prisma Database Migrations
Deploy the PostgreSQL schema inside the running API container:
```bash
# Run migration script
docker compose exec -T api npx prisma migrate deploy
```

### Step 5: Seed the Database (Initial Admin User & Roles)
Populate the database with default roles, permissions, and demo configurations:
```bash
# Seed default system entries
docker compose exec -T api npx prisma db seed
```
> 💡 *Note:* If you need a clean developer admin account with the default password `admin123`, you can use the SQL query block from the documentation dashboard or execute:
> ```bash
> docker exec -i lfoov1ia8jygka7ubtjlemms env PGPASSWORD=your_postgres_password psql -U AROfi -d postgres -c "INSERT INTO \"User\" ... "
> ```

### Step 6: Configure aaPanel / Nginx Reverse Proxy
By default, Docker Compose exposes AROFi on host port `4012` (via Nginx). 
To bind it to a domain (e.g., `arofi.yourdomain.com`):
1. In aaPanel or your native system Nginx config, create a new site for `arofi.yourdomain.com`.
2. Set up an SSL Certificate (e.g., Let's Encrypt).
3. Configure a **Reverse Proxy** routing traffic to:
   * Target URL: `http://127.0.0.1:4012`
   * Ensure headers like `Host`, `X-Real-IP`, and `X-Forwarded-For` are passed correctly.

---

## 🔌 MikroTik Hotspot Configuration

Once the web portal is running and you have signed in:
1. Go to **Routers** in the dashboard and click **Register Router**.
2. Select **Fresh full captive Wi-Fi** mode and copy the generated RouterOS command.
3. Open **WinBox**, connect to your MikroTik, go to **New Terminal**, and paste the command.
4. Verify the router checks in and displays as **Healthy** on your AROFi operator console.

---

## 🔍 Verification & Debugging

* **Monitor Logs:** Check container logs to trace issues:
  ```bash
  docker compose logs -f --tail=100 api freeradius
  ```
* **Radius Authentication Test:** Trace incoming packets in FreeRADIUS:
  ```bash
  docker exec -it arofi-freeradius raddebug -u <username>
  ```
* **Verify Ports:** Ensure UDP sockets are listening:
  ```bash
  ss -ulpn | grep -E "1812|1813"
  ```
