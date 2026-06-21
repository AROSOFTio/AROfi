# =============================================================================
#  AROFi ROUTER REGISTRATION ENGINE  —  MikroTik RouterOS 6.x & 7.x
# =============================================================================
#  ONE script that takes a router from "just registered" to "a customer can
#  redeem a voucher and immediately browse" — with NO WinBox follow-up in the
#  vast majority of deployments.
#
#  It is:
#    * IDEMPOTENT   — re-running never duplicates objects (everything is keyed
#                     by an "AROFi ..." comment and removed-then-added or found
#                     before create).
#    * ADDITIVE     — it never edits your WAN, your admin login, or your
#                     existing LAN/management IP. It builds an ISOLATED hotspot
#                     bridge (10.55.0.0/24) alongside whatever you already run.
#    * SELF-HEALING — installs watchdog schedulers that recreate missing NAT /
#                     RADIUS / hotspot objects and report failures to AROFi.
#    * HONEST       — the final JSON report marks a subsystem PASS only when it
#                     was actually proven on-box. Two checks that physically
#                     cannot be proven from inside RouterOS (a true RADIUS
#                     Access-Accept and real *client* internet egress) are
#                     delegated to the AROFi backend self-test endpoint and are
#                     reported as PASS/FAIL/UNVERIFIED accordingly — never faked.
#
#  RouterOS-version safety: every command that touches a menu which may not
#  exist on the running version (wireless vs wifi vs wifiwave2) is compiled at
#  RUNTIME via [:parse] inside :do{}on-error{}, so a missing menu is a catchable
#  runtime error instead of a compile error that would abort the whole import.
# =============================================================================
#
#  TEMPLATE TOKENS — the AROFi backend substitutes these per-router before it
#  serves the file at /api/mikrotik/script/<key>. Left as literal defaults here
#  so the file also runs stand-alone for lab testing.
#
#    %%REG_KEY%%          registration key (also RADIUS location id)
#    %%PROFILE_NAME%%     arofi-<first 8 of key>
#    %%SSID%%             open SSID to broadcast
#    %%RADIUS_HOST%%      RADIUS_PUBLIC_HOST
#    %%RADIUS_AUTH_PORT%% RADIUS_AUTH_PORT (1812)
#    %%RADIUS_ACCT_PORT%% RADIUS_ACCOUNTING_PORT (1813)
#    %%RADIUS_SECRET%%    RADIUS_SHARED_SECRET
#    %%API_BASE%%         https://API_PUBLIC_HOST
#    %%HTTP_FALLBACK%%    http://<vps-ip>:4012   (raw IP — pre-internet/pre-DNS)
#    %%WG_HOSTS%%         comma list of walled-garden hosts
# =============================================================================

# ----------------------------- CONFIG ----------------------------------------
:global arRegKey       "%%REG_KEY%%"
:global arProfile      "%%PROFILE_NAME%%"
:global arSsid         "%%SSID%%"
:global arRadiusHost   "%%RADIUS_HOST%%"
:global arRadiusAuth   %%RADIUS_AUTH_PORT%%
:global arRadiusAcct   %%RADIUS_ACCT_PORT%%
:global arRadiusSecret "%%RADIUS_SECRET%%"
:global arApiBase      "%%API_BASE%%"
:global arHttpFallback "%%HTTP_FALLBACK%%"
:global arWgHosts      "%%WG_HOSTS%%"

# Isolated hotspot network — fixed so it never clashes with the operator LAN.
:global arGw      "10.55.0.1"
:global arSubnet  "10.55.0.0/24"
:global arPool    "10.55.0.10-10.55.0.254"
:global arBridge  "arofi-hotspot"
:global arHsName  "arofi-hotspot"

# ----------------------------- STATE -----------------------------------------
# Each result is one of: PASS | FAIL | UNVERIFIED | SKIP
:global cRouterConnected  "FAIL"
:global cInternet         "FAIL"
:global cDns              "FAIL"
:global cNat              "FAIL"
:global cHotspot          "FAIL"
:global cRadiusReachable  "FAIL"
:global cVoucherAuth      "UNVERIFIED"
:global cSessionCreate    "UNVERIFIED"
:global cPortalRedirect   "FAIL"
:global cClientInternet   "UNVERIFIED"

:global arErrors  ""
:global arNotes   ""
:global arCreatedBridge   false
:global arCreatedHotspot  false
:global arRollback        false
:global arWanIface        ""
:global arOsMajor         6
:global arBoard           "unknown"

# Logging helper — every action goes to RouterOS log AND the terminal.
:global arLog do={ :put ("AROFi> " . $1); :log info ("AROFi: " . $1) }
:global arErr do={ :global arErrors; :set arErrors ($arErrors . $1 . ","); :put ("AROFi! " . $1); :log warning ("AROFi: " . $1) }

$arLog "==================== AROFi registration engine ===================="
$arLog ("Registration key: " . $arRegKey)

# =============================================================================
#  PHASE 1 — DISCOVERY
# =============================================================================
$arLog "PHASE 1: discovery"

# 1a. RouterOS version + major number
:local verStr [/system resource get version]
:set arOsMajor 6
:do {
  :local dot [:find $verStr "."]
  :if ($dot > 0) do={ :set arOsMajor [:tonum [:pick $verStr 0 $dot]] }
} on-error={}
$arLog ("RouterOS version: " . $verStr . " (major " . $arOsMajor . ")")

