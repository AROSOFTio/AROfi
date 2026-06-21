'use client'

import { useCallback, useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import type { RouterDeploymentTestResult, RouterDiagnosticsResponse, RouterSetupResponse } from '@/lib/admin-types'
import { buildVerification } from '@/lib/router-verification'

// ---------------------------------------------------------------------------
// One-click diagnostics (Step 10 of the deployment redesign).
//
// Reuses the same verification model as the wizard/dashboard so "Test NAT"
// here and the NAT row in the dashboard never disagree. Plain-English
// explanations are deterministic templates off each item's problem/fix copy
// (not an LLM call) — explicit scope decision: no added latency, cost, or
// hallucination risk for what is fundamentally a lookup table.
// ---------------------------------------------------------------------------

type Props = {
  setup: RouterSetupResponse
  diagnostics: RouterDiagnosticsResponse | null
  onDiagnosticsRefreshed: (diag: RouterDiagnosticsResponse) => void
}

export default function RouterTroubleshootingPanel({ setup, diagnostics, onDiagnosticsRefreshed }: Props) {
  const [fixingKey, setFixingKey] = useState<string | null>(null)
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<RouterDeploymentTestResult | null>(null)
  const routerId = setup.router.id

  const verification = buildVerification(setup, diagnostics)

  const refreshDiagnostics = useCallback(async () => {
    const diag = await clientFetchApi<RouterDiagnosticsResponse>(`/routers/${routerId}/diagnostics`)
    onDiagnosticsRefreshed(diag)
    return diag
  }, [routerId, onDiagnosticsRefreshed])

  async function handleFixAutomatically(key: string) {
    setFixingKey(key)
    try {
      await clientPostApi(`/routers/${routerId}/self-test`, {})
    } catch {
      // best-effort — health-check + refreshed diagnostics still run below
    }
    try {
      await clientPostApi(`/routers/${routerId}/health-check`, {})
    } catch {
      // ignore
    }
    await refreshDiagnostics()
    setFixingKey(null)
  }

  async function handleRunDeploymentTest() {
    setTestRunning(true)
    setTestResult(null)
    try {
      const result = await clientPostApi<RouterDeploymentTestResult>(`/routers/${routerId}/run-deployment-test`, {})
      setTestResult(result)
    } catch (error) {
      setTestResult({
        routerId,
        overallOk: false,
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        note: 'This is a synthetic, protocol-level pre-flight test. It does not replace a real phone redemption.',
        steps: [{ name: 'request_failed', ok: false, detail: error instanceof Error ? error.message : 'Request failed' }],
      })
    } finally {
      setTestRunning(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'grid', gap: 2 }}>
            <span className="card-title">Run full deployment test</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              Sends a real RADIUS Access-Request using a temporary, automatically-cleaned-up credential — proves the
              RADIUS/voucher path end to end at the protocol level. It does not replace a real phone redemption.
            </span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void handleRunDeploymentTest()} disabled={testRunning}>
            {testRunning ? 'Running…' : 'Run full deployment test'}
          </button>
        </div>
        {testResult && (
          <div style={{ padding: 20, display: 'grid', gap: 8 }}>
            <span className={testResult.overallOk ? 'badge badge-success' : 'badge badge-danger'} style={{ width: 'fit-content' }}>
              {testResult.overallOk ? 'PASS' : 'FAIL'} · {testResult.latencyMs}ms
            </span>
            {testResult.steps.map((step) => (
              <div key={step.name} style={{ fontSize: 13, color: 'var(--text-2)' }}>
                <strong style={{ color: step.ok ? 'var(--green-dark)' : 'var(--danger-fg)' }}>
                  {step.ok ? '✓' : '✕'} {step.name}
                </strong>
                {' — '}
                {step.detail}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">One-click diagnostics</span>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 10 }}>
          {verification.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'grid',
                gap: 6,
                padding: 14,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: item.state === 'fail' ? 'var(--surface-muted)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className={
                      item.state === 'pass' ? 'badge badge-success' : item.state === 'fail' ? 'badge badge-danger' : 'badge badge-warning'
                    }
                  >
                    {item.state === 'pass' ? 'PASS' : item.state === 'fail' ? 'FAIL' : 'PENDING'}
                  </span>
                  <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>Test {item.label}</strong>
                </div>
                {item.state === 'fail' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void handleFixAutomatically(item.key)}
                    disabled={fixingKey === item.key}
                  >
                    {fixingKey === item.key ? 'Fixing…' : 'Fix automatically'}
                  </button>
                )}
              </div>
              {item.state === 'fail' && (
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Problem: </strong>
                    {item.problem}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Suggested fix: </strong>
                    {item.fix}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
