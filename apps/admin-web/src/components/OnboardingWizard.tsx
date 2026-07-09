'use client'

import { useState, useEffect, FormEvent, useMemo } from 'react'
import {
  Check, 
  Copy, 
  RefreshCw, 
  Radio, 
  Cpu, 
  Sparkles, 
  ArrowRight, 
  Plus, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  BookOpen,
  Wifi,
  Package,
  Ticket
} from 'lucide-react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { buildSetupFallbackCommand } from '@/lib/mikrotik-commands'
import { AdminSessionResponse } from '@/lib/admin-types'
import { DurationInput } from '@/components/DurationInput'

type OnboardingWizardProps = {
  session: AdminSessionResponse
  initialHasRouter: boolean
  initialRouter: any | null
  initialHasPackage: boolean
  initialHasVouchers: boolean
  onComplete: () => void
}

export default function OnboardingWizard({
  session,
  initialHasRouter,
  initialRouter,
  initialHasPackage,
  initialHasVouchers,
  onComplete
}: OnboardingWizardProps) {
  const resolveOneRunCommand = (value: { oneRunCommand?: string; router?: { registrationKey?: string | null }; registrationKey?: string | null } | null | undefined) => {
    const registrationKey = value?.router?.registrationKey ?? value?.registrationKey
    return value?.oneRunCommand ?? (registrationKey ? buildSetupFallbackCommand(registrationKey) : '')
  }

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Step 1 states
  const [routerForm, setRouterForm] = useState({
    name: '',
    siteLabel: '',
    scriptMode: 'FRESH_FULL_CAPTIVE_WIFI' as 'FRESH_FULL_CAPTIVE_WIFI' | 'SAFE_EXISTING_ROUTER',
  })
  
  // Registered router state
  const [registeredRouter, setRegisteredRouter] = useState<any | null>(initialRouter)
  const [setupCommand, setSetupCommand] = useState(() => resolveOneRunCommand(initialRouter))
  const [pollingActive, setPollingActive] = useState(false)
  const [copiedText, setCopiedText] = useState(false)
  // Counts unverified check attempts (auto-poll ticks + manual "Check Now"
  // clicks). Skip unlocks after a couple of real attempts OR after standing
  // on this step for a minute, whichever comes first — enough to give the
  // router a fair chance to call back without forcing anyone to wait it out.
  const [checkAttempts, setCheckAttempts] = useState(0)
  const REQUIRED_CHECK_ATTEMPTS = 2
  const SKIP_UNLOCK_SECONDS = 60
  const [stepTwoEnteredAt, setStepTwoEnteredAt] = useState<number | null>(null)
  const [elapsedOnStepTwo, setElapsedOnStepTwo] = useState(0)

  // Step 3 states
  const [packageForm, setPackageForm] = useState({
    name: '1 Hour Unlimited',
    durationMinutes: '60',
    initialPriceUgx: '1000',
    speedOption: 'MAX' as 'FAST' | 'SUPER_FAST' | 'MAX'
  })

  // Step 4 states
  const [voucherForm, setVoucherForm] = useState({
    quantity: '50',
    codeFormat: 'MIXED' as 'MIXED' | 'NUMBERS',
    notes: 'First batch for counter sales'
  })
  const [generatedBatch, setGeneratedBatch] = useState<any | null>(null)
  
  const DISMISS_KEY = `arofi_wizard_dismissed_${session.user.tenantId ?? 'new'}`
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(DISMISS_KEY) === '1'
  })
  
  const handleDismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
  }
  const handleResume = () => {
    setDismissed(false)
    try { localStorage.removeItem(DISMISS_KEY) } catch {}
  }

  // Determine initial step based on progress
  useEffect(() => {
    if (!initialHasRouter) {
      setCurrentStep(1)
    } else if (initialRouter && !initialRouter.provisioningCallbackReceived && initialRouter.onboardingStatus !== 'VERIFIED_ONLINE') {
      setRegisteredRouter(initialRouter)
      setSetupCommand(resolveOneRunCommand(initialRouter))
      setCurrentStep(2)
      setStepTwoEnteredAt(Date.now())
      setPollingActive(true)
    } else if (!initialHasPackage) {
      setRegisteredRouter(initialRouter)
      setSetupCommand(resolveOneRunCommand(initialRouter))
      setCurrentStep(3)
    } else if (!initialHasVouchers) {
      setRegisteredRouter(initialRouter)
      setSetupCommand(resolveOneRunCommand(initialRouter))
      setCurrentStep(4)
    } else {
      // Completed, close wizard
      onComplete()
    }
  }, [initialHasRouter, initialRouter, initialHasPackage, initialHasVouchers])

  // Polling for router connection (Step 2)
  useEffect(() => {
    if (!pollingActive || !registeredRouter?.id || currentStep !== 2) return

    let intervalId = setInterval(async () => {
      try {
        const setup = await clientFetchApi<any>(`/routers/${registeredRouter.id}/setup`)
        if (setup?.router) {
          setRegisteredRouter(setup.router)
          setSetupCommand(resolveOneRunCommand(setup))
          if (setup.router.provisioningCallbackReceived || setup.router.onboardingStatus === 'VERIFIED_ONLINE') {
            setPollingActive(false)
            setSuccess('Router connection verified! You can now proceed.')
          } else {
            setCheckAttempts((count) => count + 1)
          }
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 4000)

    return () => clearInterval(intervalId)
  }, [pollingActive, registeredRouter?.id, currentStep])

  // Drives the "you can skip in Ns" countdown on Step 2.
  useEffect(() => {
    if (currentStep !== 2 || !stepTwoEnteredAt) return
    const tick = () => setElapsedOnStepTwo(Math.floor((Date.now() - stepTwoEnteredAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [currentStep, stepTwoEnteredAt])

  const canSkipConnect = checkAttempts >= REQUIRED_CHECK_ATTEMPTS || elapsedOnStepTwo >= SKIP_UNLOCK_SECONDS

  // Step 1: Register Router Submission
  const handleRegisterRouter = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const tenantId = session.user.tenantId
    if (!tenantId) {
      setError('Unable to find tenant workspace context.')
      setLoading(false)
      return
    }

    try {
      // Create random shared secret & api keys
      const sharedSecret = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
      
      const setup = await clientPostApi<any>('/routers', {
        tenantId,
        name: routerForm.name.trim(),
        siteLabel: routerForm.siteLabel.trim(),
        host: '192.168.88.1',
        connectionMode: 'ROUTEROS_API',
        apiPort: 8728,
        username: 'admin',
        password: '',
        sharedSecret,
        scriptMode: routerForm.scriptMode,
        tags: ['onboarding']
      })

      if (setup?.router) {
        setRegisteredRouter(setup.router)
        setSetupCommand(resolveOneRunCommand(setup))
        setSuccess('Router registered successfully!')
        setCurrentStep(2)
        setStepTwoEnteredAt(Date.now())
        setPollingActive(true)
      } else {
        throw new Error('No router details returned from API.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register router')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Skip or Next
  const handleNextFromScript = () => {
    setPollingActive(false)
    setSuccess(null)
    setError(null)
    setCurrentStep(3)
  }

  // Manual check connection
  const handleCheckConnection = async () => {
    if (!registeredRouter?.id) return
    setError(null)
    setLoading(true)
    try {
      const setup = await clientPostApi<any>(`/routers/${registeredRouter.id}/health-check`, {})
      if (setup?.router) {
        setRegisteredRouter(setup.router)
        setSetupCommand(resolveOneRunCommand(setup))
        if (setup.router.provisioningCallbackReceived || setup.router.onboardingStatus === 'VERIFIED_ONLINE') {
          setSuccess('Router connection verified successfully!')
        } else {
          setCheckAttempts((count) => count + 1)
          setError('We haven\'t received a signal from your router yet. Please ensure the command was pasted and run successfully in the WinBox terminal.')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection check failed')
    } finally {
      setLoading(false)
    }
  }

  // Copy installation script to clipboard
  const handleCopyScript = () => {
    if (!setupCommand) return

    navigator.clipboard.writeText(setupCommand)
    setCopiedText(true)
    setTimeout(() => setCopiedText(false), 2000)
  }

  // Step 3: Create Package Submission
  const handleCreatePackage = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const tenantId = session.user.tenantId
    if (!tenantId) {
      setError('Unable to find tenant context.')
      setLoading(false)
      return
    }

    // Set speed limits based on choice
    let downloadSpeedKbps: number | undefined = undefined
    let uploadSpeedKbps: number | undefined = undefined

    if (packageForm.speedOption === 'FAST') {
      downloadSpeedKbps = 2048 // 2 Mbps
      uploadSpeedKbps = 512   // 512 Kbps
    } else if (packageForm.speedOption === 'SUPER_FAST') {
      downloadSpeedKbps = 5120 // 5 Mbps
      uploadSpeedKbps = 1024  // 1 Mbps
    }

    try {
      const code = 'PKG-' + packageForm.name.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 10) + '-' + Math.floor(Math.random() * 1000)
      
      const response = await clientPostApi<any>('/packages', {
        tenantId,
        name: packageForm.name.trim(),
        code,
        description: 'Auto-created during onboarding.',
        durationMinutes: parseInt(packageForm.durationMinutes, 10),
        deviceLimit: 1,
        downloadSpeedKbps,
        uploadSpeedKbps,
        initialPriceUgx: parseInt(packageForm.initialPriceUgx, 10),
        isFeatured: true,
        status: 'ACTIVE'
      })

      if (response) {
        setSuccess('WiFi package created successfully!')
        setCurrentStep(4)
      } else {
        throw new Error('Failed to save package.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create package')
    } finally {
      setLoading(false)
    }
  }

  // Step 4: Generate Vouchers Submission
  const handleGenerateVouchers = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const tenantId = session.user.tenantId
    if (!tenantId) {
      setError('Unable to find tenant context.')
      setLoading(false)
      return
    }

    try {
      // Find the first package created or created package catalog
      const catalog = await clientFetchApi<any>('/packages')
      const items = catalog?.items || []
      const firstPkg = items[0]

      if (!firstPkg) {
        throw new Error('No package found to generate vouchers for. Please go back or try again.')
      }

      const batch = await clientPostApi<any>('/vouchers/batches', {
        tenantId,
        packageId: firstPkg.id,
        codeFormat: voucherForm.codeFormat,
        codeLength: 6,
        quantity: parseInt(voucherForm.quantity, 10),
        faceValueUgx: firstPkg.activePriceUgx,
        notes: voucherForm.notes.trim()
      })

      if (batch) {
        setGeneratedBatch(batch)
        setSuccess('Your WiFi system is set up successfully — enjoy your business! A confirmation email is on its way.')
        clientPostApi('/onboarding/complete', {}).catch(() => {
          // non-blocking — the dashboard still works even if the email send fails
        })
        // All complete, call final redirect/callback after short delay
        setTimeout(() => {
          onComplete()
        }, 1500)
      } else {
        throw new Error('Failed to generate batch.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate vouchers')
    } finally {
      setLoading(false)
    }
  }

  // Helper values for step progress UI
  const isCompleted = (step: number) => currentStep > step
  const isActive = (step: number) => currentStep === step

  if (dismissed) {
    return (
      <div style={{
        background: 'rgba(245, 158, 11, 0.05)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        animation: 'fadeIn 0.2s ease-out'
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{
            background: 'rgba(245, 158, 11, 0.1)',
            color: '#f59e0b',
            padding: 8,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertTriangle size={18} />
          </span>
          <div>
            <strong style={{ color: 'var(--text-1)', fontSize: 14 }}>WiFi Hotspot Setup Incomplete</strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '2px 0 0', lineHeight: 1.4 }}>
              Register your MikroTik router, configure an internet plan, and generate vouchers to start selling access.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleResume()}
          className="btn btn-primary"
          style={{
            fontSize: 13,
            padding: '8px 16px',
            height: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#d97706',
            borderColor: '#d97706',
            color: '#fff'
          }}
        >
          Resume Setup Wizard <ArrowRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(20px)',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      overflowY: 'auto'
    }} className="onboarding-modal-overlay">
      <div style={{
        background: 'var(--bg-card, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 16,
        width: 'min(720px, 100%)',
        maxHeight: '92vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), var(--shadow-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out'
      }} className="onboarding-modal-card">
        {/* Top Header */}
        <div style={{
          background: 'linear-gradient(135deg, #2563eb 0%, #0f172a 100%)',
          padding: 'clamp(14px, 3vw, 20px) clamp(16px, 5vw, 32px)',
          color: '#ffffff',
          position: 'relative',
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={() => handleDismiss()}
            style={{
              position: 'absolute',
              top: 24,
              right: 32,
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 'bold',
              transition: 'background 0.2s'
            }}
            title="Skip to Dashboard"
          >
            ✕
          </button>
          <div style={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.1)',
            pointerEvents: 'none'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              padding: 6,
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}>
              <Sparkles size={18} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#93c5fd' }}>Self Onboarding Wizard</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 6, letterSpacing: '-0.02em', color: '#fff' }}>Get Your Hotspot Billing Live</h2>
          <p style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
            4 quick steps — skip anything, anytime, and finish later from your dashboard.
          </p>
        </div>

        {/* Steps Progress Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-muted)',
          flexShrink: 0
        }}>
          {[
            { step: 1, icon: <Wifi size={14} />, label: 'Register' },
            { step: 2, icon: <Cpu size={14} />, label: 'Connect' },
            { step: 3, icon: <Package size={14} />, label: 'Package' },
            { step: 4, icon: <Ticket size={14} />, label: 'Vouchers' }
          ].map((item) => {
            const completed = isCompleted(item.step)
            const active = isActive(item.step)
            return (
              <div 
                key={item.step} 
                style={{
                  padding: '12px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  borderBottom: active ? '3px solid var(--primary, #3b82f6)' : '3px solid transparent',
                  background: active ? 'var(--bg-card)' : 'transparent',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  background: completed 
                    ? '#10b981' 
                    : active 
                      ? 'var(--primary, #3b82f6)' 
                      : 'var(--border, #cbd5e1)',
                  color: completed || active ? '#ffffff' : 'var(--text-muted, #64748b)',
                  boxShadow: active ? '0 0 0 4px rgba(59, 130, 246, 0.15)' : 'none'
                }}>
                  {completed ? <Check size={12} /> : item.icon}
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: active || completed ? 600 : 500,
                  color: active 
                    ? 'var(--text-1)' 
                    : completed 
                      ? '#10b981' 
                      : 'var(--text-muted)'
                }}>
                  {item.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Content Box */}
        <div style={{ padding: 'clamp(14px, 4vw, 22px) clamp(14px, 5vw, 32px)', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 20,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              color: '#ef4444',
              fontSize: 13
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{error}</div>
            </div>
          )}

          {success && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 20,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              color: '#10b981',
              fontSize: 13
            }}>
              <CheckCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{success}</div>
            </div>
          )}

          {/* STEP 1: Register Router */}
          {currentStep === 1 && (
            <form onSubmit={handleRegisterRouter} style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Step 1: Register MikroTik Router</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Enter your physical router details to generate the matching RouterOS setup commands. We preconfigure a default primary hotspot group for you automatically.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Router Custom Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={routerForm.name}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Shop Counter Router"
                    required
                    style={{ padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>SSID / Wi-Fi Site Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={routerForm.siteLabel}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, siteLabel: e.target.value }))}
                    placeholder="e.g. MUTUNGO_HILL_WIFI"
                    required
                    style={{ padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Hotspot Setup Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <button
                    type="button"
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: routerForm.scriptMode === 'FRESH_FULL_CAPTIVE_WIFI' ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                      background: routerForm.scriptMode === 'FRESH_FULL_CAPTIVE_WIFI' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 4
                    }}
                    onClick={() => setRouterForm(prev => ({ ...prev, scriptMode: 'FRESH_FULL_CAPTIVE_WIFI' }))}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      Create customer Wi-Fi
                      {routerForm.scriptMode === 'FRESH_FULL_CAPTIVE_WIFI' && <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                      Builds a brand new open SSID + captive portal on isolated bridge. Safe & isolated.
                    </span>
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: routerForm.scriptMode === 'SAFE_EXISTING_ROUTER' ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                      background: routerForm.scriptMode === 'SAFE_EXISTING_ROUTER' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 4
                    }}
                    onClick={() => setRouterForm(prev => ({ ...prev, scriptMode: 'SAFE_EXISTING_ROUTER' }))}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      Existing hotspot setup
                      {routerForm.scriptMode === 'SAFE_EXISTING_ROUTER' && <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                      I already have an active hotspot configured. Just link it to the cloud billing console.
                    </span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px', height: 'auto', borderRadius: 8, fontSize: 14, fontWeight: 600 }}
                >
                  {loading ? 'Registering...' : 'Register Router & Continue'} <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Connect Router & Run Script */}
          {currentStep === 2 && registeredRouter && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Step 2: Run one command in WinBox</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Copy this command, paste it into your router's WinBox terminal, and press Enter.
                </p>
              </div>

              <div style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 12,
                padding: 12,
                position: 'relative',
                display: 'grid',
                gap: 8
              }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>WinBox Terminal Command</span>
                <pre style={{
                  fontFamily: 'monospace',
                  fontSize: 11.5,
                  color: '#38bdf8',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                  paddingRight: 36,
                  lineHeight: 1.5,
                  maxHeight: 96,
                  overflowY: 'auto'
                }}>
                  {setupCommand || 'Generating MikroTik setup command...'}
                </pre>

                <button
                  type="button"
                  onClick={handleCopyScript}
                  disabled={!setupCommand}
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: 8,
                    cursor: 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    opacity: setupCommand ? 1 : 0.55
                  }}
                  title="Copy command"
                >
                  {copiedText ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                </button>
              </div>

              <details style={{
                background: 'var(--bg-muted)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 12.5,
                borderLeft: '4px solid var(--primary, #3b82f6)'
              }}>
                <summary style={{ fontWeight: 700, color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, listStyle: 'none' }}>
                  <Info size={15} className="text-primary" /> How to paste this in WinBox
                </summary>
                <ol style={{ margin: '8px 0 4px 0', paddingLeft: 16, display: 'grid', gap: 4, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  <li>Open WinBox and log in to your router as admin (reset the router first if it's locked or you don't know the password).</li>
                  <li>Click <strong>New Terminal</strong>, right-click and choose <strong>Paste</strong>, then press <strong>Enter</strong>.</li>
                  <li>Wait 10-15 seconds — the script applies the setup automatically.</li>
                </ol>
                <a href="/docs/getting-started" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary, #3b82f6)' }}>
                  Read the full setup guide →
                </a>
              </details>

              {/* Status Indicator */}
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: registeredRouter.provisioningCallbackReceived || registeredRouter.onboardingStatus === 'VERIFIED_ONLINE' ? '#10b981' : '#f59e0b',
                    animation: registeredRouter.provisioningCallbackReceived ? 'none' : 'pulse 1.5s infinite'
                  }} />
                  <div style={{ display: 'grid', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      {registeredRouter.provisioningCallbackReceived || registeredRouter.onboardingStatus === 'VERIFIED_ONLINE' 
                        ? 'Heartbeat Received!' 
                        : 'Waiting for Router Heartbeat...'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {registeredRouter.provisioningCallbackReceived || registeredRouter.onboardingStatus === 'VERIFIED_ONLINE'
                        ? 'Your MikroTik is connected and calling home.'
                        : 'Running connection check on cloud tunnel.'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleCheckConnection}
                    disabled={loading}
                    style={{ fontSize: 12.5, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, height: 'auto' }}
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Check Now
                  </button>
                  
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!registeredRouter.provisioningCallbackReceived && registeredRouter.onboardingStatus !== 'VERIFIED_ONLINE'}
                    onClick={handleNextFromScript}
                    style={{ fontSize: 12.5, padding: '8px 14px', height: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    Next Step <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14, flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trouble connecting? Paste the command exactly as shown.</span>
                {canSkipConnect ? (
                  <button
                    type="button"
                    onClick={handleNextFromScript}
                    className="btn btn-ghost"
                    style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 14px', height: 'auto' }}
                  >
                    Skip for now — I&apos;ll finish this later
                  </button>
                ) : (
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    You can skip this in {Math.max(SKIP_UNLOCK_SECONDS - elapsedOnStepTwo, 0)}s, or after {Math.max(REQUIRED_CHECK_ATTEMPTS - checkAttempts, 0)} more check{Math.max(REQUIRED_CHECK_ATTEMPTS - checkAttempts, 0) === 1 ? '' : 's'}.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Create First Package */}
          {currentStep === 3 && (
            <form onSubmit={handleCreatePackage} style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Step 3: Define Internet Package</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Define the pricing and session duration for your customers. They will purchase this package via Mobile Money or Vouchers.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Package Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={packageForm.name}
                    onChange={(e) => setPackageForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. 1 Hour Plan"
                    required
                    style={{ padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Price (UGX)</label>
                  <input
                    type="number"
                    min={50}
                    className="form-input"
                    value={packageForm.initialPriceUgx}
                    onChange={(e) => setPackageForm(prev => ({ ...prev, initialPriceUgx: e.target.value }))}
                    placeholder="1000"
                    required
                    style={{ padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Duration</label>
                  <DurationInput
                    valueMinutes={packageForm.durationMinutes}
                    onChangeMinutes={(minutes) => setPackageForm(prev => ({ ...prev, durationMinutes: minutes }))}
                    inputClassName="form-input"
                    selectClassName="form-input"
                    fieldStyle={{ padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Speed limits / Bandwidth Profile</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { value: 'FAST', label: 'Fast (2 Mbps)', desc: 'Standard browsing & social media.' },
                    { value: 'SUPER_FAST', label: 'Super Fast (5 Mbps)', desc: 'HD video stream & downloads.' },
                    { value: 'MAX', label: 'Maximum Speed', desc: 'No cap. Utilizes full internet capacity.' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      style={{
                        padding: '12px 10px',
                        borderRadius: 8,
                        border: packageForm.speedOption === opt.value ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                        background: packageForm.speedOption === opt.value ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 2
                      }}
                      onClick={() => setPackageForm(prev => ({ ...prev, speedOption: opt.value as any }))}
                    >
                      <strong style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{opt.label}</strong>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.25 }}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px', height: 'auto', borderRadius: 8, fontSize: 14, fontWeight: 600 }}
                >
                  {loading ? 'Creating...' : 'Create Package & Continue'} <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: Generate First Vouchers */}
          {currentStep === 4 && (
            <form onSubmit={handleGenerateVouchers} style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Step 4: Generate Printed Vouchers</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Generate your first batch of physical vouchers immediately. You can download and print them on any standard desktop printer or thermal counter.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Quantity to Generate</label>
                  <select
                    className="form-input"
                    value={voucherForm.quantity}
                    onChange={(e) => setVoucherForm(prev => ({ ...prev, quantity: e.target.value }))}
                    style={{ padding: '10px 12px', borderRadius: 8, height: 'auto' }}
                  >
                    <option value="20">20 Vouchers</option>
                    <option value="50">50 Vouchers (Recommended)</option>
                    <option value="100">100 Vouchers</option>
                    <option value="200">200 Vouchers</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Code Format</label>
                  <select
                    className="form-input"
                    value={voucherForm.codeFormat}
                    onChange={(e) => setVoucherForm(prev => ({ ...prev, codeFormat: e.target.value as any }))}
                    style={{ padding: '10px 12px', borderRadius: 8, height: 'auto' }}
                  >
                    <option value="MIXED">Mixed Letters & Numbers (e.g. A9B7CD)</option>
                    <option value="NUMBERS">Numbers Only (e.g. 583920 - easiest to type)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Batch Note / Description</label>
                <input
                  type="text"
                  className="form-input"
                  value={voucherForm.notes}
                  onChange={(e) => setVoucherForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. First Batch counter sales"
                  style={{ padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vouchers will map to the package you created in Step 3.</span>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px', height: 'auto', borderRadius: 8, fontSize: 14, fontWeight: 600 }}
                >
                  {loading ? 'Generating...' : 'Generate Batch & Finish Onboarding'} <Check size={16} />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      
      {/* Visual background anim style fixes */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