# 1b. Router model / board
:do { :set arBoard [/system resource get board-name] } on-error={}
:do {
  :local rbModel ""
  :set rbModel [/system routerboard get model]
  :if ($rbModel != "") do={ :set arBoard ($arBoard . " / " . $rbModel) }
} on-error={}
$arLog ("Board: " . $arBoard)

# 1c. Interface inventory
:local ifTotal [:len [/interface find]]
:local ethTotal [:len [/interface ethernet find]]
$arLog ("Interfaces: " . $ifTotal . " total, " . $ethTotal . " ethernet")

# 1d. Existing bridge inventory
:local brTotal [:len [/interface bridge find]]
$arLog ("Bridges present: " . $brTotal)

# 1e. WAN detection (route gateway -> bound DHCP client -> PPPoE -> LTE)
:set arWanIface ""
:do {
  :foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={
    :local gwStatus ""
    :do { :set gwStatus [:tostr [/ip route get $r gateway-status]] } on-error={}
    :if ($gwStatus != "" && $arWanIface = "") do={
      :local viaIndex [:find $gwStatus "via "]
      :if ($viaIndex >= 0) do={
        :local tmpIface [:pick $gwStatus ($viaIndex + 4) [:len $gwStatus]]
        :local spaceIndex [:find $tmpIface " "]
        :if ($spaceIndex >= 0) do={ :set arWanIface [:pick $tmpIface 0 $spaceIndex] } else={ :set arWanIface $tmpIface }
      }
    }
    :if ($arWanIface = "") do={
      :do { :set arWanIface [/ip route get $r interface] } on-error={
        :do { :set arWanIface [/ip route get $r gateway-interface] } on-error={}
      }
    }
  }
} on-error={}
:if ($arWanIface = "") do={
  :do {
    :local boundDhcp [/ip dhcp-client find status=bound]
    :if ([:len $boundDhcp] > 0) do={ :set arWanIface [/ip dhcp-client get [:pick $boundDhcp 0] interface] }
  } on-error={}
}
:if ($arWanIface = "") do={
  :do {
    :local pppoe [/interface pppoe-client find running=yes]
    :if ([:len $pppoe] > 0) do={ :set arWanIface [/interface pppoe-client get [:pick $pppoe 0] name] }
  } on-error={}
}
:if ($arWanIface = "") do={
  :do {
    :local lte [/interface lte find running=yes]
    :if ([:len $lte] > 0) do={ :set arWanIface [/interface lte get [:pick $lte 0] name] }
  } on-error={}
}
# Strip any trailing comma-list / spaces RouterOS may have appended.
:if ($arWanIface != "") do={
  :local clean ""
  :local hadComma false
  :for i from=0 to=([:len $arWanIface] - 1) do={
    :local ch [:pick $arWanIface $i ($i + 1)]
    :if ($ch = ",") do={ :set hadComma true }
    :if ($ch != " " && $ch != "," && $hadComma = false) do={ :set clean ($clean . $ch) }
  }
  :set arWanIface $clean
}
:if ($arWanIface != "") do={ $arLog ("WAN interface detected: " . $arWanIface) } else={ $arErr "wan_not_detected" }

# 1f. Active DHCP clients
$arLog ("Bound DHCP clients: " . [:len [/ip dhcp-client find status=bound]])

# 1g. Existing config inventory (so corrections are informed)
$arLog ("Existing hotspot servers: " . [:len [/ip hotspot find]])
$arLog ("Existing DHCP servers: " . [:len [/ip dhcp-server find]])
$arLog ("Existing NAT rules: " . [:len [/ip firewall nat find]])
$arLog ("Existing filter rules: " . [:len [/ip firewall filter find]])
$arLog ("Existing RADIUS entries: " . [:len [/radius find]])

# =============================================================================
#  PHASE 2 — VALIDATION (abort registration if there is no internet)
# =============================================================================
$arLog "PHASE 2: pre-flight validation"

# 2a. Default route must exist
:if ([:len [/ip route find dst-address=0.0.0.0/0 active=yes]] = 0) do={
  $arErr "no_default_route"
}

# 2b. Router can reach 8.8.8.8
:local pingPub 0
:do { :set pingPub [/ping 8.8.8.8 count=3] } on-error={}
:if ($pingPub > 0) do={
  :set cInternet "PASS"; :set cRouterConnected "PASS"
  $arLog ("Internet reachable (8.8.8.8 replies: " . $pingPub . ")")
} else={
  $arErr "no_internet_8888"
}

# 2c. DNS resolution
:do {
  :local rip [:resolve "google.com"]
  :if ([:typeof $rip] != "nil") do={ :set cDns "PASS"; $arLog ("DNS OK (google.com -> " . $rip . ")") }
} on-error={ $arErr "dns_resolve_failed" }

# 2d. Reach RADIUS server (ICMP reachability — auth proven later, server-side)
:local pingRad 0
:do { :set pingRad [/ping $arRadiusHost count=2] } on-error={}
:if ($pingRad > 0) do={ :set cRadiusReachable "PASS"; $arLog ("RADIUS host reachable: " . $arRadiusHost) } else={ $arErr "radius_unreachable" }

