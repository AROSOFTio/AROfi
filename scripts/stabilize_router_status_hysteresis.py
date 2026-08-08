#!/usr/bin/env python3
"""Prevent router dashboard status from flapping on short signal gaps.

Online recovery remains immediate when any valid heartbeat, management probe,
RADIUS authentication, or accounting signal arrives. A router is only marked
confirmed OFFLINE after five minutes without any valid signal. This affects
monitoring and outage alerts only; it never changes customer authentication,
bundle expiry, or internet access.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTERS = ROOT / "apps/api/src/modules/routers/routers.service.ts"

OLD = """  private readonly routerLiveWindowSeconds = Math.max(
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
"""

NEW = """  private readonly routerLiveWindowSeconds = Math.max(
    this.configuredRouterLiveWindowSeconds,
    this.heartbeatIntervalSeconds * 6,
    Math.ceil(this.routerProbeIntervalMs / 1000) * 4,
    60,
  )
  private readonly routerStaleWindowSeconds = Math.max(
    this.configuredRouterStaleWindowSeconds,
    300,
  )
  private readonly accountingLiveWindowSeconds = Math.max(
    this.routerLiveWindowSeconds,
    120,
  )
  private readonly accountingStaleWindowSeconds = Math.max(
    this.routerStaleWindowSeconds,
    300,
  )
"""

text = ROUTERS.read_text(encoding="utf-8")
if NEW not in text:
    count = text.count(OLD)
    if count != 1:
        raise RuntimeError(
            f"{ROUTERS.relative_to(ROOT)}: expected one router status window block, found {count}."
        )
    text = text.replace(OLD, NEW, 1)
    ROUTERS.write_text(text, encoding="utf-8")

updated = ROUTERS.read_text(encoding="utf-8")
for marker in (
    "private readonly routerStaleWindowSeconds",
    "    300,",
    "private readonly accountingLiveWindowSeconds",
    "    120,",
):
    if marker not in updated:
        raise RuntimeError(f"Router anti-flapping marker missing: {marker}")

print(
    "Router status hysteresis enabled: recovery is immediate; confirmed offline requires five minutes without a valid signal."
)
