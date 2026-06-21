'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import type { RouterDeploymentTestResult, RouterDiagnosticsResponse, RouterSetupResponse } from '@/lib/admin-types'
import { buildVerification, type VerificationItem } from '@/lib/router-verification'

// ---------------------------------------------------------------------------
// AROFi guided router deployment wizard.
//
// Replaces the dead-end "script generated, now what?" experience with an
// 11-step guided flow that ends only when AROFi has actually VERIFIED the
// router works end to end. The wizard never claims success on the strength of
// "the script ran" — every green tick maps to a real signal AROFi observed:
// a provisioning callback, a router self-test report, a real RADIUS
// Access-Accept, or live accounting from a real client.
// ---------------------------------------------------------------------------

type Props = {
  setup: RouterSetupResponse
  onClose: () => void
  onOpenDashboard?: () => void
  onCreateVoucher?: () => void
}

const WIZARD_STEPS = [
  'Reset Router',
  'Connect',
  'Open WinBox',
  'Login',
  'Paste Script',
  'Verify Setup',
  'Go Live',
] as const

type StepIndex = number

export default function RouterDeploymentWizard({ setup, onClose, onOpenDashboard, onCreateVoucher }: Props) {
  const [step, setStep] = useState<StepIndex>(-1) // -1 = success splash, 0..6 = wizard, 7 = done
  const [resetConfirmed, setResetConfirmed] = useState(false)
  const [loginConfirmed, setLoginConfirmed] = useState(false)
  const [pasteConfirmed, setPasteConfirmed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<RouterDiagnosticsResponse | null>(null)
  const [latestSetup, setLatestSetup] = useState<RouterSetupResponse>(setup)
  const [verifying, setVerifying] = useState(false)
  const [retryingKey, setRetryingKey] = useState<string | null>(null)
  const [deploymentTestResult, setDeploymentTestResult] = useState<RouterDeploymentTestResult | null>(null)
  const [runningDeploymentTest, setRunningDeploymentTest] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const router = latestSetup.router
  const oneRun = useMemo(() => oneRunCommand(latestSetup), [latestSetup])

  // --- Data refresh -------------------------------------------------------
  const refresh = useCallback(async () => {
    try {
      const [setupData, diag] = await Promise.all([
        clientFetchApi<RouterSetupResponse>(`/routers/${router.id}/setup`),
        clientFetchApi<RouterDiagnosticsResponse>(`/routers/${router.id}/diagnostics`),
      ])
      setLatestSetup(setupData)
      setDiagnostics(diag)
      return { setupData, diag }
    } catch {
      // Transient network/auth blips must not break the wizard — the next poll retries.
      return null
    }
  }, [router.id])

  // Poll while the operator is on the Verify step so ticks flip green live as
  // the router calls back, self-tests, and the first customer authenticates.
  useEffect(() => {
    if (step !== 5) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    void refresh()
    pollRef.current = setInterval(() => void refresh(), 6000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [step, refresh])

  const verification = useMemo(() => buildVerification(latestSetup, diagnostics), [latestSetup, diagnostics])
  const criticalPassed = verification.filter((v) => v.critical).every((v) => v.state === 'pass')
  const allPassed = verification.every((v) => v.state === 'pass')

  async function handleCopy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(tag)
      setTimeout(() => setCopied((current) => (current === tag ? null : current)), 2200)
    } catch {
      setCopied(null)
    }
  }

  function handleDownloadTxt() {
    const safe = router.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const body = [
      `AROFi RouterOS deployment script for ${router.name}`,
      `Registration key: ${router.registrationKey ?? ''}`,
      '',
      'OPTION A — one-line install (paste into WinBox > New Terminal, press Enter):',
      oneRun,
      '',
      'OPTION B — full script (only if Option A fails). Paste the whole thing:',
      latestSetup.provisioningScript,
      '',
    ].join('\n')
    downloadFile(`${safe}-arofi-deployment.txt`, body)
  }

  function handleEmail() {
    const subject = encodeURIComponent(`AROFi deployment script — ${router.name}`)
    const lines = [
      `Router: ${router.name}`,
      `Registration key: ${router.registrationKey ?? ''}`,
      '',
      'Paste this one line into WinBox > New Terminal and press Enter:',
      '',
      oneRun,
      '',
      'Full guide: https://arofi.arosoft.io (Routers > Deploy)',
    ]
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`
  }

  function handlePrint() {
    const w = window.open('', '_blank', 'width=820,height=900')
    if (!w) return
    w.document.write(printableHtml(router.name, oneRun, latestSetup.provisioningScript))
    w.document.close()
    w.focus()
    w.print()
  }

  async function handleRetry(key: string) {
    setRetryingKey(key)
    try {
      await clientPostApi(`/routers/${router.id}/self-test`, {})
    } catch {
      // self-test refresh is best-effort; health-check + diagnostics still run
    }
    try {
      await clientPostApi(`/routers/${router.id}/health-check`, {})
    } catch {
      // ignore
    }
    await refresh()
    setRetryingKey(null)
  }

  async function handleVerifyNow() {
    setVerifying(true)
    await handleRetry('all')
    setVerifying(false)
  }

  // Synthetic, protocol-level pre-flight test (see routers.service.ts
  // runDeploymentTest). Does not replace the real phone redemption that
  // drives voucher_auth/client_internet above — it just catches a
  // misconfigured RADIUS secret or unreachable server before that phone test.
  async function handleRunDeploymentTest() {
    setRunningDeploymentTest(true)
    try {
      const result = await clientPostApi<RouterDeploymentTestResult>(`/routers/${router.id}/run-deployment-test`, {})
      setDeploymentTestResult(result)
    } catch (error) {
      setDeploymentTestResult({
        routerId: router.id,
        overallOk: false,
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        note: 'Synthetic pre-flight test only — does not replace a real phone redemption.',
        steps: [{ name: 'request_failed', ok: false, detail: error instanceof Error ? error.message : 'Request failed' }],
      })
    } finally {
      setRunningDeploymentTest(false)
    }
  }

  // --- Render -------------------------------------------------------------
  return (
    <div className="adw-overlay" role="dialog" aria-modal="true">
      <style>{WIZARD_CSS}</style>
      <div className="adw-shell">
        <button type="button" className="adw-close" onClick={onClose} aria-label="Close wizard">×</button>

        {step === -1 && (
          <SuccessSplash
            router={router}
            oneRun={oneRun}
            copied={copied}
            onCopy={() => void handleCopy(oneRun, 'splash')}
            onDownload={handleDownloadTxt}
            onEmail={handleEmail}
            onStart={() => setStep(0)}
          />
        )}

        {step >= 0 && step <= 6 && (
          <>
            <ProgressBar current={step} />
            <div className="adw-body">
              {step === 0 && (
                <FactoryResetStep confirmed={resetConfirmed} setConfirmed={setResetConfirmed} />
              )}
              {step === 1 && <ConnectStep />}
              {step === 2 && <OpenWinboxStep />}
              {step === 3 && (
                <LoginStep confirmed={loginConfirmed} setConfirmed={setLoginConfirmed} />
              )}
              {step === 4 && (
                <PasteScriptStep
                  oneRun={oneRun}
                  fullScript={latestSetup.provisioningScript}
                  copied={copied}
                  confirmed={pasteConfirmed}
                  setConfirmed={setPasteConfirmed}
                  onCopy={(text, tag) => void handleCopy(text, tag)}
                  onDownload={handleDownloadTxt}
                  onPrint={handlePrint}
                />
              )}
              {step === 5 && (
                <VerifyStep
                  verification={verification}
                  criticalPassed={criticalPassed}
                  allPassed={allPassed}
                  verifying={verifying}
                  retryingKey={retryingKey}
                  onRetry={(key) => void handleRetry(key)}
                  onVerifyNow={() => void handleVerifyNow()}
                  router={router}
                  onRunDeploymentTest={() => void handleRunDeploymentTest()}
                  runningDeploymentTest={runningDeploymentTest}
                  deploymentTestResult={deploymentTestResult}
                />
              )}
              {step === 6 && <GoLiveStep />}
            </div>

            <div className="adw-footer">
              <button type="button" className="btn btn-ghost" onClick={() => (step === 0 ? setStep(-1) : setStep(step - 1))}>
                Back
              </button>
              <div className="adw-footer-spacer" />
              {step < 6 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canAdvance(step, { resetConfirmed, loginConfirmed, pasteConfirmed, criticalPassed })}
                  onClick={() => setStep(step + 1)}
                >
                  {advanceLabel(step)}
                </button>
              )}
              {step === 6 && (
                <button type="button" className="btn btn-primary" onClick={() => setStep(7)}>
                  Finish deployment
                </button>
              )}
            </div>
          </>
        )}

        {step === 7 && (
          <DeploymentSuccess
            router={router}
            allPassed={allPassed}
            criticalPassed={criticalPassed}
            onOpenDashboard={() => {
              onOpenDashboard?.()
              onClose()
            }}
            onCreateVoucher={() => {
              onCreateVoucher?.()
              onClose()
            }}
            onBackToVerify={() => setStep(5)}
          />
        )}
      </div>
    </div>
  )
}

// ===========================================================================
//  STEP: registration success splash
// ===========================================================================
function SuccessSplash({
  router,
  oneRun,
  copied,
  onCopy,
  onDownload,
  onEmail,
  onStart,
}: {
  router: RouterSetupResponse['router']
  oneRun: string
  copied: string | null
  onCopy: () => void
  onDownload: () => void
  onEmail: () => void
  onStart: () => void
}) {
  return (
    <div className="adw-splash">
      <div className="adw-splash-check">
        <svg viewBox="0 0 52 52" width="72" height="72" aria-hidden="true">
          <circle cx="26" cy="26" r="25" fill="none" className="adw-check-circle" />
          <path fill="none" className="adw-check-mark" d="M14 27l8 8 16-16" />
        </svg>
      </div>
      <h1 className="adw-splash-title">Router Registered Successfully</h1>
      <div className="adw-splash-grid">
        <div><span>Router Name</span><strong>{router.name}</strong></div>
        <div><span>Router ID</span><strong className="mono">{router.id}</strong></div>
        <div><span>Router Model</span><strong>{router.model ?? router.identity ?? 'MikroTik RouterOS'}</strong></div>
        <div><span>Status</span><strong className="adw-status-ready">Ready For Deployment</strong></div>
      </div>

      <pre className="adw-code">{oneRun}</pre>

      <div className="adw-splash-actions">
        <button type="button" className="btn btn-primary" onClick={onCopy}>
          {copied === 'splash' ? 'Copied ✓' : 'Copy Deployment Script'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDownload}>Download Script (.txt)</button>
        <button type="button" className="btn btn-ghost" onClick={onEmail}>Email Script</button>
        <button type="button" className="btn btn-ghost" onClick={onStart}>View Deployment Guide</button>
      </div>

      <button type="button" className="adw-cta" onClick={onStart}>
        Start guided deployment →
      </button>
    </div>
  )
}

// ===========================================================================
//  Progress indicator
// ===========================================================================
function ProgressBar({ current }: { current: number }) {
  return (
    <div className="adw-progress">
      {WIZARD_STEPS.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'todo'
        return (
          <div key={label} className={`adw-progress-step ${state}`}>
            <span className="adw-progress-dot">{state === 'done' ? '✓' : index + 1}</span>
            <span className="adw-progress-label">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ===========================================================================
//  STEP 1: factory reset
// ===========================================================================
function FactoryResetStep({ confirmed, setConfirmed }: { confirmed: boolean; setConfirmed: (v: boolean) => void }) {
  return (
    <div className="adw-step">
      <h2 className="adw-step-title">Factory Reset the MikroTik</h2>
      <p className="adw-step-sub">A clean reset gives the highest first-time success rate. Follow each step exactly.</p>

      <div className="adw-reset-layout">
        <ResetAnimation />
        <ol className="adw-steplist">
          <li>Disconnect power from the MikroTik.</li>
          <li>Locate the <strong>RESET</strong> hole/button (a small pinhole on most models).</li>
          <li>Press and hold the RESET button using a pin.</li>
          <li>While still holding RESET, connect power.</li>
          <li>Continue holding RESET.</li>
          <li>Wait until the <strong>ACT</strong> light flashes several times (about 3–5 flashes).</li>
          <li>Release the RESET button.</li>
          <li>Wait 2–3 minutes for the router to finish resetting.</li>
        </ol>
      </div>

      <div className="adw-warning">⚠ Factory Reset will erase all previous settings on this router.</div>

      <label className="adw-checkbox">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I have successfully reset my router.
      </label>
    </div>
  )
}

function ResetAnimation() {
  return (
    <div className="adw-device" aria-hidden="true">
      <div className="adw-device-body">
        <div className="adw-led">
          <span className="adw-led-dot act" /> <small>ACT</small>
        </div>
        <div className="adw-reset-hole">
          <span className="adw-pin" />
        </div>
        <div className="adw-ports">
          {Array.from({ length: 5 }).map((_, i) => <span key={i} className="adw-port" />)}
        </div>
      </div>
      <div className="adw-device-caption">Hold RESET while powering on until ACT flashes</div>
    </div>
  )
}

// ===========================================================================
//  STEP 2: connect
// ===========================================================================
function ConnectStep() {
  return (
    <div className="adw-step">
      <h2 className="adw-step-title">Connect to the Router</h2>
      <p className="adw-step-sub">Use a wired connection for the most reliable deployment.</p>
      <div className="adw-reset-layout">
        <div className="adw-illustration">
          <svg viewBox="0 0 220 140" width="100%" aria-hidden="true">
            <rect x="20" y="20" width="80" height="48" rx="6" className="adw-svg-box" />
            <text x="60" y="48" className="adw-svg-text">PC</text>
            <rect x="120" y="20" width="80" height="48" rx="6" className="adw-svg-box" />
            <text x="160" y="48" className="adw-svg-text">MikroTik</text>
            <line x1="100" y1="44" x2="120" y2="44" className="adw-svg-cable" />
            <circle cx="110" cy="44" r="4" className="adw-svg-pulse" />
            <text x="110" y="100" className="adw-svg-sub">LAN port (not ether1/WAN)</text>
          </svg>
        </div>
        <ol className="adw-steplist">
          <li>Connect your computer to any <strong>LAN port</strong> (avoid ether1 / the WAN port).</li>
          <li>Open <strong>WinBox</strong>.</li>
          <li>Wait for the router to appear under the <strong>Neighbors</strong> tab.</li>
          <li>Click the discovered router to select it.</li>
        </ol>
      </div>
    </div>
  )
}

// ===========================================================================
//  STEP 3: open winbox
// ===========================================================================
function OpenWinboxStep() {
  return (
    <div className="adw-step">
      <h2 className="adw-step-title">Open WinBox &amp; Find the Router</h2>
      <p className="adw-step-sub">WinBox is MikroTik&apos;s free management tool. Download it from mikrotik.com/download if you don&apos;t have it.</p>
      <div className="adw-winbox-mock">
        <div className="adw-winbox-tabs"><span className="on">Neighbors</span><span>Managed</span></div>
        <table className="adw-winbox-table">
          <thead><tr><th>MAC Address</th><th>IP Address</th><th>Identity</th></tr></thead>
          <tbody>
            <tr className="adw-winbox-row"><td className="mono">E4:8D:8C:xx:xx:xx</td><td className="mono">0.0.0.0</td><td>MikroTik</td></tr>
          </tbody>
        </table>
        <p className="adw-winbox-hint">Click the row, then connect. If the IP shows 0.0.0.0, connect by <strong>MAC address</strong>.</p>
      </div>
    </div>
  )
}

// ===========================================================================
//  STEP 4: login
// ===========================================================================
function LoginStep({ confirmed, setConfirmed }: { confirmed: boolean; setConfirmed: (v: boolean) => void }) {
  return (
    <div className="adw-step">
      <h2 className="adw-step-title">Log in to RouterOS</h2>
      <div className="adw-cred-grid">
        <div className="adw-cred"><span>Username</span><strong className="mono">admin</strong></div>
        <div className="adw-cred"><span>Password</span><strong className="mono">(blank — leave empty)</strong></div>
      </div>
      <div className="adw-note">
        <strong>If MikroTik asks you to change the password:</strong>
        <ul>
          <li>Current Password: <em>(blank)</em></li>
          <li>New Password: choose a strong password.</li>
          <li>Confirm Password: repeat your chosen password.</li>
        </ul>
      </div>
      <div className="adw-warning">⚠ AROFi cannot recover forgotten passwords. Store the new password somewhere safe.</div>
      <label className="adw-checkbox">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I have logged into the router.
      </label>
    </div>
  )
}

// ===========================================================================
//  STEP 5: paste script
// ===========================================================================
function PasteScriptStep({
  oneRun,
  fullScript,
  copied,
  confirmed,
  setConfirmed,
  onCopy,
  onDownload,
  onPrint,
}: {
  oneRun: string
  fullScript: string
  copied: string | null
  confirmed: boolean
  setConfirmed: (v: boolean) => void
  onCopy: (text: string, tag: string) => void
  onDownload: () => void
  onPrint: () => void
}) {
  const [showFull, setShowFull] = useState(false)
  return (
    <div className="adw-step">
      <h2 className="adw-step-title">Paste the Deployment Script</h2>
      <p className="adw-step-sub">In WinBox open <strong>New Terminal</strong>, paste the line below, and press Enter.</p>

      <pre className="adw-code">{oneRun}</pre>
      <div className="adw-splash-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => onCopy(oneRun, 'paste')}>
          {copied === 'paste' ? 'Copied ✓' : 'Copy command'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDownload}>Download</button>
        <button type="button" className="btn btn-ghost" onClick={onPrint}>Print Instructions</button>
        <button type="button" className="btn btn-ghost" onClick={() => setShowFull((v) => !v)}>
          {showFull ? 'Hide full script' : 'Show full script'}
        </button>
      </div>

      {showFull && (
        <>
          <p className="adw-step-sub" style={{ marginTop: 12 }}>Only use the full script if the one-line command fails. Paste the entire block.</p>
          <pre className="adw-code adw-code-scroll">{fullScript}</pre>
          <button type="button" className="btn btn-ghost" onClick={() => onCopy(fullScript, 'full')} style={{ marginTop: 8 }}>
            {copied === 'full' ? 'Copied ✓' : 'Copy full script'}
          </button>
        </>
      )}

      <ol className="adw-steplist" style={{ marginTop: 16 }}>
        <li>Open <strong>New Terminal</strong> in WinBox.</li>
        <li>Copy the entire command/script.</li>
        <li>Paste it into the terminal.</li>
        <li>Press <strong>Enter</strong>.</li>
        <li>Wait until execution completes (you&apos;ll see AROFi progress lines).</li>
        <li><strong>Do not close WinBox</strong> during deployment.</li>
      </ol>

      <label className="adw-checkbox">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I pasted the script and it finished running.
      </label>
    </div>
  )
}

// ===========================================================================
//  STEP 6: verify
// ===========================================================================
function VerifyStep({
  verification,
  criticalPassed,
  allPassed,
  verifying,
  retryingKey,
  onRetry,
  onVerifyNow,
  router,
  onRunDeploymentTest,
  runningDeploymentTest,
  deploymentTestResult,
}: {
  verification: VerificationItem[]
  criticalPassed: boolean
  allPassed: boolean
  verifying: boolean
  retryingKey: string | null
  onRetry: (key: string) => void
  onVerifyNow: () => void
  router: RouterSetupResponse['router']
  onRunDeploymentTest: () => void
  runningDeploymentTest: boolean
  deploymentTestResult: RouterDeploymentTestResult | null
}) {
  return (
    <div className="adw-step">
      <h2 className="adw-step-title">Automatic Validation</h2>
      <p className="adw-step-sub">
        AROFi is verifying the router live. This updates automatically as the router calls back and the first
        customer authenticates. A router is marked deployed only when the critical checks pass.
      </p>

      <div className={`adw-verify-banner ${allPassed ? 'ok' : criticalPassed ? 'warn' : 'pending'}`}>
        {allPassed
          ? 'All systems verified — deployment is fully operational.'
          : criticalPassed
            ? 'Critical systems verified. A few non-critical checks are still pending.'
            : 'Waiting for verification signals from the router…'}
        <button type="button" className="btn btn-ghost adw-verify-now" onClick={onVerifyNow} disabled={verifying}>
          {verifying ? 'Checking…' : 'Re-check now'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 14px' }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Health score: <strong>{router.healthScore ?? 0}%</strong> · Status: <strong>{router.dashboardState ?? 'OFFLINE'}</strong>
        </span>
        <button type="button" className="btn btn-ghost" onClick={onRunDeploymentTest} disabled={runningDeploymentTest}>
          {runningDeploymentTest ? 'Running test…' : 'Run automated test now'}
        </button>
      </div>
      {deploymentTestResult && (
        <p className="adw-verify-foot" style={{ marginTop: -6 }}>
          Automated test: <strong>{deploymentTestResult.overallOk ? 'PASS' : 'FAIL'}</strong> —{' '}
          {deploymentTestResult.steps.map((s) => s.detail).join(' ')}
        </p>
      )}

      <div className="adw-checklist">
        {verification.map((item) => (
          <div key={item.key} className={`adw-check-row ${item.state}`}>
            <span className="adw-check-icon">
              {item.state === 'pass' ? '✓' : item.state === 'fail' ? '✕' : '…'}
            </span>
            <div className="adw-check-main">
              <div className="adw-check-label">
                {item.label}
                {item.critical && <span className="adw-critical-tag">critical</span>}
              </div>
              {item.state !== 'pass' && (
                <div className="adw-check-detail">
                  <span className="adw-check-problem">{item.problem}</span>
                  <span className="adw-check-fix">Fix: {item.fix}</span>
                </div>
              )}
            </div>
            {item.state !== 'pass' && (
              <button
                type="button"
                className="btn btn-ghost adw-retry"
                onClick={() => onRetry(item.key)}
                disabled={retryingKey !== null}
              >
                {retryingKey === item.key ? 'Retrying…' : 'Retry'}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="adw-verify-foot">
        Tip: the &quot;Voucher authentication&quot; and &quot;Client internet&quot; checks turn green only after a real test
        voucher is redeemed on a phone. Keep this open and run the Go-Live test next.
        {' '}Router status: <strong>{router.liveState ?? router.onboardingStatus ?? 'pending'}</strong>.
      </p>
    </div>
  )
}

// ===========================================================================
//  STEP 7: go-live checklist
// ===========================================================================
function GoLiveStep() {
  const items = [
    'Connect a phone to the new WiFi network.',
    'Open a browser — the captive portal should open automatically.',
    'Redeem a test voucher.',
    'Verify the phone gets internet access after connecting.',
    'Verify the dashboard shows an active session.',
    'Verify accounting updates (data/time counting up).',
    'Verify bandwidth limits apply to the package.',
  ]
  return (
    <div className="adw-step">
      <h2 className="adw-step-title">Go-Live Checklist</h2>
      <p className="adw-step-sub">Do a real end-to-end test on a phone. This is the truest proof the hotspot works.</p>
      <ul className="adw-golive">
        {items.map((text) => (
          <li key={text}><span className="adw-golive-box" />{text}</li>
        ))}
      </ul>
    </div>
  )
}

// ===========================================================================
//  Final success
// ===========================================================================
function DeploymentSuccess({
  router,
  allPassed,
  criticalPassed,
  onOpenDashboard,
  onCreateVoucher,
  onBackToVerify,
}: {
  router: RouterSetupResponse['router']
  allPassed: boolean
  criticalPassed: boolean
  onOpenDashboard: () => void
  onCreateVoucher: () => void
  onBackToVerify: () => void
}) {
  if (!criticalPassed) {
    return (
      <div className="adw-splash">
        <h1 className="adw-splash-title">Almost there — not verified yet</h1>
        <p className="adw-step-sub" style={{ textAlign: 'center', maxWidth: 520 }}>
          AROFi has not yet observed all the critical signals (internet, NAT, DHCP, DNS, hotspot, RADIUS, and a
          real authenticated client). The router will not be marked successfully deployed until these pass — this is
          deliberate, so a half-working hotspot never looks &quot;done&quot;.
        </p>
        <div className="adw-splash-actions">
          <button type="button" className="btn btn-primary" onClick={onBackToVerify}>Back to validation</button>
          <button type="button" className="btn btn-ghost" onClick={onOpenDashboard}>Open dashboard anyway</button>
        </div>
      </div>
    )
  }
  return (
    <div className="adw-splash">
      <div className="adw-splash-check">
        <svg viewBox="0 0 52 52" width="72" height="72" aria-hidden="true">
          <circle cx="26" cy="26" r="25" fill="none" className="adw-check-circle" />
          <path fill="none" className="adw-check-mark" d="M14 27l8 8 16-16" />
        </svg>
      </div>
      <h1 className="adw-splash-title">Congratulations 🎉</h1>
      <p className="adw-step-sub" style={{ textAlign: 'center', maxWidth: 520 }}>
        Your hotspot <strong>{router.name}</strong> is now live. Customers can connect to WiFi, open a browser,
        redeem vouchers, and receive internet access.
        {!allPassed && ' (A couple of non-critical checks are still settling, but the core flow is verified.)'}
      </p>
      <div className="adw-splash-actions">
        <button type="button" className="btn btn-primary" onClick={onOpenDashboard}>Open Dashboard</button>
        <button type="button" className="btn btn-ghost" onClick={onCreateVoucher}>Create Voucher</button>
        <button type="button" className="btn btn-ghost" onClick={onCreateVoucher}>Test Voucher</button>
        <button type="button" className="btn btn-ghost" onClick={onOpenDashboard}>View Active Users</button>
      </div>
    </div>
  )
}

// ===========================================================================
//  Helpers
// ===========================================================================
function canAdvance(
  step: number,
  flags: { resetConfirmed: boolean; loginConfirmed: boolean; pasteConfirmed: boolean; criticalPassed: boolean },
): boolean {
  if (step === 0) return flags.resetConfirmed
  if (step === 3) return flags.loginConfirmed
  if (step === 4) return flags.pasteConfirmed
  // Verify step: allow continuing to Go-Live regardless (the real gate is the
  // final success page, which requires criticalPassed), so users can run the
  // phone test that actually flips the last checks green.
  return true
}

function advanceLabel(step: number): string {
  if (step === 4) return 'I pasted it — verify'
  if (step === 5) return 'Continue to Go-Live'
  return 'Continue'
}

function oneRunCommand(setup: RouterSetupResponse): string {
  return (
    setup.oneRunCommand ??
    `/tool fetch url="https://arofi.arosoft.io/api/mikrotik/script/${setup.router.registrationKey}" dst-path="arofi-setup.rsc" mode=https; /import file-name="arofi-setup.rsc"; /file remove "arofi-setup.rsc"`
  )
}

function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function printableHtml(routerName: string, oneRun: string, fullScript: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>AROFi Deployment — ${esc(routerName)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;padding:24px;line-height:1.5}
h1{font-size:20px}h2{font-size:15px;margin-top:22px}pre{background:#0b1220;color:#dbe7ff;padding:14px;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:11px}
ol{font-size:14px}</style></head><body>
<h1>AROFi RouterOS Deployment — ${esc(routerName)}</h1>
<h2>Steps</h2>
<ol><li>Factory reset the MikroTik.</li><li>Connect a PC to a LAN port and open WinBox.</li>
<li>Login as admin (blank password).</li><li>Open New Terminal.</li>
<li>Paste the one-line command below and press Enter.</li><li>Wait for it to finish. Do not close WinBox.</li></ol>
<h2>One-line command</h2><pre>${esc(oneRun)}</pre>
<h2>Full script (only if the one-line command fails)</h2><pre>${esc(fullScript)}</pre>
</body></html>`
}

// ===========================================================================
//  Styles (scoped via class prefix adw-)
// ===========================================================================
const WIZARD_CSS = `
.adw-overlay{position:fixed;inset:0;z-index:1000;background:rgba(7,12,24,.72);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px}
.adw-shell{position:relative;width:min(940px,100%);background:var(--bg-app,#0f1729);border:1px solid var(--border,#1e293b);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.5);margin:auto;overflow:hidden}
.adw-close{position:absolute;top:12px;right:14px;z-index:5;background:transparent;border:none;color:var(--text-muted,#94a3b8);font-size:26px;line-height:1;cursor:pointer}
.adw-close:hover{color:var(--text-1,#e2e8f0)}
.adw-splash{padding:40px 32px;display:flex;flex-direction:column;align-items:center;gap:16px}
.adw-splash-title{font-size:24px;font-weight:800;color:var(--text-1,#e2e8f0);text-align:center;margin:0}
.adw-splash-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px;width:100%;max-width:560px;margin-top:6px}
.adw-splash-grid>div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;background:var(--surface-muted,#1e293b);border-radius:10px}
.adw-splash-grid span{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#94a3b8)}
.adw-splash-grid strong{font-size:14px;color:var(--text-1,#e2e8f0);word-break:break-all}
.adw-status-ready{color:#34d399 !important}
.adw-splash-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px}
.adw-cta{margin-top:6px;background:none;border:none;color:#34d399;font-weight:700;font-size:14px;cursor:pointer}
.adw-code{width:100%;max-width:760px;background:#0b1220;border:1px solid var(--border,#1e293b);border-radius:12px;padding:14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;color:#dbe7ff;white-space:pre-wrap;word-break:break-word;margin:14px 0 0}
.adw-code-scroll{max-height:260px;overflow:auto}
.adw-splash-check{margin-bottom:4px}
.adw-check-circle{stroke:#34d399;stroke-width:2;stroke-dasharray:160;stroke-dashoffset:160;animation:adw-dash .6s ease forwards}
.adw-check-mark{stroke:#34d399;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:48;stroke-dashoffset:48;animation:adw-dash .4s .5s ease forwards}
@keyframes adw-dash{to{stroke-dashoffset:0}}
.adw-progress{display:flex;gap:4px;padding:18px 24px 8px;flex-wrap:wrap;border-bottom:1px solid var(--border,#1e293b)}
.adw-progress-step{display:flex;align-items:center;gap:7px;flex:1;min-width:96px}
.adw-progress-dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:var(--surface-muted,#1e293b);color:var(--text-muted,#94a3b8);flex-shrink:0}
.adw-progress-step.active .adw-progress-dot{background:#34d399;color:#06281d}
.adw-progress-step.done .adw-progress-dot{background:#10b981;color:#fff}
.adw-progress-label{font-size:11.5px;color:var(--text-muted,#94a3b8)}
.adw-progress-step.active .adw-progress-label{color:var(--text-1,#e2e8f0);font-weight:700}
.adw-body{padding:24px 28px;max-height:62vh;overflow-y:auto}
.adw-step-title{font-size:19px;font-weight:800;color:var(--text-1,#e2e8f0);margin:0 0 6px}
.adw-step-sub{font-size:13.5px;color:var(--text-2,#cbd5e1);margin:0 0 16px;line-height:1.5}
.adw-reset-layout{display:grid;grid-template-columns:240px 1fr;gap:22px;align-items:start}
@media(max-width:640px){.adw-reset-layout{grid-template-columns:1fr}}
.adw-steplist{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:9px;color:var(--text-2,#cbd5e1);font-size:13.5px;line-height:1.45}
.adw-steplist strong{color:var(--text-1,#e2e8f0)}
.adw-warning{margin-top:16px;padding:11px 14px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:10px;color:#fbbf24;font-size:13px}
.adw-checkbox{display:flex;align-items:center;gap:10px;margin-top:16px;font-size:14px;color:var(--text-1,#e2e8f0);cursor:pointer}
.adw-checkbox input{width:17px;height:17px;accent-color:#10b981}
.adw-device{display:flex;flex-direction:column;align-items:center;gap:10px}
.adw-device-body{width:200px;height:96px;background:linear-gradient(145deg,#1f2a44,#13203a);border:1px solid #2b3a5c;border-radius:12px;position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:12px}
.adw-led{display:flex;align-items:center;gap:6px;color:#7c8aa6;font-size:9px}
.adw-led-dot{width:8px;height:8px;border-radius:50%;background:#22303f}
.adw-led-dot.act{background:#34d399;animation:adw-flash 1s steps(1) infinite}
@keyframes adw-flash{0%,49%{opacity:1}50%,100%{opacity:.18}}
.adw-reset-hole{position:absolute;right:14px;top:14px;width:16px;height:16px;border-radius:50%;background:#0a1120;border:2px solid #2b3a5c;display:flex;align-items:center;justify-content:center}
.adw-pin{width:2px;height:0;background:#cbd5e1;animation:adw-press 1.6s ease-in-out infinite}
@keyframes adw-press{0%,100%{height:0}40%,60%{height:10px}}
.adw-ports{display:flex;gap:5px}
.adw-port{width:18px;height:14px;background:#0a1120;border:1px solid #2b3a5c;border-radius:2px}
.adw-device-caption{font-size:11px;color:var(--text-muted,#94a3b8);text-align:center;max-width:200px}
.adw-illustration{background:var(--surface-muted,#1e293b);border-radius:12px;padding:14px}
.adw-svg-box{fill:#13203a;stroke:#2b3a5c}
.adw-svg-text{fill:#e2e8f0;font-size:12px;text-anchor:middle;font-family:inherit}
.adw-svg-sub{fill:#94a3b8;font-size:9px;text-anchor:middle}
.adw-svg-cable{stroke:#34d399;stroke-width:2.5}
.adw-svg-pulse{fill:#34d399;animation:adw-travel 1.4s linear infinite}
@keyframes adw-travel{0%{transform:translateX(-9px)}100%{transform:translateX(9px)}}
.adw-winbox-mock{background:var(--surface-muted,#1e293b);border:1px solid var(--border,#1e293b);border-radius:12px;overflow:hidden}
.adw-winbox-tabs{display:flex;gap:0;background:#0b1220}
.adw-winbox-tabs span{padding:8px 16px;font-size:12px;color:#94a3b8}
.adw-winbox-tabs span.on{background:var(--surface-muted,#1e293b);color:#e2e8f0;font-weight:700}
.adw-winbox-table{width:100%;border-collapse:collapse;font-size:12.5px}
.adw-winbox-table th{text-align:left;padding:8px 14px;color:#94a3b8;font-weight:600;border-bottom:1px solid var(--border,#1e293b)}
.adw-winbox-table td{padding:8px 14px;color:#e2e8f0}
.adw-winbox-row{cursor:pointer;animation:adw-rowglow 2s ease-in-out infinite}
@keyframes adw-rowglow{0%,100%{background:transparent}50%{background:rgba(52,211,153,.12)}}
.adw-winbox-hint{padding:10px 14px;margin:0;font-size:12px;color:#94a3b8}
.adw-cred-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:560px){.adw-cred-grid{grid-template-columns:1fr}}
.adw-cred{padding:14px 16px;background:var(--surface-muted,#1e293b);border-radius:10px;display:flex;flex-direction:column;gap:4px}
.adw-cred span{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8}
.adw-cred strong{font-size:16px;color:#e2e8f0}
.adw-note{padding:12px 16px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.3);border-radius:10px;font-size:13px;color:var(--text-2,#cbd5e1)}
.adw-note ul{margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.adw-footer{display:flex;align-items:center;gap:12px;padding:16px 24px;border-top:1px solid var(--border,#1e293b)}
.adw-footer-spacer{flex:1}
.adw-verify-banner{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-radius:10px;font-size:13.5px;font-weight:600;margin-bottom:16px}
.adw-verify-banner.ok{background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.4);color:#34d399}
.adw-verify-banner.warn{background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);color:#fbbf24}
.adw-verify-banner.pending{background:var(--surface-muted,#1e293b);border:1px solid var(--border,#1e293b);color:var(--text-2,#cbd5e1)}
.adw-verify-now{margin-left:auto}
.adw-checklist{display:flex;flex-direction:column;gap:8px}
.adw-check-row{display:flex;align-items:flex-start;gap:12px;padding:11px 14px;border-radius:10px;background:var(--surface-muted,#1e293b);border:1px solid var(--border,#1e293b)}
.adw-check-row.pass{border-color:rgba(16,185,129,.4)}
.adw-check-row.fail{border-color:rgba(248,113,113,.4)}
.adw-check-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
.adw-check-row.pass .adw-check-icon{background:#10b981;color:#fff}
.adw-check-row.fail .adw-check-icon{background:#ef4444;color:#fff}
.adw-check-row.pending .adw-check-icon{background:#334155;color:#cbd5e1;animation:adw-pulse 1.4s ease-in-out infinite}
@keyframes adw-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.adw-check-main{flex:1}
.adw-check-label{font-size:13.5px;font-weight:600;color:var(--text-1,#e2e8f0);display:flex;align-items:center;gap:8px}
.adw-critical-tag{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;background:rgba(248,113,113,.16);color:#f87171;padding:1px 6px;border-radius:5px;font-weight:700}
.adw-check-detail{display:flex;flex-direction:column;gap:2px;margin-top:4px}
.adw-check-problem{font-size:12px;color:#cbd5e1}
.adw-check-fix{font-size:12px;color:#94a3b8}
.adw-retry{flex-shrink:0;padding:4px 10px !important;font-size:12px !important}
.adw-verify-foot{margin-top:16px;font-size:12.5px;color:#94a3b8;line-height:1.5}
.adw-golive{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.adw-golive li{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-2,#cbd5e1)}
.adw-golive-box{width:18px;height:18px;border:2px solid #334155;border-radius:5px;flex-shrink:0}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
`