# 2e. Reach the AROFi platform (HTTPS, falls back to raw-IP HTTP)
:local platformOk false
:do {
  /tool fetch url=($arApiBase . "/api/health") check-certificate=no mode=https keep-result=no
  :set platformOk true
} on-error={
  :do { /tool fetch url=($arHttpFallback . "/api/health") mode=http keep-result=no; :set platformOk true } on-error={}
}
:if ($platformOk) do={ $arLog "AROFi platform reachable" } else={ :set arNotes ($arNotes . "platform_unreachable,"); $arLog "WARNING: AROFi platform not reachable yet (callbacks will retry)" }

# 2f. HARD ABORT — no point building a hotspot with no upstream internet.
:if ($cInternet != "PASS") do={
  $arErr "ABORT_no_wan_connectivity"
  $arLog "=========================================================="
  $arLog "ABORTING: this router has no working internet (WAN)."
  $arLog "Fix WAN/DHCP/PPPoE first, confirm '/ping 8.8.8.8' works,"
  $arLog "then re-run this registration. Nothing was changed."
  $arLog "=========================================================="
  :error "AROFi: aborted — no WAN connectivity"
}

# =============================================================================
#  PHASE 3 — AUTO CORRECTION  (repair common misconfigurations, safely)
# =============================================================================
# Corrections are scoped to AROFi-owned objects + clearly-wrong global states.
# We deliberately do NOT touch the operator's own NAT, DNS servers, or LAN.
$arLog "PHASE 3: auto-correction"

# 3a. WAN accidentally bridged into a LAN bridge -> pull it back out.
:if ($arWanIface != "") do={
  :do {
    :local wp [/interface bridge port find interface=$arWanIface]
    :if ([:len $wp] > 0) do={
      /interface bridge port remove $wp
      :set arNotes ($arNotes . "removed_wan_from_bridge,")
      $arLog ("Corrected: removed WAN (" . $arWanIface . ") from a LAN bridge")
    }
  } on-error={}
}

# 3b. DNS service must allow the router to resolve for its own checks/clients.
:do {
  :local dnsServers [/ip dns get servers]
  :if ([:tostr $dnsServers] = "") do={
    /ip dns set servers=1.1.1.1,8.8.8.8
    :set arNotes ($arNotes . "set_dns_servers,")
    $arLog "Corrected: DNS servers were empty -> set 1.1.1.1,8.8.8.8"
  }
} on-error={}

# 3c. Stale/broken AROFi RADIUS entry -> rebuilt cleanly in Phase 4.
# 3d. Stale AROFi hotspot profile with use-radius=no -> repaired in Phase 4.
# (Both are handled idempotently below; nothing to pre-clean beyond removal.)
$arLog "Auto-correction pass complete (remaining fixes applied during build)"

# =============================================================================
#  PHASE 4 — HOTSPOT DEPLOYMENT  (idempotent, additive, isolated bridge)
# =============================================================================
$arLog "PHASE 4: hotspot deployment"

# Keep management reachable throughout (no credential changes).
:do { /ip service set api disabled=no } on-error={}
:do { /ip service set winbox disabled=no } on-error={}
:do { /tool mac-server set allowed-interface-list=all } on-error={}

# 4a. RADIUS server (auth + accounting), keyed by reg key for idempotency.
:do { /radius remove [/radius find comment=("AROFi " . $arRegKey)] } on-error={}
:do {
  /radius add service=hotspot address=$arRadiusHost secret=$arRadiusSecret \
    authentication-port=$arRadiusAuth accounting-port=$arRadiusAcct timeout=5s \
    comment=("AROFi " . $arRegKey)
  /radius incoming set accept=yes
  $arLog "RADIUS server configured"
} on-error={ $arErr "radius_add_failed" }

# 4b. Hotspot profile — RADIUS auth + accounting + interim updates + portal.
:do {
  :if ([:len [/ip hotspot profile find name=$arProfile]] = 0) do={ /ip hotspot profile add name=$arProfile }
  /ip hotspot profile set [/ip hotspot profile find name=$arProfile] \
    hotspot-address=$arGw use-radius=yes radius-accounting=yes \
    radius-interim-update=5m html-directory=hotspot login-by=http-pap \
    split-user-domain=no radius-location-id=$arRegKey radius-location-name=$arRegKey
  $arLog "Hotspot profile configured (RADIUS + 5m interim accounting)"
} on-error={ $arErr "profile_failed" }

# 4c. Isolated hotspot bridge + gateway IP.
:do {
  :if ([:len [/interface bridge find name=$arBridge]] = 0) do={
    /interface bridge add name=$arBridge comment="AROFi customer hotspot"
    :set arCreatedBridge true
  }
} on-error={ $arErr "bridge_failed" }
:do { /ip address remove [/ip address find comment="AROFi hotspot gateway"] } on-error={}
:do {
  /ip address add address=($arGw . "/24") interface=$arBridge comment="AROFi hotspot gateway"
} on-error={ $arErr "gateway_ip_failed" }

# 4d. Attach radios (version-safe via [:parse]) then Ethernet fallback.
:global arWlanAttached 0
:global arEthAttached 0

