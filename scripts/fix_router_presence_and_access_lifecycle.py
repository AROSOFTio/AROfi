#!/usr/bin/env python3
"""Stabilize router presence and guarantee expiry logout behavior.

This final build patch keeps router status source-aware: heartbeat/probe signals
use a short window, while RADIUS accounting gets enough grace for its 60-second
interim interval. It also hardens the generated MikroTik heartbeat scheduler and
creates a disconnect attempt at package expiry even when the API-side live
session row has already gone stale.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ROUTERS = ROOT / "apps/api/src/modules/routers/routers.service.ts"
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
LIFECYCLE = ROOT / "apps/api/src/modules/radius/access-lifecycle.service.ts"
RADIUS_CREDENTIAL = ROOT / "apps/api/src/modules/radius/radius-credential.service.ts"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: expected one match, found {count}: {old[:160]!r}"
        )
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def regex_once(path: Path, pattern: str, replacement: str, *, sentinel: str) -> None:
    text = path.read_text(encoding="utf-8")
    if sentinel in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: expected one regex match, found {count}: {pattern[:160]!r}"
        )
    path.write_text(updated, encoding="utf-8")


def require(path: Path, marker: str, message: str) -> None:
    if marker not in path.read_text(encoding="utf-8"):
        raise RuntimeError(message)


# Router state: RADIUS interim updates arrive every 60 seconds. A shared
# 30-second OFFLINE window therefore creates false offline transitions.
replace_once(
    ROUTERS,
    """  private readonly routerLiveWindowSeconds = Number.parseInt(process.env.ROUTER_LIVE_WINDOW_SECONDS ?? '12', 10)
  private readonly routerStaleWindowSeconds = Number.parseInt(process.env.ROUTER_STALE_WINDOW_SECONDS ?? '30', 10)
  private readonly routerProbeIntervalMs = Number.parseInt(process.env.ROUTER_PROBE_INTERVAL_MS ?? '8000', 10)
""",
    """  private readonly configuredRouterLiveWindowSeconds = Math.max(
    1,
    Number.parseInt(process.env.ROUTER_LIVE_WINDOW_SECONDS ?? '12', 10) || 12,
  )
  private readonly configuredRouterStaleWindowSeconds = Math.max(
    this.configuredRouterLiveWindowSeconds + 1,
    Number.parseInt(process.env.ROUTER_STALE_WINDOW_SECONDS ?? '30', 10) || 30,
  )
  private readonly heartbeatIntervalSeconds = Math.max(
    1,
    Number.parseInt(process.env.ROUTER_HEARTBEAT_SECONDS ?? '5', 10) || 5,
  )
  private readonly routerProbeIntervalMs = Math.max(
    2_000,
    Number.parseInt(process.env.ROUTER_PROBE_INTERVAL_MS ?? '8000', 10) || 8_000,
  )
  private readonly routerLiveWindowSeconds = Math.max(
    this.configuredRouterLiveWindowSeconds,
    this.heartbeatIntervalSeconds * 4,
    Math.ceil(this.routerProbeIntervalMs / 1000) * 3,
    30,
  )
  private readonly routerStaleWindowSeconds = Math.max(
    this.configuredRouterStaleWindowSeconds,
    this.routerLiveWindowSeconds * 3,
    90,
  )
  private readonly accountingLiveWindowSeconds = Math.max(
    this.routerLiveWindowSeconds,
    90,
  )
  private readonly accountingStaleWindowSeconds = Math.max(
    this.routerStaleWindowSeconds,
    180,
  )
