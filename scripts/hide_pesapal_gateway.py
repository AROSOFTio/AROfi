#!/usr/bin/env python3
"""Hide Pesapal and apply final compile-safe gateway normalizations.

This script runs last in the Docker patch chain. Besides keeping Pesapal hidden
from Platform Admin, it removes enum-alias comparisons that TypeScript rejects
and replaces the missing platform settings constant introduced by the legacy
patch chain.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = ROOT / "apps/admin-web/src/components/SettingsManager.tsx"
ROUTER = ROOT / "apps/api/src/modules/payments/payment-router.service.ts"
PAYMENTS = ROOT / "apps/api/src/modules/payments/payments.service.ts"

# ---------------------------------------------------------------------------
# Keep Pesapal hidden from the Platform Admin gateway selector.
# ---------------------------------------------------------------------------
text = SETTINGS.read_text()

old_options = "const gatewayOptions = ['YO_UGANDA', 'IOTEC_PAY', 'PESAPAL', 'DIRECT_MNO']"
new_options = "const gatewayOptions = ['YO_UGANDA', 'IOTEC_PAY', 'DIRECT_MNO']"

if old_options in text:
    text = text.replace(old_options, new_options, 1)
elif new_options not in text:
    raise RuntimeError('SettingsManager gateway options were not found')

old_help = (
    "Yo! Uganda, ioTec Pay, Pesapal, or Direct MTN + Airtel. The selected gateway is applied "
    "automatically to new package payments, subscriptions, wallet top-ups, and withdrawals. "
    "ioTec Pay also enables UGX Visa/Mastercard checkout. Pesapal cannot be activated as universal "
    "until its approved payout API is configured."
)
new_help = (
    "Choose Yo! Uganda, ioTec Pay, or Direct MTN + Airtel. The selected gateway is applied "
    "automatically to new package payments, subscriptions, wallet top-ups, and withdrawals. "
    "ioTec Pay also enables UGX Visa/Mastercard checkout."
)

if old_help in text:
    text = text.replace(old_help, new_help, 1)
elif new_help not in text:
    raise RuntimeError('SettingsManager gateway help text was not found')

if "const gatewayOptions = ['YO_UGANDA', 'IOTEC_PAY', 'PESAPAL', 'DIRECT_MNO']" in text:
    raise RuntimeError('Pesapal is still visible in the gateway options')
if new_options not in text:
    raise RuntimeError('Expected visible gateway options were not written')

SETTINGS.write_text(text)

# ---------------------------------------------------------------------------
# PaymentRouterService accepts a union of PlatformPaymentGateway and
# PaymentProvider. Their ioTec/Yo/Pesapal enum members have identical runtime
# string values, so comparing both aliases in one OR expression is redundant
# and TypeScript 5 reports TS2367 after narrowing. Compare the canonical
# PlatformPaymentGateway value only; historical PaymentProvider values still
# match because the runtime strings are identical.
# ---------------------------------------------------------------------------
router_text = ROUTER.read_text()
router_replacements = {
    "if (selected === PlatformPaymentGateway.YO_UGANDA || selected === PaymentProvider.YO_UGANDA) {":
        "if (selected === PlatformPaymentGateway.YO_UGANDA) {",
    "if (selected === PlatformPaymentGateway.IOTEC_PAY || selected === PaymentProvider.IOTEC_PAY) {":
        "if (selected === PlatformPaymentGateway.IOTEC_PAY) {",
    "if (selected === PlatformPaymentGateway.PESAPAL || selected === PaymentProvider.PESAPAL) {":
        "if (selected === PlatformPaymentGateway.PESAPAL) {",
}

for old, new in router_replacements.items():
    if old in router_text:
        router_text = router_text.replace(old, new, 1)
    elif new not in router_text:
        raise RuntimeError(f'PaymentRouterService compile fix target was not found: {old}')

ROUTER.write_text(router_text)

# ---------------------------------------------------------------------------
# The unified checkout patch referenced PLATFORM_SETTINGS_ID without declaring
# it in PaymentsService. The repository consistently uses the global settings
# row ID, so write the literal value before the API TypeScript build.
# ---------------------------------------------------------------------------
payments_text = PAYMENTS.read_text()
settings_id_count = payments_text.count('PLATFORM_SETTINGS_ID')
if settings_id_count == 2:
    payments_text = payments_text.replace('PLATFORM_SETTINGS_ID', "'global'")
elif settings_id_count != 0:
    raise RuntimeError(
        f'Expected either zero or two PLATFORM_SETTINGS_ID references, found {settings_id_count}'
    )

PAYMENTS.write_text(payments_text)

print('Pesapal hidden and unified gateway compile fixes applied.')