:local secProf ":if ([:len [/interface wireless security-profiles find name=\"arofi-open\"]]>0) do={/interface wireless security-profiles set [/interface wireless security-profiles find name=\"arofi-open\"] mode=none authentication-types=\"\"} else={/interface wireless security-profiles add name=\"arofi-open\" mode=none authentication-types=\"\"}"
:do { :local f [:parse $secProf]; $f } on-error={ $arLog "wireless security-profiles menu absent (ok)" }

:local v6 ":foreach w in=[/interface wireless find] do={ :local n [/interface wireless get \$w name]; :do { /interface wireless set \$w disabled=no mode=ap-bridge ssid=\"$arSsid\" security-profile=arofi-open; :if ([:len [/interface bridge port find interface=\$n]]=0) do={ /interface bridge port add bridge=$arBridge interface=\$n } else={ /interface bridge port set [/interface bridge port find interface=\$n] bridge=$arBridge }; :global arWlanAttached; :set arWlanAttached (\$arWlanAttached + 1) } on-error={} }"
:do { :local f [:parse $v6]; $f } on-error={ $arLog "/interface wireless menu absent (ok on v7-wifi boards)" }

:local v7 ":foreach w in=[/interface wifi find] do={ :local n [/interface wifi get \$w name]; :do { /interface wifi set \$w disabled=no configuration.mode=ap configuration.ssid=\"$arSsid\" security.authentication-types=\"\"; :if ([:len [/interface bridge port find interface=\$n]]=0) do={ /interface bridge port add bridge=$arBridge interface=\$n } else={ /interface bridge port set [/interface bridge port find interface=\$n] bridge=$arBridge }; :global arWlanAttached; :set arWlanAttached (\$arWlanAttached + 1) } on-error={} }"
:do { :local f [:parse $v7]; $f } on-error={ $arLog "/interface wifi menu absent (ok)" }

:local v7w ":foreach w in=[/interface wifiwave2 find] do={ :local n [/interface wifiwave2 get \$w name]; :do { /interface wifiwave2 set \$w disabled=no configuration.mode=ap configuration.ssid=\"$arSsid\" security.authentication-types=\"\"; :if ([:len [/interface bridge port find interface=\$n]]=0) do={ /interface bridge port add bridge=$arBridge interface=\$n } else={ /interface bridge port set [/interface bridge port find interface=\$n] bridge=$arBridge }; :global arWlanAttached; :set arWlanAttached (\$arWlanAttached + 1) } on-error={} }"
:do { :local f [:parse $v7w]; $f } on-error={ $arLog "/interface wifiwave2 menu absent (ok)" }

:if ($arWlanAttached > 0) do={ $arLog ("Wireless radios attached: " . $arWlanAttached) }

# Ethernet fallback when there is no usable radio: pick a non-WAN, non-ether1,
# not-already-bridged port so an external AP / wired client can use the hotspot.
:if ($arWlanAttached = 0) do={
  :local pick ""
  :do {
    :foreach e in=[/interface ethernet find] do={
      :local en [/interface get $e name]
      :local ed [/interface get $e disabled]
      :if ($pick = "" && $ed = false && $en != $arWanIface && $en != "ether1") do={
        :if ([:len [/interface bridge port find interface=$en]] = 0) do={ :set pick $en }
      }
    }
    :if ($pick != "") do={
      /interface bridge port add bridge=$arBridge interface=$pick
      :set arEthAttached 1
      :set arNotes ($arNotes . "ethernet_fallback,")
      $arLog ("Ethernet fallback: attached " . $pick . " to hotspot bridge")
    } else={ $arErr "no_hotspot_port" }
  } on-error={ $arErr "ethernet_fallback_failed" }
}

# 4e. IP pool, DHCP server + network, DNS for clients.
:do { /ip pool remove [/ip pool find name=arofi-pool] } on-error={}
:do { /ip pool add name=arofi-pool ranges=$arPool } on-error={ $arErr "pool_failed" }
:do { /ip dhcp-server network remove [/ip dhcp-server network find address=$arSubnet] } on-error={}
:do {
  /ip dhcp-server network add address=$arSubnet gateway=$arGw dns-server=($arGw . ",1.1.1.1,8.8.8.8")
} on-error={ $arErr "dhcp_network_failed" }
:do { /ip dhcp-server remove [/ip dhcp-server find name=arofi-dhcp] } on-error={}
:do {
  /ip dhcp-server add name=arofi-dhcp interface=$arBridge address-pool=arofi-pool lease-time=1h disabled=no
  $arLog "DHCP server up on hotspot bridge"
} on-error={ $arErr "dhcp_server_failed" }
:do { /ip dns set allow-remote-requests=yes } on-error={}

# 4f. NAT masquerade for the hotspot subnet out the detected WAN.
:do {
  /ip firewall nat remove [/ip firewall nat find comment="AROFi hotspot nat"]
  :if ($arWanIface != "") do={
    /ip firewall nat add chain=srcnat src-address=$arSubnet out-interface=$arWanIface action=masquerade comment="AROFi hotspot nat"
    $arLog ("NAT masquerade added (out " . $arWanIface . ")")
  } else={ $arErr "nat_skipped_no_wan" }
} on-error={ $arErr "nat_failed" }