""",
)

replace_once(
    ROUTERS,
    """    const secondsSinceLastSignal = Math.max(0, Math.round((Date.now() - latest.at.getTime()) / 1000))
    if (secondsSinceLastSignal <= this.routerLiveWindowSeconds) {
""",
    """    const secondsSinceLastSignal = Math.max(0, Math.round((Date.now() - latest.at.getTime()) / 1000))
    const sourceWindows =
      latest.source === 'accounting' || latest.source === 'radius'
        ? {
            live: this.accountingLiveWindowSeconds,
            stale: this.accountingStaleWindowSeconds,
          }
        : {
            live: this.routerLiveWindowSeconds,
            stale: this.routerStaleWindowSeconds,
          }

    if (secondsSinceLastSignal <= sourceWindows.live) {
""",
)

replace_once(
    ROUTERS,
    """    if (secondsSinceLastSignal <= this.routerStaleWindowSeconds) {
""",
    """    if (secondsSinceLastSignal <= sourceWindows.stale) {
""",
)

# MikroTik heartbeat: use a sane cadence, explicitly keep it enabled, and add
# a watchdog that restores the scheduler after reboot or accidental changes.
regex_once(
    MIKROTIK,
    r"""  private buildHeartbeatScheduler\(heartbeatUrl: string, fallbackHeartbeatUrl: string\) \{.*?\n  \}\n\n  private buildProvisioningCallbackScript""",
    r'''  private buildHeartbeatScheduler(heartbeatUrl: string, fallbackHeartbeatUrl: string) {
    const configuredInterval = Number.parseInt(process.env.ROUTER_HEARTBEAT_SECONDS ?? '5', 10)
    const intervalSeconds = Number.isFinite(configuredInterval)
      ? Math.min(60, Math.max(5, configuredInterval))
      : 5
    const source =
      `:local arofiActiveUsers 0; ` +
      `:do { :set arofiActiveUsers [:len [/ip hotspot active find]] } on-error={}; ` +
      `:local arofiActiveMacs ""; ` +
      `:do { :foreach a in=[/ip hotspot active find] do={ :local m [/ip hotspot active get $a mac-address]; :if ($m != "") do={ :if ($arofiActiveMacs = "") do={ :set arofiActiveMacs $m } else={ :set arofiActiveMacs ($arofiActiveMacs . "," . $m) } } } } on-error={}; ` +
      `:local arofiHeartbeatUrl "${heartbeatUrl}?activeUsers=$arofiActiveUsers&activeMacs=$arofiActiveMacs"; ` +
      `:local arofiHeartbeatFallback "${fallbackHeartbeatUrl}?activeUsers=$arofiActiveUsers&activeMacs=$arofiActiveMacs"; ` +
      `:do { /tool fetch url=$arofiHeartbeatUrl check-certificate=no keep-result=no } ` +
      `on-error={ :do { /tool fetch url=$arofiHeartbeatFallback keep-result=no } on-error={} }`
    const watchdogSource =
      `:local hb [/system scheduler find where name="arofi-heartbeat"]; ` +
      `:if ([:len $hb] = 0) do={ ` +
      `/system scheduler add name="arofi-heartbeat" interval=${intervalSeconds}s on-event="arofi-heartbeat" disabled=no comment="AROFi heartbeat"; ` +
      `} else={ ` +
      `/system scheduler set $hb interval=${intervalSeconds}s on-event="arofi-heartbeat" disabled=no; ` +
      `}`

    return [
      `/system script remove [find name="arofi-heartbeat"]`,
      `/system script add name="arofi-heartbeat" source="${this.escapeScriptSource(source)}"`,
      `/system scheduler remove [find name="arofi-heartbeat"]`,
      `/system scheduler add name="arofi-heartbeat" interval=${intervalSeconds}s on-event="arofi-heartbeat" disabled=no comment="AROFi heartbeat"`,
      `/system script remove [find name="arofi-heartbeat-watchdog"]`,
      `/system script add name="arofi-heartbeat-watchdog" source="${this.escapeScriptSource(watchdogSource)}"`,
      `/system scheduler remove [find name="arofi-heartbeat-watchdog"]`,
      `/system scheduler add name="arofi-heartbeat-watchdog" interval=1m on-event="arofi-heartbeat-watchdog" disabled=no comment="AROFi heartbeat watchdog"`,
      `:do { /system script run "arofi-heartbeat" } on-error={}`,
    ]
  }

  private buildProvisioningCallbackScript''',
    sentinel="AROFi heartbeat watchdog",
)

# Expiry/quota logout: if accounting cleanup already marked the API-side
# session STALE, still create a real CoA/RouterOS logout from the activation's
# credential and linked router.
replace_once(
    LIFECYCLE,
    """    const sessions = await tx.networkSession.findMany({
      where: { activationId, status: SessionStatus.ACTIVE },
      include: { activation: { include: { radiusCredential: true } } },
    })

    for (const session of sessions) {
""",
    """    const sessions = await tx.networkSession.findMany({
      where: { activationId, status: SessionStatus.ACTIVE },
      include: { activation: { include: { radiusCredential: true } } },
    })

    const activation =
      sessions.length === 0
        ? await tx.packageActivation.findUnique({
            where: { id: activationId },
            include: { radiusCredential: true },
          })
        : null
    const fallbackRouterId =
      activation?.routerId ?? activation?.radiusCredential?.routerId ?? null
    const disconnectTargets =
      sessions.length > 0
        ? sessions
        : activation?.radiusCredential && fallbackRouterId
          ? [
              {
                id: null,
                tenantId: activation.tenantId,
                routerId: fallbackRouterId,
                username: activation.radiusCredential.username,
                macAddress:
                  activation.boundMacAddress ??
                  activation.radiusCredential.boundMacAddress,
                radiusSessionId: null,
              },
            ]
          : []

    for (const session of disconnectTargets) {
""",
)

# Build-time guards against future regressions. This patch runs before the
# final persistence normalizer, so accept the older no-idle intermediate value
# here; enforce_no_idle_bundle_logout.py canonicalizes it to the 31-day policy.
mikrotik_text = MIKROTIK.read_text(encoding="utf-8")
if "idle-timeout=31d" not in mikrotik_text and "idle-timeout=none" not in mikrotik_text:
    raise RuntimeError(
        "MikroTik idle session protection is missing; router session policy is inconsistent."
    )
for marker in (
    "keepalive-timeout=none",
    "session-timeout=0s",
):
    require(
        MIKROTIK,
        marker,
        "MikroTik idle session protection is incomplete; router session policy is inconsistent.",
    )
require(
    RADIUS_CREDENTIAL,
    "attribute: 'Session-Timeout'",
    "RADIUS Session-Timeout is missing; packages would not end exactly at expiry.",
)
require(
    LIFECYCLE,
    "await this.requestActiveDisconnects(tx, activation.id, 'Activation expired')",
    "Activation expiry no longer requests an immediate router logout.",
)
require(
    LIFECYCLE,
    "logoutHotspotActiveSession",
    "RouterOS API logout fallback is missing.",
)
require(
    LIFECYCLE,
    "const disconnectTargets =",
    "Expiry fallback disconnect target was not installed.",
)

print("Router presence, 31-day idle timeout, and expiry logout hardened.")
