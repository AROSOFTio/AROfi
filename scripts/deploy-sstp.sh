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
# Bind the radius plugin to OUR config file explicitly. Without this the
# plugin uses a compiled-in default path (which on this build is NOT
# /etc/radiusclient), so it never read our radiusclient.conf/dictionary and
# logged "rc_avpair_new: unknown attribute" for every basic attribute, then
# sent an empty Access-Request -> "PAP peer authentication failed".
radius-config-file /etc/radiusclient/radiusclient.conf
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
# Detect FreeRADIUS container IP dynamically to handle Docker bridge NAT correctly
RADIUS_IP=""
if docker ps -q --filter name=arofi-freeradius >/dev/null 2>&1; then
  RADIUS_IP=$(docker inspect arofi-freeradius | grep '"IPAddress"' | tail -1 | sed 's/.*: "//;s/".*//' || true)
fi
[ -n "$RADIUS_IP" ] || RADIUS_IP="127.0.0.1"
echo "[sstp] FreeRADIUS container IP detected: $RADIUS_IP"

for dir in /etc/radiusclient /etc/radiusclient-ngx; do
  echo "[sstp] Preparing RADIUS client config in $dir..."
  mkdir -p "$dir"

  # Write radiusclient.conf
  # seqfile/mapfile must be set: the pppd radius.so plugin (libfreeradius-client)
  # dereferences these config fields unconditionally when building the request,
  # and a missing/unset value crashes pppd with SIGSEGV (Fatal signal 11) the
  # moment the link comes up — before any auth packet is even sent.
  # dictionary MUST point at our own minimal file below, NOT at
  # /usr/share/freeradius/dictionary: that file is the FreeRADIUS *server*
  # dictionary (uses $INCLUDE / flags / a newer syntax) which the old
  # libradiusclient parser used by pppd's radius.so cannot read. It silently
  # failed to load any attribute (even User-Name/User-Password/NAS-IP-Address),
  # so the plugin sent an empty Access-Request and pppd reported a generic
  # "PAP peer authentication failed" with "unknown attribute" warnings for
  # every basic attribute id.
  cat << EOF > "$dir/radiusclient.conf"
authserver $RADIUS_IP:1812
acctserver $RADIUS_IP:1813
servers $dir/servers
dictionary $dir/dictionary
seqfile $dir/radius.seq
mapfile $dir/port-id-map
default_realm
radius_timeout 10
radius_retries 3
login_tries 4
login_timeout 60
EOF

  touch "$dir/radius.seq" "$dir/port-id-map"
  chmod 600 "$dir/radius.seq"

  # Write servers file with shared secret
  cat << EOF > "$dir/servers"
127.0.0.1 $SECRET
EOF
  if [ "$RADIUS_IP" != "127.0.0.1" ]; then
    echo "$RADIUS_IP $SECRET" >> "$dir/servers"
  fi
  chmod 600 "$dir/servers"

  # Write a COMPLETE radiusclient-format dictionary. The pppd radius plugin
  # builds the Access-Request from these definitions; any attribute it wants
  # to send that is missing here triggers "rc_avpair_new: unknown attribute"
  # and is dropped, producing an empty/garbage request. Cover every attribute
  # and VALUE the plugin uses for PAP auth + accounting.
  cat << 'EOF' > "$dir/dictionary"
# Standard RADIUS dictionary (radiusclient format) for AROFi SSTP
ATTRIBUTE	User-Name		1	string
ATTRIBUTE	User-Password		2	string
ATTRIBUTE	CHAP-Password		3	string
ATTRIBUTE	NAS-IP-Address		4	ipaddr
ATTRIBUTE	NAS-Port		5	integer
ATTRIBUTE	Service-Type		6	integer
ATTRIBUTE	Framed-Protocol		7	integer
ATTRIBUTE	Framed-IP-Address	8	ipaddr
ATTRIBUTE	Framed-IP-Netmask	9	ipaddr
ATTRIBUTE	Framed-Routing		10	integer
ATTRIBUTE	Filter-Id		11	string
ATTRIBUTE	Framed-MTU		12	integer
ATTRIBUTE	Framed-Compression	13	integer
ATTRIBUTE	Reply-Message		18	string
ATTRIBUTE	Callback-Number		19	string
ATTRIBUTE	State			24	string
ATTRIBUTE	Class			25	string
ATTRIBUTE	Vendor-Specific		26	string
ATTRIBUTE	Session-Timeout		27	integer
ATTRIBUTE	Idle-Timeout		28	integer
ATTRIBUTE	Termination-Action	29	integer
ATTRIBUTE	Called-Station-Id	30	string
ATTRIBUTE	Calling-Station-Id	31	string
ATTRIBUTE	NAS-Identifier		32	string
ATTRIBUTE	Proxy-State		33	string
ATTRIBUTE	Acct-Status-Type	40	integer
ATTRIBUTE	Acct-Delay-Time		41	integer
ATTRIBUTE	Acct-Input-Octets	42	integer
ATTRIBUTE	Acct-Output-Octets	43	integer
ATTRIBUTE	Acct-Session-Id		44	string
ATTRIBUTE	Acct-Authentic		45	integer
ATTRIBUTE	Acct-Session-Time	46	integer
ATTRIBUTE	Acct-Input-Packets	47	integer
ATTRIBUTE	Acct-Output-Packets	48	integer
ATTRIBUTE	Acct-Terminate-Cause	49	integer
ATTRIBUTE	Acct-Multi-Session-Id	50	string
ATTRIBUTE	Acct-Link-Count		51	integer
ATTRIBUTE	CHAP-Challenge		60	string
ATTRIBUTE	NAS-Port-Type		61	integer
ATTRIBUTE	Port-Limit		62	integer

#	Service-Type values
VALUE		Service-Type		Login-User		1
VALUE		Service-Type		Framed-User		2
VALUE		Service-Type		Callback-Login-User	3
VALUE		Service-Type		Callback-Framed-User	4
VALUE		Service-Type		Outbound-User		5
VALUE		Service-Type		Administrative-User	6

#	Framed-Protocol values
VALUE		Framed-Protocol		PPP			1
VALUE		Framed-Protocol		SLIP			2

#	Acct-Status-Type values
VALUE		Acct-Status-Type	Start			1
VALUE		Acct-Status-Type	Stop			2
VALUE		Acct-Status-Type	Alive			3
VALUE		Acct-Status-Type	Interim-Update		3

#	Acct-Authentic values
VALUE		Acct-Authentic		RADIUS			1
VALUE		Acct-Authentic		Local			2

#	NAS-Port-Type values
VALUE		NAS-Port-Type		Async			0
VALUE		NAS-Port-Type		Virtual			5
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