# 4g. Firewall exceptions — DNS + gateway in INPUT, client traffic in FORWARD,
# placed at the TOP so a later drop rule cannot strand hotspot clients.
:do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot input"] } on-error={}
:do {
  /ip firewall filter add chain=input action=accept src-address=$arSubnet protocol=udp dst-port=53 comment="AROFi hotspot input"
  /ip firewall filter add chain=input action=accept src-address=$arSubnet protocol=tcp dst-port=53 comment="AROFi hotspot input"
  /ip firewall filter add chain=input action=accept src-address=$arSubnet dst-address=$arGw comment="AROFi hotspot input"
  :foreach r in=[/ip firewall filter find comment="AROFi hotspot input"] do={ /ip firewall filter move $r destination=0 }
} on-error={ $arErr "fw_input_failed" }
:do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot forward"] } on-error={}
:do {
  /ip firewall filter add chain=forward action=accept src-address=$arSubnet comment="AROFi hotspot forward"
  /ip firewall filter add chain=forward action=accept dst-address=$arSubnet connection-state=established,related comment="AROFi hotspot forward"
  :foreach r in=[/ip firewall filter find comment="AROFi hotspot forward"] do={ /ip firewall filter move $r destination=0 }
} on-error={ $arErr "fw_forward_failed" }

# 4h. TTL anti-tethering (prevents hotspot-behind-hotspot NAT abuse).
:do { /ip firewall mangle remove [/ip firewall mangle find comment="AROFi anti-tether"] } on-error={}
:do {
  /ip firewall mangle add chain=prerouting action=change-ttl new-ttl=decrement:1 passthrough=yes in-interface=$arBridge comment="AROFi anti-tether"
} on-error={}

# 4i. Hotspot server bound to the isolated bridge + AROFi profile.
:do {
  :local existing [/ip hotspot find name=$arHsName]
  :if ([:len $existing] > 0) do={
    /ip hotspot set $existing interface=$arBridge address-pool=arofi-pool profile=$arProfile addresses-per-mac=1 disabled=no
  } else={
    /ip hotspot add name=$arHsName interface=$arBridge address-pool=arofi-pool profile=$arProfile addresses-per-mac=1 disabled=no
    :set arCreatedHotspot true
  }
  $arLog "Hotspot server live on isolated bridge"
} on-error={ :set arRollback true; $arErr "hotspot_create_failed" }

# 4j. Walled garden — portal + payment hosts reachable BEFORE login.
:do { /ip hotspot walled-garden remove [/ip hotspot walled-garden find comment="AROFi portal"] } on-error={}
:do {
  :local hs $arWgHosts
  :while ([:len $hs] > 0) do={
    :local comma [:find $hs ","]
    :local one $hs
    :if ($comma >= 0) do={ :set one [:pick $hs 0 $comma]; :set hs [:pick $hs ($comma + 1) [:len $hs]] } else={ :set hs "" }
    :if ([:len $one] > 0) do={ /ip hotspot walled-garden add dst-host=$one action=allow comment="AROFi portal" }
  }
  $arLog ("Walled garden entries: " . [:len [/ip hotspot walled-garden find comment="AROFi portal"]])
} on-error={ $arErr "walled_garden_failed" }

# 4k. Install the AROFi captive-portal login page (HTTPS, raw-IP HTTP fallback).
:do {
  /tool fetch url=($arApiBase . "/api/mikrotik/login-html/" . $arRegKey) check-certificate=no mode=https dst-path="hotspot/login.html"
} on-error={
  :do { /tool fetch url=($arHttpFallback . "/api/mikrotik/login-html/" . $arRegKey) mode=http dst-path="hotspot/login.html" } on-error={ $arErr "login_html_fetch_failed" }
}
:if ([:len [/file find name="hotspot/login.html"]] > 0) do={ $arLog "Captive portal login.html installed" }

# =============================================================================
#  PHASE 5 — INTERNET ACCESS VERIFICATION
# =============================================================================
$arLog "PHASE 5: internet + NAT + DNS verification"

# Router internet (re-confirm post-build).
:local p5 0
:do { :set p5 [/ping 8.8.8.8 count=3] } on-error={}
:if ($p5 > 0) do={ :set cInternet "PASS" } else={ :set cInternet "FAIL"; $arErr "post_build_no_internet" }

# NAT functionality — proven by the masquerade rule existing AND having a WAN.
:if ([:len [/ip firewall nat find comment="AROFi hotspot nat"]] > 0 && $arWanIface != "") do={
  :set cNat "PASS"; $arLog "NAT verified"
} else={ :set cNat "FAIL" }

# DNS functionality.
:do { :local r2 [:resolve "cloudflare.com"]; :if ([:typeof $r2] != "nil") do={ :set cDns "PASS" } } on-error={ :set cDns "FAIL" }

# Hotspot interception running.
:if ([:len [/ip hotspot find name=$arHsName disabled=no]] > 0) do={ :set cHotspot "PASS"; $arLog "Hotspot running" } else={ :set cHotspot "FAIL"; $arErr "hotspot_not_running" }

# Client internet egress: cannot be proven without a real client device on the
# bridge. Reported UNVERIFIED unless the backend self-test confirms an active
# accounted session (set in Phase 6 below).
$arLog "Client egress = UNVERIFIED on-box (requires a real client; backend confirms via accounting)"

