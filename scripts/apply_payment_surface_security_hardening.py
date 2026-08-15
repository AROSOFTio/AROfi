#!/usr/bin/env python3
"""Finalize payment API-surface security after the financial gateway transforms.

This step deliberately does NOT change provider endpoints, request payloads,
RADIUS, MikroTik provisioning, captive-portal scripts, or network connectivity.
It only hardens how untrusted public input and diagnostic copies are handled.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYMENTS = ROOT / 'apps/api/src/modules/payments/payments.service.ts'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one source match, found {count}')
    return text.replace(old, new, 1)


text = PAYMENTS.read_text()

# Existing production env files may contain WEBHOOK_ALLOW_QUERY_SECRET=false
# even though the old code never honored it. Do not let a security rollout
# unexpectedly break live callbacks. Query-secret rejection becomes a NEW,
# explicit migration control: WEBHOOK_REJECT_QUERY_SECRET=true.
text = replace_once(
    text,
    "const queryCompatibilityEnabled = process.env.WEBHOOK_ALLOW_QUERY_SECRET !== 'false'",
    "const queryCompatibilityEnabled = process.env.WEBHOOK_REJECT_QUERY_SECRET !== 'true'",
    'generic webhook callback compatibility flag',
)
text = replace_once(
    text,
    "(process.env.WEBHOOK_ALLOW_QUERY_SECRET !== 'false' ? payload.secret : undefined)",
    "(process.env.WEBHOOK_REJECT_QUERY_SECRET !== 'true' ? payload.secret : undefined)",
    'Yo Uganda callback compatibility flag',
)

# The webhook parser still needs the original business fields, but its
# diagnostic rawResponse must never persist the query/header secret copied into
# the payload by legacy controllers.
text = replace_once(
    text,
    "rawResponse: JSON.stringify(payload),",
    "rawResponse: JSON.stringify(this.redactWebhookRecord(payload)),",
    'webhook raw-response redaction',
)

# A raw routerId is not authentication. The normal MikroTik portal always sends
# registrationKey/routerKey; when it is absent, preserve direct/QR payment but
# leave the activation unbound instead of trusting a client-supplied routerId.
text = replace_once(
    text,
    """    if (!routerKey) {
      return { routerId }
    }
""",
    """    if (!routerKey) {
      return { routerId: undefined }
    }
""",
    'untrusted payment routerId suppression',
)

PAYMENTS.write_text(text)
print('Payment surface hardening applied: callback compatibility preserved, diagnostics redacted, untrusted routerId ignored.')
