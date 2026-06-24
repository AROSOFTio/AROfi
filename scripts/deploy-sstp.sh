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

# 2. Install sstp-client (for pppd plugin) and sstp-server (via pip)
echo "[sstp] Installing compilation tools and dependencies..."
apt-get update
apt-get install -y build-essential libevent-dev libssl-dev pkg-config ppp ppp-dev automake libtool git python3-pip python3-setuptools freeradius-common || true

echo "[sstp] Cloning and compiling sstp-client from source..."
rm -rf /tmp/sstp-client
git clone https://gitlab.com/sstp-project/sstp-client.git /tmp/sstp-client
cd /tmp/sstp-client
./autogen.sh
./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var
make
make install
ldconfig

echo "[sstp] Installing sstp-server via pip..."
if ! command -v sstpd >/dev/null 2>&1; then
  pip3 install --break-system-packages sstp-server || true
else
  echo "[sstp] sstpd is already installed, skipping pip install."
fi

# Create sstpd systemd unit file
BINARY_PATH="$(which sstpd || echo /usr/local/bin/sstpd)"
cat << EOF > /etc/systemd/system/sstpd.service
[Unit]
Description=SSTP VPN Server
After=network.target

[Service]
Type=simple
ExecStart=$BINARY_PATH -l 0.0.0.0 -p 4443 -c /etc/sstpd/sstpd.crt -k /etc/sstpd/sstpd.key --pppd-config /etc/ppp/options.sstpd
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 3. Generate self-signed SSL certificates for SSTP
echo "[sstp] Generating self-signed SSL certificate..."
mkdir -p /etc/sstpd
openssl genrsa -out /etc/sstpd/sstpd.key 2048
openssl req -new -x509 -key /etc/sstpd/sstpd.key -out /etc/sstpd/sstpd.crt -days 3650 -subj "/CN=arofi-sstp"
chmod 600 /etc/sstpd/sstpd.key

# 5. Configure /etc/ppp/options.sstpd
echo "[sstp] Configuring pppd options..."
cat << 'EOF' > /etc/ppp/options.sstpd
name sstpd
linkname sstp
# Local VPN IP for the VPS, remote is dynamically assigned by RADIUS
10.8.0.1:
plugin radius.so
plugin radattr.so
# FreeRADIUS (config/freeradius/sites-enabled/default) only implements
# Auth-Type PAP and CHAP — there is no mschap module wired in. Requiring
# MS-CHAPv2/MPPE here caused FreeRADIUS to reject every auth attempt, so
# the MikroTik SSTP client looped connecting -> terminating -> disconnected
# forever. SSTP already runs inside TLS, so PPP-level MPPE is redundant —
# require plain PAP instead, which matches the Cleartext-Password stored
# in radcheck for router-<id>.
require-pap
refuse-chap
refuse-mschap
refuse-mschap-v2
nobsdcomp
nodeflate
nopcomp
noaccomp
EOF

# 5b. Configure chap-secrets and pap-secrets wildcards for RADIUS fallback
echo "[sstp] Configuring chap-secrets and pap-secrets wildcards..."
touch /etc/ppp/chap-secrets /etc/ppp/pap-secrets
if ! grep -q "\* \* \"\" \*" /etc/ppp/chap-secrets; then
  echo '* * "" *' >> /etc/ppp/chap-secrets
fi
if ! grep -q "\* \* \"\" \*" /etc/ppp/pap-secrets; then
  echo '* * "" *' >> /etc/ppp/pap-secrets
fi

# 6. Configure RADIUS client configurations (support both traditional and ng paths)
for dir in /etc/radiusclient /etc/radiusclient-ngx; do
  echo "[sstp] Preparing RADIUS client config in $dir..."
  mkdir -p "$dir"

  # Write radiusclient.conf
  cat << EOF > "$dir/radiusclient.conf"
authserver 127.0.0.1:1812
acctserver 127.0.0.1:1813
servers $dir/servers
dictionary /usr/share/freeradius/dictionary
login_tries 4
login_timeout 60
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
if [ -f /etc/sysctl.conf ]; then
  if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
  fi
else
  mkdir -p /etc/sysctl.d
  echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-ipforward.conf
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