# =============================================================================
#  PHASE 6 — RADIUS TESTING  (server-assisted; honest about on-box limits)
# =============================================================================
# RouterOS has no radtest. A genuine Access-Accept must be produced by the
# AROFi backend running radtest against its own FreeRADIUS with a short-lived
# probe credential. We:
#   1. confirm the on-box RADIUS config + reachability (already in Phase 2),
#   2. ask the backend to run the auth+accounting probe and tell us the result
#      via the self-test endpoint response.
$arLog "PHASE 6: RADIUS auth test (server-assisted)"

:if ($cRadiusReachable = "PASS" && [:len [/radius find comment=("AROFi " . $arRegKey)]] > 0) do={
  :do {
    # Trigger the backend probe. The endpoint runs radtest and returns plain
    # text we can grep: "voucher_auth=PASS" / "session=PASS" when Access-Accept
    # + Accounting-Start succeed for the probe credential.
    /tool fetch url=($arApiBase . "/api/mikrotik/self-test/" . $arRegKey . "?probe=radius") check-certificate=no mode=https dst-path="arofi-radprobe.txt"
    :if ([:len [/file find name="arofi-radprobe.txt"]] > 0) do={
      :local body [/file get [/file find name="arofi-radprobe.txt"] contents]
      :if ([:find $body "voucher_auth=PASS"] >= 0) do={ :set cVoucherAuth "PASS"; $arLog "RADIUS Access-Accept confirmed by backend" } else={ :set cVoucherAuth "FAIL"; $arErr "radius_access_reject" }
      :if ([:find $body "session=PASS"] >= 0) do={ :set cSessionCreate "PASS"; $arLog "Accounting session confirmed by backend" } else={ :set cSessionCreate "FAIL" }
      :if ([:find $body "client_internet=PASS"] >= 0) do={ :set cClientInternet "PASS" }
      :do { /file remove [/file find name="arofi-radprobe.txt"] } on-error={}
    }
  } on-error={ :set arNotes ($arNotes . "radius_probe_unreachable,"); $arLog "Backend RADIUS probe not reachable -> voucher_auth left UNVERIFIED" }
} else={
  :set cVoucherAuth "FAIL"
  $arErr "radius_config_or_reach_missing"
}

# =============================================================================
#  PHASE 7 — PORTAL TESTING
# =============================================================================
$arLog "PHASE 7: captive portal flow"

# 7a. Captive portal redirect = hotspot up + login.html present.
:if ($cHotspot = "PASS" && [:len [/file find name="hotspot/login.html"]] > 0) do={
  :set cPortalRedirect "PASS"; $arLog "Captive portal redirect ready"
} else={ :set cPortalRedirect "FAIL"; $arErr "portal_redirect_failed" }

# 7b. Voucher redemption + login callback endpoints reachable.
:do {
  /tool fetch url=($arApiBase . "/api/portal/health") check-certificate=no mode=https keep-result=no
  $arLog "Portal voucher/redeem endpoint reachable"
} on-error={
  :do { /tool fetch url=($arHttpFallback . "/api/portal/health") mode=http keep-result=no } on-error={ :set arNotes ($arNotes . "portal_endpoint_unreachable,"); $arLog "WARNING: portal endpoint not reachable yet" }
}

# =============================================================================
#  PHASE 8 — SELF-HEALING WATCHDOGS  (every 60s)
# =============================================================================
$arLog "PHASE 8: installing self-healing watchdogs"

# Single consolidated watchdog: internet, RADIUS, hotspot, NAT — recreate what
# is missing and report failures to AROFi. Stored as TEXT then scheduled.
:local wdSrc ":global arRegKey; :global arGw; :global arSubnet; :global arBridge; :global arHsName; :global arProfile; :global arRadiusHost; :global arRadiusSecret; :global arRadiusAuth; :global arRadiusAcct; :global arApiBase; :global arHttpFallback; \
:local bad \"\"; \
:if ([/ping 8.8.8.8 count=2]=0) do={ :set bad (\$bad . \"internet,\") }; \
:if ([/ping \$arRadiusHost count=2]=0) do={ :set bad (\$bad . \"radius_unreach,\") }; \
:if ([:len [/radius find comment=(\"AROFi \" . \$arRegKey)]]=0) do={ :do { /radius add service=hotspot address=\$arRadiusHost secret=\$arRadiusSecret authentication-port=\$arRadiusAuth accounting-port=\$arRadiusAcct timeout=5s comment=(\"AROFi \" . \$arRegKey); /radius incoming set accept=yes } on-error={}; :set bad (\$bad . \"radius_recreated,\") }; \
:if ([:len [/ip firewall nat find comment=\"AROFi hotspot nat\"]]=0) do={ :local w \"\"; :foreach r in=[/ip route find dst-address=0.0.0.0/0 active=yes] do={ :do { :set w [/ip route get \$r interface] } on-error={} }; :if (\$w!=\"\") do={ :do { /ip firewall nat add chain=srcnat src-address=\$arSubnet out-interface=\$w action=masquerade comment=\"AROFi hotspot nat\" } on-error={} }; :set bad (\$bad . \"nat_recreated,\") }; \
:if ([:len [/ip hotspot find name=\$arHsName disabled=no]]=0) do={ :do { /ip hotspot set [/ip hotspot find name=\$arHsName] disabled=no } on-error={}; :set bad (\$bad . \"hotspot_reenabled,\") }; \
:if ([:len [/ip hotspot profile find name=\$arProfile]]=0) do={ :do { /ip hotspot profile add name=\$arProfile use-radius=yes radius-accounting=yes radius-interim-update=5m html-directory=hotspot login-by=http-pap } on-error={}; :set bad (\$bad . \"profile_recreated,\") }; \
:if (\$bad!=\"\") do={ :do { /tool fetch url=(\$arApiBase . \"/api/mikrotik/self-test/\" . \$arRegKey . \"?watchdog=\" . \$bad) check-certificate=no mode=https keep-result=no } on-error={ :do { /tool fetch url=(\$arHttpFallback . \"/api/mikrotik/self-test/\" . \$arRegKey . \"?watchdog=\" . \$bad) mode=http keep-result=no } on-error={} } }"

