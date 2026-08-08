#!/usr/bin/env python3
"""Make ioTec live-gateway state and OAuth failures explicit.

This final build patch runs after the gateway feature patches. It does not change
ioTec's documented OAuth client_credentials request. It fixes the Admin UI so a
configured gateway is not falsely labelled verified, and so live-test failures
are shown directly beside the test button.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:160]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# Keep the official form-urlencoded client_credentials request, but return a
# precise error that distinguishes OAuth rejection from callback/wallet issues.
iotec = "apps/api/src/modules/payments/iotec-pay.service.ts"
replace_once(
    iotec,
    """    const response = await fetch(`${this.identityBaseUrl()}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const raw = await response.text()
    const parsed = this.parseJson<IotecTokenResponse>(raw)

    if (!response.ok || !parsed.access_token) {
      throw new ServiceUnavailableException(
        parsed.error_description || parsed.error || `ioTec authorization failed with HTTP ${response.status}`,
      )
    }
""",
    """    const tokenUrl = `${this.identityBaseUrl()}/connect/token`
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
""",
)

settings = "apps/admin-web/src/components/SettingsManager.tsx"
replace_once(
    settings,
    "  const [gatewayTestMessage, setGatewayTestMessage] = useState('')\n",
    "  const [gatewayTestMessage, setGatewayTestMessage] = useState('')\n  const [gatewayTestFailed, setGatewayTestFailed] = useState(false)\n",
)
replace_once(
    settings,
    """  async function testActiveGateway() {
    setGatewayTesting(true)
    setGatewayTestMessage('')
    setError('')
    try {""",
    """  async function testActiveGateway() {
    setGatewayTesting(true)
    setGatewayTestMessage('')
    setGatewayTestFailed(false)
    setError('')
    try {""",
)
replace_once(
    settings,
    """      setGatewayTestMessage(`${result.message || `${result.gatewayLabel || 'Gateway'} connected.`}${balance}`)
      const refreshed = await clientFetchApi<PlatformSettings>('/system/settings')
      setPlatform(refreshed)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gateway test failed')
    } finally {""",
    """      setGatewayTestFailed(false)
      setGatewayTestMessage(`${result.message || `${result.gatewayLabel || 'Gateway'} connected.`}${balance}`)
      const refreshed = await clientFetchApi<PlatformSettings>('/system/settings')
      setPlatform(refreshed)
    } catch (caught) {
      setGatewayTestFailed(true)
      setGatewayTestMessage(caught instanceof Error ? caught.message : 'Gateway test failed')
    } finally {""",
)
replace_once(
    settings,
    """                              {readiness?.configured && readiness?.webhookConfigured
                                ? 'Ready for production testing'
                                : `Setup required${readiness?.missingConfiguration?.length ? `: ${readiness.missingConfiguration.join(', ')}` : ''}`}""",
    """                              {readiness?.configured && readiness?.webhookConfigured
                                ? 'Live configuration loaded — test connection'
                                : `Setup required${readiness?.missingConfiguration?.length ? `: ${readiness.missingConfiguration.join(', ')}` : ''}`}""",
)
replace_once(
    settings,
    """                      {gatewayTesting ? 'Testing gateway…' : 'Test active gateway'}""",
    """                      {gatewayTesting ? 'Testing live connection…' : 'Test live gateway'}""",
)
replace_once(
    settings,
    """                    {gatewayTestMessage ? <div style={{ marginTop: 8, color: 'var(--green)', fontSize: 12.5, fontWeight: 650 }}>{gatewayTestMessage}</div> : null}""",
    """                    {gatewayTestMessage ? (
                      <div
                        role="status"
                        style={{
                          marginTop: 8,
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: gatewayTestFailed ? '#fef2f2' : 'var(--green-light)',
                          border: `1px solid ${gatewayTestFailed ? '#fecaca' : 'var(--green)'}`,
                          color: gatewayTestFailed ? '#b91c1c' : 'var(--green)',
                          fontSize: 12.5,
                          fontWeight: 650,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {gatewayTestMessage}
                      </div>
                    ) : null}""",
)

print('ioTec live gateway diagnostics and Admin status labels corrected.')
