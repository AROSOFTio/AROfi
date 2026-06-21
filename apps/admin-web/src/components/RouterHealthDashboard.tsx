'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clientFetchApi } from '@/lib/client-api'
import type { RouterDiagnosticsResponse, RouterSetupResponse } from '@/lib/admin-types'
import { buildVerification, dashboardStateColor, dashboardStateLabel } from '@/lib/router-verification'

// ---------------------------------------------------------------------------
// Per-router health dashboard (Step 9 of the deployment redesign).
//
// The big indicator is driven by the backend's dashboardState, which only
// reaches ONLINE once productionReady is true — a router that merely ran the
// script, or whose management API is reachable, still shows WARNING here.
// This is the same honesty model as the deployment wizard, surfaced as a
// permanent dashboard rather than a one-time onboarding flow.
// ---------------------------------------------------------------------------

type Props = {
  setup: RouterSetupResponse
  pollIntervalMs?: number
}

export default function RouterHealthDashboard({ setup, pollIntervalMs = 15000 }: Props) {
  const [diagnostics, setDiagnostics] = useState<RouterDiagnosticsResponse | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const routerId = setup.router.id

  const refresh = useCallback(async () => {
    try {
      setDiagnostics(await clientFetchApi<RouterDiagnosticsResponse>(`/routers/${routerId}/diagnostics`))
    } catch {
      // Transient blips shouldn't blank the dashboard — keep the last good read.
    }
  }, [routerId])

  useEffect(() => {
    void refresh()
    pollRef.current = setInterval(() => void refresh(), pollIntervalMs)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refresh, pollIntervalMs])

  const router = diagnostics?.router ?? setup.router
  const verification = buildVerification(setup, diagnostics)
  const state = router.dashboardState ?? 'OFFLINE'
  const score = router.healthScore ?? 0
  const drift = diagnostics?.driftScore ?? null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div
            style={{
              minWidth: 160,
              padding: '14px 24px',
              borderRadius: 14,
              border: `2px solid ${dashboardStateColor(state)}`,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.04em', color: dashboardStateColor(state) }}>
              {dashboardStateLabel(state)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{router.name}</div>
          </div>

          <ScoreTile label="Health score" value={`${score}%`} hint="Critical checks + real client signals" />
          <ScoreTile
            label="Drift score"
            value={drift === null ? 'N/A' : `${drift}%`}
            hint={drift === null ? 'No passing baseline yet' : 'vs. last fully-passing report'}
          />
          <ScoreTile label="Active users" value={String(router.activeSessions ?? 0)} hint="Sessions right now" />
          <ScoreTile label="Voucher sales today" value="Coming soon" hint="Per-router sales metric not wired yet" muted />
          <ScoreTile label="Bandwidth usage" value="Coming soon" hint="No metering pipeline yet" muted />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Subsystem status</span>
        </div>
        <div
          style={{
            padding: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {verification.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: item.state === 'pass' ? 'var(--green-light)' : 'var(--surface-muted)',
              }}
            >
              <span
                className={
                  item.state === 'pass' ? 'badge badge-success' : item.state === 'fail' ? 'badge badge-danger' : 'badge badge-warning'
                }
                style={{ minWidth: 20, justifyContent: 'center' }}
              >
                {item.state === 'pass' ? '✓' : item.state === 'fail' ? '✕' : '…'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.label}</span>
              {item.critical && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>critical</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScoreTile({ label, value, hint, muted }: { label: string; value: string; hint: string; muted?: boolean }) {
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: muted ? 'var(--text-muted)' : 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</div>
    </div>
  )
}
