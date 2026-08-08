#!/usr/bin/env python3
"""Detect and persist each MikroTik's exact hardware model during provisioning.

Router registration is created before AROFi can query RouterOS, so manually
entered placeholders such as RB95 can appear on every router. The generated
RouterOS script now reads /system routerboard model (for example RB750Gr3),
serial number, and RouterOS version, sends them as callback headers, and the API
updates the router inventory when the script finishes.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIKROTIK = ROOT / "apps/api/src/modules/routers/mikrotik.service.ts"
CONTROLLER = ROOT / "apps/api/src/modules/routers/mikrotik.controller.ts"
ROUTERS = ROOT / "apps/api/src/modules/routers/routers.service.ts"


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: expected one {label} match, found {count}."
        )
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# RouterOS: collect exact hardware metadata. /system routerboard model returns
# product codes such as RB750Gr3; CHR/non-RouterBOARD systems fall back to
# /system resource board-name. Custom HTTP headers preserve spaces in version
# strings without fragile URL encoding.
replace_once(
    MIKROTIK,
    """      `:delay 3s`,
      `:local nasIp \"\"`,
      ...this.buildWanDetectionScript('cbWanIface', remoteClientName),
""",
    """      `:delay 3s`,
      `:local nasIp \"\"`,
      `:local arofiModel \"\"`,
      `:local arofiSerial \"\"`,
      `:local arofiVersion \"\"`,
      `:do { :set arofiModel [/system routerboard get model] } on-error={}`,
      `:if ($arofiModel = \"\") do={ :do { :set arofiModel [/system resource get board-name] } on-error={} }`,
      `:do { :set arofiSerial [/system routerboard get serial-number] } on-error={}`,
      `:do { :set arofiVersion [/system resource get version] } on-error={}`,
      `:local arofiHeaders (\"X-AROFi-Model:\" . $arofiModel . \",X-AROFi-Serial:\" . $arofiSerial . \",X-AROFi-Version:\" . $arofiVersion)`,
      ...this.buildWanDetectionScript('cbWanIface', remoteClientName),
""",
    "RouterOS hardware metadata collection",
)

replace_once(
    MIKROTIK,
    """      `  /tool fetch url=\"${callbackUrl}?nasIp=$nasIp\" check-certificate=no mode=https keep-result=no`,
""",
    """      `  /tool fetch url=\"${callbackUrl}?nasIp=$nasIp\" http-header-field=$arofiHeaders check-certificate=no mode=https keep-result=no`,
""",
    "HTTPS provisioning metadata callback",
)

replace_once(
    MIKROTIK,
    """      `    /tool fetch url=\"${fallbackCallbackUrl}?nasIp=$nasIp\" mode=http keep-result=no`,
""",
    """      `    /tool fetch url=\"${fallbackCallbackUrl}?nasIp=$nasIp\" http-header-field=$arofiHeaders mode=http keep-result=no`,
""",
    "HTTP provisioning metadata callback",
)

# API controller: read RouterOS callback headers. Express normalizes header names
# to lowercase, so use lowercase lookup keys and strip line breaks defensively.
replace_once(
    CONTROLLER,
    """    const result = await this.routersService.markRouterProvisionedByKey(key, sourceIp);
""",
    """    const hardware = {
      model: this.readRouterHeader(request, 'x-arofi-model'),
      serialNumber: this.readRouterHeader(request, 'x-arofi-serial'),
      routerOsVersion: this.readRouterHeader(request, 'x-arofi-version'),
    };
    const result = await this.routersService.markRouterProvisionedByKey(key, sourceIp, hardware);
""",
    "provisioning callback hardware propagation",
)

replace_once(
    CONTROLLER,
    """  private resolveProvisioningNasIp(selfReportedNasIp?: string, httpSourceIp?: string) {
""",
    """  private readRouterHeader(request: any, name: string) {
    const value = request?.headers?.[name];
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string'
      ? raw.replace(/[\\r\\n]/g, ' ').trim().slice(0, 160)
      : '';
  }

  private resolveProvisioningNasIp(selfReportedNasIp?: string, httpSourceIp?: string) {
""",
    "router metadata header reader",
)

# API service: persist the detected model on both identity and model so the
# inventory immediately stops showing a shared placeholder. Existing routers
# are corrected simply by re-running their generated setup script.
replace_once(
    ROUTERS,
    """  async markRouterProvisionedByKey(key: string, sourceIp: string) {
""",
    """  async markRouterProvisionedByKey(
    key: string,
    sourceIp: string,
    hardware?: {
      model?: string
      serialNumber?: string
      routerOsVersion?: string
    },
  ) {
""",
    "router provisioning metadata signature",
)

replace_once(
    ROUTERS,
    """    const normalizedSourceIp = sourceIp.trim()
    const now = new Date()
    const baseWarning = normalizedSourceIp
""",
    """    const normalizedSourceIp = sourceIp.trim()
    const now = new Date()
    const detectedModel = hardware?.model?.trim().slice(0, 120) || undefined
    const detectedSerialNumber = hardware?.serialNumber?.trim().slice(0, 120) || undefined
    const detectedRouterOsVersion = hardware?.routerOsVersion?.trim().slice(0, 80) || undefined
    const baseWarning = normalizedSourceIp
""",
    "router provisioning metadata normalization",
)

replace_once(
    ROUTERS,
    """          data: {
            host: managementHost,
            radiusNasIpAddress: normalizedSourceIp || router.radiusNasIpAddress,
""",
    """          data: {
            ...(detectedModel ? { identity: detectedModel, model: detectedModel } : {}),
            ...(detectedSerialNumber ? { serialNumber: detectedSerialNumber } : {}),
            ...(detectedRouterOsVersion ? { routerOsVersion: detectedRouterOsVersion } : {}),
            host: managementHost,
            radiusNasIpAddress: normalizedSourceIp || router.radiusNasIpAddress,
""",
    "primary router hardware update",
)

replace_once(
    ROUTERS,
    """          data: {
            radiusNasIpAddress: normalizedSourceIp || router.radiusNasIpAddress,
            onboardingStatus: RouterOnboardingStatus.WAITING_FOR_ROUTER,
""",
    """          data: {
            ...(detectedModel ? { identity: detectedModel, model: detectedModel } : {}),
            ...(detectedSerialNumber ? { serialNumber: detectedSerialNumber } : {}),
            ...(detectedRouterOsVersion ? { routerOsVersion: detectedRouterOsVersion } : {}),
            radiusNasIpAddress: normalizedSourceIp || router.radiusNasIpAddress,
            onboardingStatus: RouterOnboardingStatus.WAITING_FOR_ROUTER,
""",
    "fallback router hardware update",
)

mikrotik_text = MIKROTIK.read_text(encoding="utf-8")
controller_text = CONTROLLER.read_text(encoding="utf-8")
routers_text = ROUTERS.read_text(encoding="utf-8")

for marker in (
    "[/system routerboard get model]",
    "http-header-field=$arofiHeaders",
    "X-AROFi-Model:",
):
    if marker not in mikrotik_text:
        raise RuntimeError(f"RouterOS hardware detection marker missing: {marker}")

for marker in ("x-arofi-model", "readRouterHeader", "markRouterProvisionedByKey(key, sourceIp, hardware)"):
    if marker not in controller_text:
        raise RuntimeError(f"Controller hardware detection marker missing: {marker}")

for marker in ("detectedModel", "identity: detectedModel, model: detectedModel"):
    if marker not in routers_text:
        raise RuntimeError(f"Router persistence marker missing: {marker}")

print("Exact MikroTik hardware model, serial number, and RouterOS version detection enabled.")
