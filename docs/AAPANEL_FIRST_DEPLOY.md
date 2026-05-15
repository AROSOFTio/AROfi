# First-Time aaPanel Docker Deploy

Use these steps on the aaPanel server for `arofi.arosoft.io`.

## 1. Upload the project

Upload or clone this project into:

```sh
cd /www/wwwroot/arofi.arosoft.io
```

The folder should contain `docker-compose.yml`, `apps/`, `config/`, `package.json`, and `.env.aapanel.example`.

## 2. Install Docker in aaPanel

In aaPanel, open `Docker` and install/enable Docker if it is not already running.

Check from SSH:

```sh
sudo docker --version
sudo docker compose version
```

## 3. Create the production env file

Stay in your normal SSH user. Do not run `sudo su` or `sudo -i`; use `sudo` only on the commands that need server permissions.

```sh
cd /www/wwwroot/arofi.arosoft.io
sudo cp .env.aapanel.example .env
sudo nano .env
```

Replace all `CHANGE_ME...` values. Also add real Pesapal and Yo Uganda credentials before live payments.

The default provider is `PESAPAL`, so these must be set before the API will start:

```env
PESAPAL_CONSUMER_KEY=...
PESAPAL_CONSUMER_SECRET=...
PESAPAL_IPN_ID=...
```

If you are starting with Yo Uganda instead, set:

```env
PAYMENT_DEFAULT_PROVIDER=YO_UGANDA
YO_API_USERNAME=...
YO_API_PASSWORD=...
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
Proxy target: http://127.0.0.1:9096
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
curl -I http://127.0.0.1:9096
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
