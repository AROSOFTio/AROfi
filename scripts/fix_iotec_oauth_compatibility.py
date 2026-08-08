#!/usr/bin/env python3
"""Add a safe ioTec OAuth authentication fallback and runtime fingerprint.

ioTec documents client_secret_post (client_id and client_secret in the form
body). Some OAuth servers also require client_secret_basic. AROFi now tries the
documented method first, then HTTP Basic, without logging either secret. If both
fail, the Admin test shows a non-secret client-id fingerprint and secret length
so Coolify environment loading can be verified.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "apps/api/src/modules/payments/iotec-pay.service.ts"

OLD = """    const tokenUrl = `${this.identityBaseUrl()}/connect/token`
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })
    const raw = await response.text()
    const parsed = this.parseJson<IotecTokenResponse>(raw)

    if (!response.ok || !parsed.access_token) {
      const providerMessage = parsed.error_description || parsed.error || 'authorization failed'
      const credentialRejected =
        response.status === 400 ||
        response.status === 401 ||
        /invalid[_ ]?client|client credentials/i.test(providerMessage)

      throw new ServiceUnavailableException(
        credentialRejected
          ? `ioTec rejected IOTEC_CLIENT_ID/IOTEC_CLIENT_SECRET at ${tokenUrl} (HTTP ${response.status}): ${providerMessage}. Callback and wallet settings are not involved in this OAuth failure.`
          : `ioTec authorization failed at ${tokenUrl} (HTTP ${response.status}): ${providerMessage}`,
      )
    }
"""

NEW = """    const tokenUrl = `${this.identityBaseUrl()}/connect/token`
    const clientId = this.required('IOTEC_CLIENT_ID')
    const clientSecret = this.required('IOTEC_CLIENT_SECRET')
    const authAttempts = [
      {
        name: 'client_secret_post',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }).toString(),
      },
      {
        name: 'client_secret_basic',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      },
    ]

    let parsed: IotecTokenResponse = {}
    let lastStatus = 0
    let providerMessage = 'authorization failed'
    let lastMethod = authAttempts[0].name

    for (const attempt of authAttempts) {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: attempt.headers,
        body: attempt.body,
      })
      const raw = await response.text()
      let candidate: IotecTokenResponse = {}
      try {
        candidate = raw ? (JSON.parse(raw) as IotecTokenResponse) : {}
      } catch {
        candidate = {}
      }

      if (response.ok && candidate.access_token) {
        parsed = candidate
        break
      }

      lastStatus = response.status
      lastMethod = attempt.name
      providerMessage =
        candidate.error_description ||
        candidate.error ||
        (raw && raw.length <= 240 ? raw : '') ||
        'authorization failed'
    }

    if (!parsed.access_token) {
      const clientFingerprint = `${clientId.slice(0, 8)}…${clientId.slice(-4)}`
      throw new ServiceUnavailableException(
        `ioTec rejected the configured OAuth client after client_secret_post and client_secret_basic attempts (last method ${lastMethod}, HTTP ${lastStatus}): ${providerMessage}. Loaded client ID ${clientFingerprint}; secret length ${clientSecret.length}. The callback URL and wallet ID are not involved in this token failure.`,
      )
    }
"""

text = TARGET.read_text(encoding="utf-8")
if NEW not in text:
    count = text.count(OLD)
    if count != 1:
        raise RuntimeError(
            f"{TARGET.relative_to(ROOT)}: expected one patched OAuth block, found {count}."
        )
    TARGET.write_text(text.replace(OLD, NEW, 1), encoding="utf-8")

updated = TARGET.read_text(encoding="utf-8")
for marker in (
    "client_secret_post",
    "client_secret_basic",
    "Loaded client ID",
    "Buffer.from(`${clientId}:${clientSecret}`",
):
    if marker not in updated:
        raise RuntimeError(f"ioTec OAuth compatibility marker missing: {marker}")

print("ioTec OAuth form-body and HTTP Basic compatibility verified.")
