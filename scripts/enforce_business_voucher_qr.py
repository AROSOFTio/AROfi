#!/usr/bin/env python3
"""Make every voucher QR use the tenant's MikroTik-local business hostname.

An earlier build patch forced all QR codes to ``http://10.55.0.1/login``. That
address is router-specific and failed for customers whose camera/browser did not
route the request through the expected HotSpot context. The stable contract is:

    http://<business>.wifi/login?voucher=<CODE>

The business hostname is generated once by the API and is used by router DNS,
PDF QR codes and the Admin preview. This patch runs after all older source
patches so no previous build step can force the gateway IP back into QR codes.
"""

from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
VOUCHERS_SERVICE = ROOT / "apps/api/src/modules/vouchers/vouchers.service.ts"
ROUTERS_SERVICE = ROOT / "apps/api/src/modules/routers/routers.service.ts"
QR_INITIALIZER = ROOT / "apps/api/src/modules/vouchers/voucher-qr-routing.initializer.ts"
VOUCHERS_MANAGER = ROOT / "apps/admin-web/src/components/VouchersManager.tsx"
ADMIN_TYPES = ROOT / "apps/admin-web/src/lib/admin-types.ts"

COMMON_IMPORT = "import { buildTenantHotspotDomain, buildVoucherHotspotUrl } from '../../common/tenant-hotspot-domain'"
ROUTER_COMMON_IMPORT = "import { buildTenantHotspotDomain } from '../../common/tenant-hotspot-domain'"


def replace_regex(path: Path, pattern: str, replacement: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: expected one {label} match, found {count}."
        )
    path.write_text(updated, encoding="utf-8")


def ensure_import(path: Path, import_line: str, anchor: str) -> None:
    text = path.read_text(encoding="utf-8")
    if import_line in text:
        return
    if anchor not in text:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: import anchor is missing: {anchor}"
        )
    path.write_text(text.replace(anchor, anchor + "\n" + import_line, 1), encoding="utf-8")


