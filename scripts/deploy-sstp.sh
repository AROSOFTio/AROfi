#!/bin/sh
# Deploys the SSTP VPN Server on the host VPS.
# Authenticates clients against the AROFi FreeRADIUS container.
#
# Run on the VPS, from a checkout of this repo:
#   sh scripts/deploy-sstp.sh
#
set -eu

echo "=========================================="
echo "Installing and configuring SSTP VPN Server"
echo "=========================================="

# 1. Detect running AROFi App Container
APP=""
for c in $(docker ps -q); do
  if [ -n "$(docker exec "$c" printenv RADIUS_SHARED_SECRET 2>/dev/null || true)" ]; then APP="$c"; break; fi
done

[ -n "$APP" ] || { echo "ERROR: Could not find the AROFi app container. Is the app deployed?"; exit 1; }
echo "[sstp] Found app container: $(docker inspect -f '{{.Name}}' "$APP" | sed 's#^/##')"

appenv() { docker exec "$APP" printenv "$1" 2>/dev/null || true; }
SECRET="$(appenv RADIUS_SHARED_SECRET)"
[ -n "$SECRET" ] || { echo "ERROR: RADIUS_SHARED_SECRET is not set in the app container."; exit 1; }

# 2. Install sstpd and ppp packages
echo "[sstp] Installing sstpd and ppp on host..."
if apt-get install -y sstpd ppp; then
  echo "[sstp] sstpd installed successfully from repositories."
else
  echo "[sstp] sstpd not found in repositories. Compiling from source..."
  apt-get install -y build-essential libevent-dev libssl-dev pkg-config wget ppp

  # Download sstp-server source code
  cd /tmp
  wget -O sstp-server-1.0.18.tar.gz "https://sourceforge.net/projects/sstp-server/files/sstp-server/1.0.18/sstp-server-1.0.18.tar.gz/download"
  tar -zxf sstp-server-1.0.18.tar.gz
  cd sstp-server-1.0.18
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var
  make
  make install
  ldconfig

  # Create sstpd systemd unit file
  BINARY_PATH="$(which sstpd || echo /usr/sbin/sstpd)"
  cat << EOF > /etc/systemd/system/sstpd.service
[Unit]
Description=SSTP VPN Server
After=network.target

[Service]
Type=simple
ExecStart=$BINARY_PATH -d -f /etc/sstpd/sstpd.conf
Restart=always

[Install]
WantedBy=multi-user.target
EOF
fi

# 3. Generate self-signed SSL certificates for SSTP
echo "[sstp] Generating self-signed SSL certificate..."
mkdir -p /etc/sstpd
openssl genrsa -out /etc/sstpd/sstpd.key 2048
openssl req -new -x509 -key /etc/sstpd/sstpd.key -out /etc/sstpd/sstpd.crt -days 3650 -subj "/CN=arofi-sstp"
chmod 600 /etc/sstpd/sstpd.key

# 4. Configure /etc/sstpd/sstpd.conf
echo "[sstp] Configuring sstpd.conf..."
cat << 'EOF' > /etc/sstpd/sstpd.conf
# sstpd configuration file
listen 0.0.0.0
listen-port 4443
certfile /etc/sstpd/sstpd.crt
keyfile /etc/sstpd/sstpd.key
pppd-optsfile /etc/ppp/options.sstpd
EOF

# 5. Configure /etc/ppp/options.sstpd
echo "[sstp] Configuring pppd options..."
cat << 'EOF' > /etc/ppp/options.sstpd
name sstpd
linkname sstp
# Local VPN IP for the VPS, remote is dynamically assigned by RADIUS
10.8.0.1:
plugin radius.so
plugin radattr.so
require-mschap-v2
require-mppe-128
nobsdcomp
nodeflate
nopcomp
noaccomp
EOF

# 6. Configure RADIUS client configurations (support both traditional and ng paths)
for dir in /etc/radiusclient /etc/radiusclient-ngx; do
  echo "[sstp] Preparing RADIUS client config in $dir..."
  mkdir -p "$dir"

  # Write radiusclient.conf
  cat << EOF > "$dir/radiusclient.conf"
nas-identifier sstp-vpn
authserver 127.0.0.1:1812
acctserver 127.0.0.1:1813
servers $dir/servers
dictionary $dir/dictionary
login_tries 4
login_timeout 60
naspotr 0
EOF

  # Write servers file with shared secret
  cat << EOF > "$dir/servers"
127.0.0.1 $SECRET
EOF
  chmod 600 "$dir/servers"

  # Write minimal dictionary containing standard attributes to prevent dictionary-not-found errors
  cat << 'EOF' > "$dir/dictionary"
# Minimal RADIUS Dictionary for sstpd
ATTRIBUTE User-Name 1 string
ATTRIBUTE User-Password 2 string
ATTRIBUTE NAS-IP-Address 4 ipaddr
ATTRIBUTE NAS-Port 5 integer
ATTRIBUTE Service-Type 6 integer
ATTRIBUTE Framed-Protocol 7 integer
ATTRIBUTE Framed-IP-Address 8 ipaddr
ATTRIBUTE NAS-Identifier 32 string
EOF
done

# 7. Enable IP Forwarding on the host VPS
echo "[sstp] Enabling IP forwarding on host..."
sysctl -w net.ipv4.ip_forward=1
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

# 8. Start and enable sstpd service
echo "[sstp] Restarting sstpd service..."
systemctl daemon-reload
systemctl enable sstpd
systemctl restart sstpd

echo "[sstp] Checking sstpd status..."
systemctl status sstpd --no-pager || true

echo "=========================================="
echo "SSTP VPN Server successfully deployed on port 4443!"
echo "=========================================="