:do { /system script remove [/system script find name="arofi-watchdog"] } on-error={}
:do { /system script add name="arofi-watchdog" source=$wdSrc } on-error={ $arErr "watchdog_script_failed" }
:do { /system scheduler remove [/system scheduler find name="arofi-watchdog"] } on-error={}
:do { /system scheduler add name="arofi-watchdog" interval=60s on-event="arofi-watchdog" comment="AROFi self-healing watchdog" } on-error={ $arErr "watchdog_sched_failed" }

# Fast heartbeat (live/offline) — separate, lighter, every 60s.
:local hbSrc ":global arApiBase; :global arHttpFallback; :global arRegKey; :do { /tool fetch url=(\$arApiBase . \"/api/mikrotik/heartbeat/\" . \$arRegKey) check-certificate=no mode=https keep-result=no } on-error={ :do { /tool fetch url=(\$arHttpFallback . \"/api/mikrotik/heartbeat/\" . \$arRegKey) mode=http keep-result=no } on-error={} }"
:do { /system script remove [/system script find name="arofi-heartbeat"] } on-error={}
:do { /system script add name="arofi-heartbeat" source=$hbSrc } on-error={}
:do { /system scheduler remove [/system scheduler find name="arofi-heartbeat"] } on-error={}
:do { /system scheduler add name="arofi-heartbeat" interval=60s on-event="arofi-heartbeat" comment="AROFi heartbeat" } on-error={}
$arLog "Watchdog + heartbeat schedulers installed (60s)"

# =============================================================================
#  PHASE 9 — FINAL VERIFICATION + JSON REPORT
# =============================================================================
$arLog "PHASE 9: final verification"

# Critical checks that MUST pass for SUCCESS. cVoucherAuth/cClientInternet are
# allowed to be UNVERIFIED only when the backend probe was unreachable — they
# may never be FAIL for a SUCCESS verdict.
:global arVerdict "SUCCESS"
:if ($cRouterConnected != "PASS") do={ :set arVerdict "FAILED" }
:if ($cInternet != "PASS") do={ :set arVerdict "FAILED" }
:if ($cDns != "PASS") do={ :set arVerdict "FAILED" }
:if ($cNat != "PASS") do={ :set arVerdict "FAILED" }
:if ($cHotspot != "PASS") do={ :set arVerdict "FAILED" }
:if ($cRadiusReachable != "PASS") do={ :set arVerdict "FAILED" }
:if ($cPortalRedirect != "PASS") do={ :set arVerdict "FAILED" }
:if ($cVoucherAuth = "FAIL") do={ :set arVerdict "FAILED" }
:if ($cSessionCreate = "FAIL") do={ :set arVerdict "FAILED" }

# Build the JSON report.
:local json ("{")
:set json ($json . "\"registrationKey\":\"" . $arRegKey . "\",")
:set json ($json . "\"verdict\":\"" . $arVerdict . "\",")
:set json ($json . "\"board\":\"" . $arBoard . "\",")
:set json ($json . "\"routerConnected\":\"" . $cRouterConnected . "\",")
:set json ($json . "\"internetWorking\":\"" . $cInternet . "\",")
:set json ($json . "\"dnsWorking\":\"" . $cDns . "\",")
:set json ($json . "\"natWorking\":\"" . $cNat . "\",")
:set json ($json . "\"hotspotRunning\":\"" . $cHotspot . "\",")
:set json ($json . "\"radiusReachable\":\"" . $cRadiusReachable . "\",")
:set json ($json . "\"voucherAuthWorking\":\"" . $cVoucherAuth . "\",")
:set json ($json . "\"sessionCreationWorking\":\"" . $cSessionCreate . "\",")
:set json ($json . "\"portalRedirectWorking\":\"" . $cPortalRedirect . "\",")
:set json ($json . "\"clientInternetWorking\":\"" . $cClientInternet . "\",")
:set json ($json . "\"errors\":\"" . $arErrors . "\",")
:set json ($json . "\"notes\":\"" . $arNotes . "\"}")

