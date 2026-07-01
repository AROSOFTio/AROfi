#!/bin/sh
# Deploys a WireGuard VPN Server on the host VPS for AROFi Remote WinBox Access.
# WireGuard works on ALL RouterOS 7 devices without any device-mode restrictions.
#
# Usage (run on the VPS as root, from a checkout of this repo):
#   sh scripts/deploy-wireguard.sh
#
# After running:
#   1. Copy the SERVER PUBLIC KEY printed at the end.
#   2. Set VPN_WG_SERVER_PUBKEY=<that key> in your Coolify environment variables.
#   3. Re-deploy the app so the install scripts embed the correct server public key.
#   4. On each router: go to Admin → Remote Access → Install → copy and run the script.
#
# Peer sync (add new routers without restarting):
#   sh scripts/wireguard-sync-peers.sh
#
set -eu

echo "=============================================="
echo "Installing WireGuard VPN Server for AROFi"
echo "=============================================="

WG_IF="wg0"
WG_PORT="${VPN_WG_PORT:-51820}"
WG_SUBNET="10.8.1.0/24"
WG_SERVER_IP="10.8.1.1"
WG_DIR="/etc/wireguard"

# 1. Install WireGuard
echo "[wg] Installing WireGuard..."
apt-get update -qq
apt-get install -y wireguard wireguard-tools

# 2. Generate server keys if they don't exist
mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"

if [ ! -f "$WG_DIR/server.key" ]; then
  echo "[wg] Generating server key pair..."
  wg genkey | tee "$WG_DIR/server.key" | wg pubkey > "$WG_DIR/server.pub"
  chmod 600 "$WG_DIR/server.key"
else
  echo "[wg] Server keys already exist — reusing."
fi

SERVER_PRIV=$(cat "$WG_DIR/server.key")
SERVER_PUB=$(cat "$WG_DIR/server.pub")

# 3. Detect WAN interface
WAN_IF=$(ip route | awk '/^default/{print $5; exit}')
[ -n "$WAN_IF" ] || { echo "ERROR: Could not detect WAN interface."; exit 1; }
echo "[wg] WAN interface: $WAN_IF"

# 4. Write base WireGuard config (Interface section only — peers are synced separately)
cat > "$WG_DIR/$WG_IF.conf" << EOF
[Interface]
PrivateKey = $SERVER_PRIV
Address = $WG_SERVER_IP/24
ListenPort = $WG_PORT
PostUp   = iptables -I FORWARD 1 -i $WG_IF -j ACCEPT; iptables -I FORWARD 2 -o $WG_IF -j ACCEPT; iptables -t nat -A POSTROUTING -s $WG_SUBNET -o $WAN_IF -j MASQUERADE
PostDown = iptables -D FORWARD -i $WG_IF -j ACCEPT; iptables -D FORWARD -o $WG_IF -j ACCEPT; iptables -t nat -D POSTROUTING -s $WG_SUBNET -o $WAN_IF -j MASQUERADE
EOF
chmod 600 "$WG_DIR/$WG_IF.conf"

# 5. Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1
grep -q "net.ipv4.ip_forward" /etc/sysctl.conf 2>/dev/null \
  && sed -i 's/.*net.ipv4.ip_forward.*/net.ipv4.ip_forward=1/' /etc/sysctl.conf \
  || echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf

# 6. Allow forwarding from Docker container to WireGuard subnet (for the proxy)
iptables -C FORWARD -d 10.8.1.0/24 -j ACCEPT 2>/dev/null \
  || iptables -I FORWARD 1 -d 10.8.1.0/24 -j ACCEPT
iptables -C FORWARD -s 10.8.1.0/24 -j ACCEPT 2>/dev/null \
  || iptables -I FORWARD 2 -s 10.8.1.0/24 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save
elif [ -d /etc/iptables ]; then
  iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
fi

# 7. Enable and start WireGuard
systemctl enable wg-quick@$WG_IF
systemctl restart wg-quick@$WG_IF || wg-quick up $WG_IF

# 8. Create peer-sync script (run this whenever new routers are added)
cat > /usr/local/bin/arofi-wg-sync << 'SYNC_EOF'
#!/bin/sh
# Syncs WireGuard peers from AROFi API. Run after adding new routers.
# Can also be added to cron: * * * * * /usr/local/bin/arofi-wg-sync

API_URL="${AROFI_API_URL:-https://app.arofi.net}"
API_KEY="${AROFI_ADMIN_TOKEN:-}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: Set AROFI_ADMIN_TOKEN to a valid admin JWT before running peer sync."
  exit 1
fi

PEERS=$(curl -sf -H "Authorization: Bearer $API_KEY" "$API_URL/api/routers/wireguard-config")
if [ -z "$PEERS" ]; then
  echo "No peers returned from API (no routers with WireGuard configured yet)."
  exit 0
fi

echo "$PEERS" > /tmp/arofi-wg-peers.conf
wg syncconf wg0 /tmp/arofi-wg-peers.conf
echo "[wg-sync] Peers updated: $(echo "$PEERS" | grep -c '\[Peer\]') peer(s)."
SYNC_EOF
chmod +x /usr/local/bin/arofi-wg-sync

echo ""
echo "=============================================="
echo "WireGuard VPN Server deployed on UDP port $WG_PORT"
echo ""
echo "  SERVER PUBLIC KEY:"
echo "  $SERVER_PUB"
echo ""
echo "  *** Copy the public key above and set it as: ***"
echo "  VPN_WG_SERVER_PUBKEY=$SERVER_PUB"
echo "  in your Coolify environment variables, then redeploy."
echo ""
echo "  To sync peers after adding new routers:"
echo "  AROFI_ADMIN_TOKEN=<jwt> /usr/local/bin/arofi-wg-sync"
echo "=============================================="
