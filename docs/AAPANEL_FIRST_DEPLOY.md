# First-Time aaPanel Docker Deploy

Use these steps on the aaPanel server for `arofi.arosoft.io`.

## 1. Clone the project first

Stay in your normal SSH user. Do not run `sudo su` or `sudo -i`; use `sudo` only on the commands that need server permissions.

aaPanel may create `/www/wwwroot/arofi.arosoft.io` as an empty folder. Clone the GitHub repo into that folder before copying `.env`:

```sh
cd /www/wwwroot
if [ -d arofi.arosoft.io ]; then sudo mv arofi.arosoft.io arofi.arosoft.io.backup.$(date +%Y%m%d%H%M%S); fi
sudo git clone https://github.com/AROSOFTio/AROfi.git arofi.arosoft.io
sudo chown -R "$USER":"$USER" /www/wwwroot/arofi.arosoft.io
cd /www/wwwroot/arofi.arosoft.io
```

The folder should contain `docker-compose.yml`, `apps/`, `config/`, `package.json`, and `.env.aapanel.example`.

If you already created and edited `/www/wwwroot/arofi.arosoft.io/.env`, do not move or replace the folder. Pull the repo files into a temp folder, then sync them in without touching `.env`:

```sh
cd /www/wwwroot/arofi.arosoft.io
sudo cp .env .env.backup.$(date +%Y%m%d%H%M%S)

cd /tmp
sudo rm -rf arofi-source
sudo git clone https://github.com/AROSOFTio/AROfi.git arofi-source
sudo rsync -a --exclude='.git' --exclude='.env' /tmp/arofi-source/ /www/wwwroot/arofi.arosoft.io/
sudo chown -R "$USER":"$USER" /www/wwwroot/arofi.arosoft.io

cd /www/wwwroot/arofi.arosoft.io
ls scripts/deploy-aapanel.sh
```

## 2. Install Docker in aaPanel

In aaPanel, open `Docker` and install/enable Docker if it is not already running.

Check from SSH:

```sh
sudo docker --version
sudo docker compose version
```

## 3. Create the production env file

```sh
cd /www/wwwroot/arofi.arosoft.io
sudo cp .env.aapanel.example .env
sudo nano .env
```

Replace all `CHANGE_ME...` values. Add real MTN MoMo credentials before live payments. Add Airtel endpoint and credential details when Airtel live access is approved.

MTN collection requires:

```env
MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY=...
MTN_MOMO_COLLECTION_API_USER=...
MTN_MOMO_COLLECTION_API_KEY=...
```

For live Uganda set:

```env
MTN_MOMO_COLLECTION_BASE_URL=https://proxy.momoapi.mtn.com
MTN_MOMO_TARGET_ENVIRONMENT=mtnuganda
```

For random secrets you can run:

```sh
openssl rand -hex 32
```

## 4. Deploy

```sh
cd /www/wwwroot/arofi.arosoft.io
sudo chmod +x scripts/deploy-aapanel.sh
sudo ./scripts/deploy-aapanel.sh
```

Only seed demo data when you really want demo records:

```sh
sudo ./scripts/deploy-aapanel.sh --seed
```

## 5. Point aaPanel site to Docker

In aaPanel, open the website `arofi.arosoft.io`, then add a reverse proxy:

```text
Proxy target: http://127.0.0.1:4012
Send domain:  arofi.arosoft.io
```

Enable SSL for `arofi.arosoft.io`.

## 6. Open firewall ports

Open these ports:

```text
80/tcp    HTTP for SSL setup and redirect
443/tcp   HTTPS site
1812/udp  RADIUS authentication from MikroTik routers
1813/udp  RADIUS accounting from MikroTik routers
```

Only open `3799/udp` if `RADIUS_DISCONNECT_ENABLED=true`.

## 7. Verify

```sh
cd /www/wwwroot/arofi.arosoft.io
sudo docker compose ps
sudo docker compose logs -f --tail=200 api nginx
curl -I http://127.0.0.1:4012
```

Routes:

```text
https://arofi.arosoft.io/        Admin app
https://arofi.arosoft.io/portal  Customer portal
https://arofi.arosoft.io/api     Backend API
```

## Updating later

```sh
cd /www/wwwroot/arofi.arosoft.io
sudo git pull origin main
sudo ./scripts/deploy-aapanel.sh
```
