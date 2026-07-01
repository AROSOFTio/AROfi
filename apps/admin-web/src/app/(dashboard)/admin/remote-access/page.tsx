'use client'

import { useEffect, useState, useMemo } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { buildRemoteAccessInstallCommand } from '@/lib/mikrotik-commands'
import type { RouterOverviewResponse, RouterSetupResponse } from '@/lib/admin-types'
import { 
  Globe, 
  ShieldAlert, 
  Terminal, 
  Cpu, 
  RefreshCw, 
  AlertCircle,
  Copy,
  Check,
  Link2
} from 'lucide-react'

export default function RemoteAccessPage() {
  const [loading, setLoading] = useState(true)
  const [routers, setRouters] = useState<any[]>([])
  const [selectedRouterId, setSelectedRouterId] = useState<string>('')
  const [selectedSetup, setSelectedSetup] = useState<RouterSetupResponse | null>(null)
  const [loadingSetup, setLoadingSetup] = useState(false)
  const [activeTab, setActiveTab] = useState<'status' | 'install' | 'connect'>('status')
  const [error, setError] = useState<string | null>(null)
  
  // Action states
  const [openingPort, setOpeningPort] = useState(false)
  const [closingPort, setClosingPort] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [tunnelTest, setTunnelTest] = useState<{
    reachable: boolean
    latencyMs?: number
    message: string
    testedAt: string
  } | null>(null)

  const loadRouters = async () => {
    try {
      setLoading(true)
      const data = await clientFetchApi<RouterOverviewResponse>('/routers/overview')
      const allRouters = data.routers || []
      setRouters(allRouters)
      if (allRouters.length > 0) {
        setSelectedRouterId(allRouters[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch routers')
    } finally {
      setLoading(false)
    }
  }

  const loadSetup = async (routerId: string) => {
    if (!routerId) return
    try {
      setLoadingSetup(true)
      setError(null)
      const setup = await clientFetchApi<RouterSetupResponse>(`/routers/${routerId}/setup`)
      setSelectedSetup(setup)
      setTunnelTest(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load router details')
    } finally {
      setLoadingSetup(false)
    }
  }

  useEffect(() => {
    loadRouters()
  }, [])

  useEffect(() => {
    if (selectedRouterId) {
      loadSetup(selectedRouterId)
    }
  }, [selectedRouterId])

  const selectedRouter = selectedSetup?.router

  // The "Port Open" badge only reflects whether the proxy mapping is switched
  // on in the DB - it says nothing about whether the router's SSTP tunnel is
  // actually up right now. Auto-probe as soon as we know the port is open so
  // the page never silently shows a stale "Connected" state.
  useEffect(() => {
    if (selectedRouter?.id && selectedRouter.isRemotePortOpen && !tunnelTest && !testingConnection) {
      handleTestConnection(selectedRouter.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouter?.id, selectedRouter?.isRemotePortOpen])

  // Handle test connection - probes the router's actual SSTP tunnel IP, not
  // the unrelated host:apiPort used by the generic router health-check.
  const handleTestConnection = async (routerId: string) => {
    try {
      setTestingConnection(true)
      setError(null)
      const result = await clientPostApi<{ reachable: boolean; latencyMs?: number; message: string; testedAt: string }>(
        `/routers/${routerId}/remote-access/test`,
        {},
      )
      setTunnelTest(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test connection failed')
    } finally {
      setTestingConnection(false)
    }
  }

  // Handle open port
  const handleOpenRemotePort = async () => {
    if (!selectedRouter) return
    try {
      setOpeningPort(true)
      setError(null)
      await clientPostApi(`/routers/${selectedRouter.id}/remote-access/open`)
      await loadSetup(selectedRouter.id)
      await handleTestConnection(selectedRouter.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open remote port')
    } finally {
      setOpeningPort(false)
    }
  }

  // Handle close port
  const handleCloseRemotePort = async () => {
    if (!selectedRouter) return
    try {
      setClosingPort(true)
      setError(null)
      await clientPostApi(`/routers/${selectedRouter.id}/remote-access/close`)
      await loadSetup(selectedRouter.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close remote port')
    } finally {
      setClosingPort(false)
    }
  }

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(type)
    setTimeout(() => setCopiedText(null), 2000)
  }

  const installCommand = useMemo(() => {
    if (!selectedRouter) return ''
    return buildRemoteAccessInstallCommand(selectedRouter.remoteToken)
  }, [selectedRouter])

  const winboxAddress = useMemo(() => {
    if (!selectedRouter) return ''
    const vpnHost = process.env.NEXT_PUBLIC_VPN_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'app.arofi.net')
    return `${vpnHost}:${selectedRouter.remotePort || ''}`
  }, [selectedRouter])

  if (loading && routers.length === 0) {
    return (
      <div className="card" style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <RefreshCw className="animate-spin text-primary" size={32} />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading remote configuration...</span>
        </div>
      </div>
    )
  }

  if (routers.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <AlertCircle style={{ color: 'var(--danger-fg)', marginBottom: 12 }} size={40} />
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>No Routers Registered</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
          You must register a router under router settings before you can enable Remote Winbox Access.
        </p>
      </div>
    )
  }

  const isPortOpen = selectedRouter?.isRemotePortOpen

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 880, margin: '0 auto' }}>
      
      {/* Header with selection */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ p: 10, background: 'var(--blue-light)', color: 'var(--primary)', borderRadius: 10 }}>
            <Globe size={24} />
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Remote Winbox Access</h1>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Configure outbound SSTP client for CGNAT traversal</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={selectedRouterId}
            onChange={(e) => setSelectedRouterId(e.target.value)}
            className="form-control"
            style={{ minWidth: 200, padding: '8px 12px', borderRadius: 8, height: 'auto' }}
          >
            {routers.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <span className={`badge ${isPortOpen ? 'badge-success' : 'badge-danger'}`} title="Whether the proxy port mapping is switched on - not proof the SSTP tunnel itself is currently up">
            {isPortOpen ? 'Port Open' : 'Port Closed'}
          </span>
        </div>
      </div>

      {error && (
        <div className="card" style={{ border: '1px solid var(--danger-fg)', background: 'rgba(239, 68, 68, 0.05)', padding: 14 }}>
          <p style={{ color: 'var(--danger-fg)', fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} /> {error}
          </p>
        </div>
      )}

      {/* Security Reminder Callout */}
      <div style={{
        padding: 16,
        border: '1px solid var(--amber-mid)',
        borderRadius: 12,
        background: 'var(--amber-light)',
        color: 'var(--amber-dark)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start'
      }}>
        <ShieldAlert style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 14 }}>Security Reminder</strong>
          <span style={{ fontSize: 13, lineHeight: 1.4 }}>
            Always close your ports if you are not using them to avoid malicious attacks. You can always open your ports again when you want to access your devices.
          </span>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="card" style={{ padding: 6 }}>
        <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: 8, padding: 3 }}>
          {(['status', 'install', 'connect'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
              style={{ 
                flex: 1, 
                padding: '10px 16px', 
                fontSize: 13, 
                borderRadius: 6,
                fontWeight: activeTab === tab ? 600 : 500,
                boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none',
                height: 'auto'
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="card" style={{ padding: 24 }}>
        
        {/* Status Tab */}
        {activeTab === 'status' && (
          <div style={{ display: 'grid', gap: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 10, margin: 0 }}>
              Connection Status
            </h3>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Port Mapping</span>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: isPortOpen ? 'var(--success-fg)' : 'var(--danger-fg)',
                    boxShadow: isPortOpen ? '0 0 8px var(--success-fg)' : 'none'
                  }} />
                  {isPortOpen ? 'Port Open / Traversal Active' : 'Port Closed'}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Configured Address</span>
                <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {isPortOpen ? `Port ${selectedRouter?.remotePort || 'N/A'} Open` : 'Remote access disabled'}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Tunnel Reachability
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Live check of the router's SSTP tunnel - separate from port mapping above
                  </div>
                </span>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'right' }}>
                  {tunnelTest ? (
                    <>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: tunnelTest.reachable ? 'var(--success-fg)' : 'var(--danger-fg)',
                        boxShadow: tunnelTest.reachable ? '0 0 8px var(--success-fg)' : 'none',
                        flexShrink: 0
                      }} />
                      <span style={{ fontSize: 13 }}>
                        {tunnelTest.reachable
                          ? `Reachable${tunnelTest.latencyMs != null ? ` (${tunnelTest.latencyMs}ms)` : ''}`
                          : tunnelTest.message}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Not tested yet</span>
                  )}
                </strong>
              </div>
            </div>

            {tunnelTest && !tunnelTest.reachable && (
              <div style={{
                padding: 14,
                border: '1px solid #f59e0b',
                borderRadius: 10,
                background: '#fffbeb',
                fontSize: 13,
                color: '#92400e',
                lineHeight: 1.5,
                display: 'grid',
                gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <AlertCircle size={15} style={{ color: '#d97706', flexShrink: 0 }} />
                  <strong>SSTP tunnel is not connected</strong>
                </div>
                <span>
                  The SSTP tunnel is not connected. Go to the{' '}
                  <button type="button" onClick={() => setActiveTab('install')} style={{ background: 'none', border: 'none', color: '#d97706', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 13 }}>Install tab</button>{' '}
                  and re-run the install script — it now uses WireGuard which works on all RouterOS 7 routers without any device-mode restrictions.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {!isPortOpen ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minWidth: 150 }}
                  onClick={handleOpenRemotePort}
                  disabled={openingPort || loadingSetup}
                >
                  {openingPort ? 'Opening Port...' : 'Open Port'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ minWidth: 150, backgroundColor: 'var(--danger-fg)', color: 'white' }}
                  onClick={handleCloseRemotePort}
                  disabled={closingPort || loadingSetup}
                >
                  {closingPort ? 'Closing Port...' : 'Close Port'}
                </button>
              )}

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => selectedRouterId && loadSetup(selectedRouterId)}
                disabled={loadingSetup}
              >
                <RefreshCw size={14} className={loadingSetup ? 'animate-spin' : ''} style={{ marginRight: 6 }} /> Refresh Status
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => selectedRouter && handleTestConnection(selectedRouter.id)}
                disabled={testingConnection || !isPortOpen}
              >
                <Link2 size={14} className={testingConnection ? 'animate-spin' : ''} style={{ marginRight: 6 }} /> {testingConnection ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>
        )}

        {/* Install Tab */}
        {activeTab === 'install' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 10, margin: 0 }}>
              Automatic Installation Script
            </h3>

            {/* WireGuard info banner */}
            <div style={{
              padding: 14,
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              background: '#f0fdf4',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>✅</span>
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 13, color: '#166534' }}>WireGuard — works on all RouterOS 7 routers, no device-mode change needed</strong>
                <span style={{ fontSize: 12.5, color: '#15803d', lineHeight: 1.5 }}>
                  AROFi now uses WireGuard for remote access. It is built into RouterOS 7 and does not require enterprise mode.
                  If you previously saw "SSTP client blocked", this script fixes that permanently.
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Run this command in the WinBox Terminal</strong>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                Paste the command below into the MikroTik WinBox Terminal. It sets up a WireGuard VPN tunnel to AROFi cloud — no button presses or reboots required.
              </p>
            </div>

            <div style={{
              position: 'relative',
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'var(--text-secondary)',
              wordBreak: 'break-all',
              lineHeight: 1.5,
              userSelect: 'all'
            }}>
              {installCommand}

              <button
                type="button"
                onClick={() => handleCopy(installCommand, 'install')}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 6,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                {copiedText === 'install' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* Connect Tab */}
        {activeTab === 'connect' && (
          <div style={{ display: 'grid', gap: 18 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 10, margin: 0 }}>
              Winbox Connection Parameters
            </h3>

            {!isPortOpen ? (
              <div style={{ textAlign: 'center', padding: '20px 0', display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  The remote port is closed. Turn on the port mapping first from the Status tab.
                </span>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Connect To:</span>
                  <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{winboxAddress}</strong>

                  <span style={{ color: 'var(--text-secondary)' }}>Login:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>admin</strong>

                  <span style={{ color: 'var(--text-secondary)' }}>Password:</span>
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Use your current router admin password</span>
                </div>

                <div style={{
                  padding: 12,
                  background: 'var(--bg-muted)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45
                }}>
                  Open the WinBox desktop client on your PC. Copy the Connect To address above, paste it into the Connect To input box, fill in your router username and password, and click Connect.
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleCopy(winboxAddress, 'address')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {copiedText === 'address' ? <Check size={16} /> : <Copy size={16} />}
                  {copiedText === 'address' ? 'Copied!' : 'Copy WinBox Address'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