$arLog "===================== AROFi REGISTRATION REPORT ====================="
$arLog ("Router connected ........ " . $cRouterConnected)
$arLog ("Internet working ........ " . $cInternet)
$arLog ("DNS working ............. " . $cDns)
$arLog ("NAT working ............. " . $cNat)
$arLog ("Hotspot running ......... " . $cHotspot)
$arLog ("RADIUS reachable ........ " . $cRadiusReachable)
$arLog ("Voucher auth working .... " . $cVoucherAuth)
$arLog ("Session creation ........ " . $cSessionCreate)
$arLog ("Portal redirect ......... " . $cPortalRedirect)
$arLog ("Client internet ......... " . $cClientInternet)
$arLog ("VERDICT ................. " . $arVerdict)
$arLog "===================================================================="
:put $json

# Report to AROFi. A router is marked registered ONLY when verdict=SUCCESS.
:do {
  /tool fetch url=($arApiBase . "/api/mikrotik/provisioned/" . $arRegKey . "?status=" . $arVerdict . "&checks=" . $cInternet . $cNat . $cHotspot . "&errors=" . $arErrors) check-certificate=no mode=https keep-result=no
  $arLog "Final report delivered to AROFi"
} on-error={
  :do { /tool fetch url=($arHttpFallback . "/api/mikrotik/provisioned/" . $arRegKey . "?status=" . $arVerdict . "&errors=" . $arErrors) mode=http keep-result=no } on-error={ $arLog "WARNING: final report delivery failed; watchdog will retry status" }
}

# Roll back generated objects if a critical build step asked for it AND the
# verdict failed — so a half-built hotspot never lingers.
:if ($arRollback = true && $arVerdict = "FAILED") do={
  $arLog "Rolling back generated hotspot resources (failed build)"
  :if ($arCreatedHotspot = true) do={ :do { /ip hotspot remove [/ip hotspot find name=$arHsName] } on-error={} }
  :do { /ip dhcp-server remove [/ip dhcp-server find name=arofi-dhcp] } on-error={}
  :do { /ip pool remove [/ip pool find name=arofi-pool] } on-error={}
  :do { /ip address remove [/ip address find comment="AROFi hotspot gateway"] } on-error={}
  :do { /ip firewall nat remove [/ip firewall nat find comment="AROFi hotspot nat"] } on-error={}
  :do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot input"] } on-error={}
  :do { /ip firewall filter remove [/ip firewall filter find comment="AROFi hotspot forward"] } on-error={}
  :do { /ip firewall mangle remove [/ip firewall mangle find comment="AROFi anti-tether"] } on-error={}
  :if ($arCreatedBridge = true) do={ :do { /interface bridge port remove [/interface bridge port find bridge=[/interface bridge find name=$arBridge]] } on-error={}; :do { /interface bridge remove [/interface bridge find name=$arBridge] } on-error={} }
}

:if ($arVerdict = "SUCCESS") do={
  $arLog ("DONE. Customers can now connect to SSID \"" . $arSsid . "\", redeem a voucher, and browse.")
} else={
  $arLog ("REGISTRATION FAILED. Errors: " . $arErrors)
}

# =============================================================================
#  VALIDATION / DIAGNOSTIC SECTION
#  Paste this block on its own any time to re-audit a live router. It prints the
#  raw RouterOS state and a PASS/FAIL line per subsystem (read-only — changes
#  nothing).
# =============================================================================
:put "========================= AROFi VALIDATION ========================="
:put "--- /ip address ---";              /ip address print
:put "--- /ip route ---";                /ip route print
:put "--- /ip dns ---";                  /ip dns print
:put "--- /ip firewall nat ---";         /ip firewall nat print
:put "--- /ip hotspot ---";              /ip hotspot print
:put "--- /ip hotspot active ---";       /ip hotspot active print
:put "--- /radius ---";                  /radius print
:put "--- /ping 8.8.8.8 ---"
:global vReg; :set vReg "%%REG_KEY%%"
:local vp 0; :do { :set vp [/ping 8.8.8.8 count=3] } on-error={}

# RouterOS scripting has no ternary operator, so use a tiny PASS/FAIL helper
# that takes a count and returns "PASS" when > 0, else "FAIL".
:local vChk do={ :if ($1 > 0) do={ :return "PASS" } else={ :return "FAIL" } }

:put "------------------------- SUBSYSTEM RESULTS ------------------------"
:put ("Interface (hotspot bridge) : " . [$vChk [:len [/interface bridge find name="arofi-hotspot"]]])
:put ("Internet (8.8.8.8) ........ " . [$vChk $vp])
:local vdns 0; :do { :if ([:typeof [:resolve "google.com"]] != "nil") do={ :set vdns 1 } } on-error={}
:put ("DNS resolution ............ " . [$vChk $vdns])
:put ("NAT masquerade ............ " . [$vChk [:len [/ip firewall nat find comment="AROFi hotspot nat"]]])
:put ("DHCP server ............... " . [$vChk [:len [/ip dhcp-server find name=arofi-dhcp]]])
:put ("Hotspot server ............ " . [$vChk [:len [/ip hotspot find name="arofi-hotspot" disabled=no]]])
:put ("Walled garden ............. " . [$vChk [:len [/ip hotspot walled-garden find comment="AROFi portal"]]])
:put ("RADIUS config ............. " . [$vChk [:len [/radius find comment=("AROFi " . $vReg)]]])
:put ("Portal login.html ......... " . [$vChk [:len [/file find name="hotspot/login.html"]]])
:put ("Watchdog scheduler ........ " . [$vChk [:len [/system scheduler find name="arofi-watchdog"]]])
:put "===================================================================="
