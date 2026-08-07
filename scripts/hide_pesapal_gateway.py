#!/usr/bin/env python3
"""Hide Pesapal from the Platform Admin gateway selector.

The backend provider implementation remains available for future use, but it is
not exposed as a selectable platform gateway until arbitrary payout support is
approved and integrated.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = ROOT / "apps/admin-web/src/components/SettingsManager.tsx"

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
print('Pesapal hidden from Platform Admin gateway selector.')