def patch_api_qr() -> None:
    ensure_import(
        VOUCHERS_SERVICE,
        COMMON_IMPORT,
        "import { PrismaService } from '../../prisma.service'",
    )

    replace_regex(
        VOUCHERS_SERVICE,
        r"  private buildVoucherPortalUrl\(voucherCode: string, hotspotDomain\?: string\) \{.*?\n  \}\n",
        """  private buildVoucherPortalUrl(voucherCode: string, hotspotDomain?: string) {
    return buildVoucherHotspotUrl(voucherCode, hotspotDomain)
  }
""",
        "voucher URL builder",
    )

    replace_regex(
        VOUCHERS_SERVICE,
        r"  private buildTenantHotspotDomain\(tenantName\?: string \| null\) \{.*?\n  \}\n",
        """  private buildTenantHotspotDomain(tenantName?: string | null) {
    return buildTenantHotspotDomain(tenantName)
  }
""",
        "tenant hotspot-domain builder",
    )

    text = VOUCHERS_SERVICE.read_text(encoding="utf-8")
    old = "          tenant: batch.tenant,"
    new = """          tenant: {
            ...batch.tenant,
            hotspotDomain: this.buildTenantHotspotDomain(batch.tenant.name),
          },"""
    if new not in text:
        if text.count(old) != 1:
            raise RuntimeError(
                "apps/api/src/modules/vouchers/vouchers.service.ts: expected one batch tenant mapping."
            )
        text = text.replace(old, new, 1)
        VOUCHERS_SERVICE.write_text(text, encoding="utf-8")

    ensure_import(
        ROUTERS_SERVICE,
        ROUTER_COMMON_IMPORT,
        "import { PrismaService } from '../../prisma.service'",
    )
    routers_text = ROUTERS_SERVICE.read_text(encoding="utf-8")
    router_shared_builder = "return buildTenantHotspotDomain(tenant?.name)"
    if router_shared_builder not in routers_text:
        replace_regex(
            ROUTERS_SERVICE,
            r"  private buildTenantWifiHost\(tenant\?: \{ name\?: string \| null; domain\?: string \| null \} \| null\) \{.*?\n  \}\n\n  private buildTenantWifiLabel\(value: string\) \{.*?\n  \}\n",
            """  private buildTenantWifiHost(tenant?: { name?: string | null; domain?: string | null } | null) {
    return buildTenantHotspotDomain(tenant?.name)
  }
""",
            "router tenant hotspot-domain builder",
        )

    initializer = QR_INITIALIZER.read_text(encoding="utf-8")
    if "import { buildVoucherHotspotUrl } from '../../common/tenant-hotspot-domain'" not in initializer:
        initializer = initializer.replace(
            "import { VouchersService } from './vouchers.service'",
            "import { VouchersService } from './vouchers.service'\nimport { buildVoucherHotspotUrl } from '../../common/tenant-hotspot-domain'",
        )
    initializer, count = re.subn(
        r"    service\.buildVoucherPortalUrl = \(voucherCode: string, hotspotDomain\?: string\) => \{.*?\n    \}\n",
        """    service.buildVoucherPortalUrl = (voucherCode: string, hotspotDomain?: string) => {
      return buildVoucherHotspotUrl(voucherCode, hotspotDomain)
    }
""",
        initializer,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError(
            "apps/api/src/modules/vouchers/voucher-qr-routing.initializer.ts: QR override not found."
        )
    QR_INITIALIZER.write_text(initializer, encoding="utf-8")


def patch_admin_preview() -> None:
    text = VOUCHERS_MANAGER.read_text(encoding="utf-8")

    text, count = re.subn(
        r"function getVoucherQrPortalUrl\(code: string, dnsName\?: string\) \{.*?\n\}\n",
        """function getVoucherQrPortalUrl(code: string, dnsName?: string) {
  const host = (dnsName ?? 'arofi.wifi')
    .trim()
    .toLowerCase()
    .replace(/^https?:\\/\\//i, '')
    .replace(/\\/.*$/, '')
  const safeHost = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\\.wifi$/i.test(host)
    ? host
    : 'arofi.wifi'
  return `http://${safeHost}/login?voucher=${encodeURIComponent(code.trim().toUpperCase())}`
}
""",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError(
            "apps/admin-web/src/components/VouchersManager.tsx: voucher QR helper not found."
        )

    text = text.replace(
        "                    portalHost={getVoucherPortalHost()}\n                  />",
        """                    portalHost={getVoucherPortalHost()}
                    hotspotDomain={printBatch.tenant.hotspotDomain}
                  />""",
        1,
    )
    text = text.replace(
        "  portalHost,\n  adLine = DEFAULT_VOUCHER_AD,",
        "  portalHost,\n  hotspotDomain,\n  adLine = DEFAULT_VOUCHER_AD,",
        1,
    )
    text = text.replace(
        "  portalHost: string\n  adLine?: string",
        "  portalHost: string\n  hotspotDomain?: string | null\n  adLine?: string",
        1,
    )
    text = text.replace(
        "    // Always use the hosted portal URL — dnsName-based URLs only work on the\n    // local hotspot network and show \"unknown page\" when scanned elsewhere.\n    const portalUrl = getVoucherQrPortalUrl(code)",
        """    // Printed vouchers are intentionally local to this venue. The exact
    // hostname comes from the API so the QR and MikroTik DNS cannot diverge.
    const portalUrl = getVoucherQrPortalUrl(code, hotspotDomain)""",
        1,
    )
    text = text.replace("  }, [code])", "  }, [code, hotspotDomain])", 1)

    required = (
        "hotspotDomain={printBatch.tenant.hotspotDomain}",
        "const portalUrl = getVoucherQrPortalUrl(code, hotspotDomain)",
        "http://${safeHost}/login?voucher=${encodeURIComponent(code.trim().toUpperCase())}",
    )
    missing = [marker for marker in required if marker not in text]
    if missing:
        raise RuntimeError(
            "Admin voucher QR preview patch incomplete; missing: " + ", ".join(missing)
        )

    VOUCHERS_MANAGER.write_text(text, encoding="utf-8")

    types = ADMIN_TYPES.read_text(encoding="utf-8")
    if "hotspotDomain?: string | null" not in types:
        old = "export type VoucherTenantSummary = TenantSummary & {\n  domain?: string | null"
        new = "export type VoucherTenantSummary = TenantSummary & {\n  domain?: string | null\n  hotspotDomain?: string | null"
        if old not in types:
            raise RuntimeError("VoucherTenantSummary type insertion point missing.")
        types = types.replace(old, new, 1)
        ADMIN_TYPES.write_text(types, encoding="utf-8")


def validate() -> None:
    service = VOUCHERS_SERVICE.read_text(encoding="utf-8")
    routers = ROUTERS_SERVICE.read_text(encoding="utf-8")
    initializer = QR_INITIALIZER.read_text(encoding="utf-8")
    manager = VOUCHERS_MANAGER.read_text(encoding="utf-8")
    types = ADMIN_TYPES.read_text(encoding="utf-8")

    required = {
        "API shared QR builder": "return buildVoucherHotspotUrl(voucherCode, hotspotDomain)",
        "API shared tenant hostname": "return buildTenantHotspotDomain(tenantName)",
        "router shared tenant hostname": "return buildTenantHotspotDomain(tenant?.name)",
        "overview exact hotspot hostname": "hotspotDomain: this.buildTenantHotspotDomain(batch.tenant.name)",
        "runtime QR initializer": "return buildVoucherHotspotUrl(voucherCode, hotspotDomain)",
        "Admin exact business QR": "getVoucherQrPortalUrl(code, hotspotDomain)",
        "Admin hotspot type": "hotspotDomain?: string | null",
    }
    haystacks = {
        "API shared QR builder": service,
        "API shared tenant hostname": service,
        "router shared tenant hostname": routers,
        "overview exact hotspot hostname": service,
        "runtime QR initializer": initializer,
        "Admin exact business QR": manager,
        "Admin hotspot type": types,
    }
    missing = [label for label, marker in required.items() if marker not in haystacks[label]]
    if missing:
        raise RuntimeError("Business voucher QR build rejected; missing: " + ", ".join(missing))

    combined_qr = "\n".join((service, initializer, manager))
    forbidden = (
        "VOUCHER_QR_LOCAL_LOGIN_URL",
        "NEXT_PUBLIC_VOUCHER_QR_LOCAL_LOGIN_URL",
        "http://10.55.0.1/login?voucher=",
        "/login/voucher=",
    )
    present = [marker for marker in forbidden if marker in combined_qr]
    if present:
        raise RuntimeError(
            "Business voucher QR build rejected; forbidden QR routes remain: " + ", ".join(present)
        )

    print(
        "Business voucher QR verified: router, PDF and Admin preview use "
        "http://<business>.wifi/login?voucher=<CODE>."
    )


def main() -> None:
    for path in (VOUCHERS_SERVICE, ROUTERS_SERVICE, QR_INITIALIZER, VOUCHERS_MANAGER, ADMIN_TYPES):
        if not path.exists():
            raise RuntimeError(f"Required voucher QR source missing: {path.relative_to(ROOT)}")

    patch_api_qr()
    patch_admin_preview()
    validate()


if __name__ == "__main__":
    main()
