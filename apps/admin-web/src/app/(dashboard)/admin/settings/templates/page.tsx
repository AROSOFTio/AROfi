'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { clientFetchApi, clientPatchApi } from '@/lib/client-api'

type PortalTemplateId = 'classic' | 'fresh' | 'midnight' | 'sunrise' | 'minimal'

type TemplateDefinition = {
  id: PortalTemplateId
  name: string
  description: string
  isPro: boolean
  // Page / card colors — mirror what login.html / PortalCheckout.tsx renders
  pageBg: string
  cardBg: string
  cardBorder: string
  cardShadow: string
  tabsBg: string
  accentColor: string
  titleColor: string
  subtitleColor: string
  inputBg: string
  inputBorder: string
  buttonBg: string
  buttonText: string
}

const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'classic',
    name: 'AROFi Blue',
    description: 'The default portal — bright blue on white, exactly as seen at the captive portal. Loads fast on any device.',
    isPro: false,
    pageBg: '#eff6ff',
    cardBg: '#ffffff',
    cardBorder: '#bfdbfe',
    cardShadow: '0 8px 32px rgba(37,99,235,.10)',
    tabsBg: '#f1f5f9',
    accentColor: '#2563EB',
    titleColor: '#2563EB',
    subtitleColor: '#64748b',
    inputBg: '#f8fafc',
    inputBorder: '#e2e8f0',
    buttonBg: '#2563EB',
    buttonText: '#ffffff',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark mode — deep navy background with electric blue accents. Great for evening and night venues.',
    isPro: true,
    pageBg: '#0a0f1e',
    cardBg: '#0f172a',
    cardBorder: '#1e3a5f',
    cardShadow: '0 8px 32px rgba(0,0,0,.5)',
    tabsBg: '#162033',
    accentColor: '#3b82f6',
    titleColor: '#60a5fa',
    subtitleColor: '#94a3b8',
    inputBg: '#1e293b',
    inputBorder: '#334155',
    buttonBg: '#2563EB',
    buttonText: '#ffffff',
  },
  {
    id: 'fresh',
    name: 'Forest',
    description: 'Calm green tones — natural and trustworthy feel, popular for community and rural hotspots.',
    isPro: true,
    pageBg: '#ecfdf5',
    cardBg: '#ffffff',
    cardBorder: '#a7f3d0',
    cardShadow: '0 8px 32px rgba(5,150,105,.10)',
    tabsBg: '#f0fdf4',
    accentColor: '#059669',
    titleColor: '#059669',
    subtitleColor: '#64748b',
    inputBg: '#f8fafc',
    inputBorder: '#d1fae5',
    buttonBg: '#059669',
    buttonText: '#ffffff',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    description: 'Warm amber and orange tones — energetic feel, great for cafés and outdoor hotspots.',
    isPro: true,
    pageBg: '#fffbeb',
    cardBg: '#ffffff',
    cardBorder: '#fde68a',
    cardShadow: '0 8px 32px rgba(245,158,11,.10)',
    tabsBg: '#fef3c7',
    accentColor: '#d97706',
    titleColor: '#d97706',
    subtitleColor: '#78350f',
    inputBg: '#fffbeb',
    inputBorder: '#fde68a',
    buttonBg: '#f59e0b',
    buttonText: '#ffffff',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Pure black and white — maximum readability, zero distraction.',
    isPro: true,
    pageBg: '#f8fafc',
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    cardShadow: '0 2px 8px rgba(0,0,0,.08)',
    tabsBg: '#f1f5f9',
    accentColor: '#0f172a',
    titleColor: '#0f172a',
    subtitleColor: '#64748b',
    inputBg: '#f8fafc',
    inputBorder: '#e2e8f0',
    buttonBg: '#0f172a',
    buttonText: '#ffffff',
  },
]

const AVAILABLE_TEMPLATES = TEMPLATES.filter((template) => template.id === 'classic')

// Faithfully recreates the login.html captive portal structure at miniature scale
function PortalMockup({ t }: { t: TemplateDefinition }) {
  return (
    <div style={{
      background: '#0d1117',
      borderRadius: 28,
      padding: 10,
      border: '6px solid #1e293b',
      boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      aspectRatio: '9/16',
      maxWidth: 200,
      margin: '0 auto',
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Notch */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 72, height: 14, background: '#1e293b', borderRadius: '0 0 10px 10px', zIndex: 10,
      }} />
      {/* Screen */}
      <div style={{
        background: t.pageBg,
        borderRadius: 20,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 8px 8px',
        gap: 0,
      }}>
        {/* Card — same structure as login.html .card */}
        <div style={{
          background: t.cardBg,
          border: `1px solid ${t.cardBorder}`,
          borderRadius: 10,
          padding: '8px 7px',
          width: '100%',
          boxShadow: t.cardShadow,
        }}>
          {/* Logo: wifi icon + hotspot name + tagline */}
          <div style={{ textAlign: 'center', marginBottom: 5 }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={t.accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ display: 'inline-block' }}
            >
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3"/>
            </svg>
            <div style={{ fontSize: 7, fontWeight: 800, color: t.titleColor, letterSpacing: '0.06em', marginTop: 2 }}>
              BRENDA WiFi
            </div>
            <div style={{ fontSize: 5, color: t.subtitleColor, marginTop: 1 }}>
              Instant high-speed internet access
            </div>
          </div>

          {/* Tabs: Buy Package | Voucher */}
          <div style={{
            display: 'flex', background: t.tabsBg, borderRadius: 5, padding: '1px',
            marginBottom: 5, gap: 2,
          }}>
            <div style={{
              flex: 1, textAlign: 'center', background: t.cardBg, borderRadius: 4,
              padding: '2px 0', fontSize: 5.5, fontWeight: 700, color: t.titleColor,
              boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
            }}>Buy Package</div>
            <div style={{
              flex: 1, textAlign: 'center', padding: '2px 0',
              fontSize: 5.5, color: t.subtitleColor,
            }}>Voucher</div>
          </div>

          {/* Package row */}
          <div style={{
            border: `1px solid ${t.cardBorder}`, borderRadius: 6, padding: '3px 5px',
            marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 6.5, fontWeight: 700, color: t.titleColor }}>1 Hour</div>
              <div style={{ fontSize: 5, color: t.subtitleColor }}>Unlimited data</div>
            </div>
            <div style={{ fontSize: 6.5, fontWeight: 800, color: t.accentColor }}>UGX 1,000</div>
          </div>

          {/* Phone input */}
          <div style={{
            background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5,
            padding: '3px 5px', fontSize: 5.5, color: t.subtitleColor, marginBottom: 4,
          }}>07XX XXX XXX</div>

          {/* Pay button */}
          <div style={{
            background: t.buttonBg, color: t.buttonText, borderRadius: 5,
            padding: '4px 0', fontSize: 6.5, fontWeight: 700, textAlign: 'center',
          }}>Pay and Connect</div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 5, fontSize: 5, color: t.subtitleColor, textAlign: 'center' }}>
          Powered By <span style={{ color: t.accentColor, fontWeight: 600 }}>AROFi</span>
        </div>
      </div>
    </div>
  )
}

export default function HotspotTemplatesPage() {
  const [activeTemplate, setActiveTemplate] = useState<PortalTemplateId>('classic')
  const [selectedId, setSelectedId] = useState<PortalTemplateId>('classic')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    clientFetchApi<{ tenant: { portalTemplate?: string | null } }>('/system/tenant-settings')
      .then((data) => {
        const savedTemplate = (data.tenant?.portalTemplate ?? 'classic') as PortalTemplateId
        const template = AVAILABLE_TEMPLATES.some((item) => item.id === savedTemplate) ? savedTemplate : 'classic'
        setActiveTemplate(template)
        setSelectedId(template)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function activate() {
    if (saving) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await clientPatchApi('/system/tenant-settings', { portalTemplate: selectedId })
      setActiveTemplate(selectedId)
      const name = AVAILABLE_TEMPLATES.find(t => t.id === selectedId)?.name ?? selectedId
      setSuccess(`${name} is now your active portal template.`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update template')
    } finally {
      setSaving(false)
    }
  }

  const selected = AVAILABLE_TEMPLATES.find(t => t.id === selectedId) ?? AVAILABLE_TEMPLATES[0]
  const isAlreadyActive = selectedId === activeTemplate

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: 'var(--text-secondary)' }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1040, margin: '0 auto' }}>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Portal Templates</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Choose the colour theme your customers see when they connect to your WiFi.
          Preview updates in real time — click Activate to apply.
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-bg,#fef2f2)', border: '1px solid var(--danger-border,#fca5a5)', borderRadius: 8, padding: '10px 14px', color: 'var(--danger-fg,#b91c1c)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'var(--success-bg,#f0fdf4)', border: '1px solid var(--success-border,#86efac)', borderRadius: 8, padding: '10px 14px', color: 'var(--success-fg,#15803d)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 20, alignItems: 'start' }}>

        {/* Template list */}
        <div style={{ display: 'grid', gap: 10 }}>
          {AVAILABLE_TEMPLATES.map((t) => {
            const isSelected = t.id === selectedId
            const isCurrent = t.id === activeTemplate
            return (
              <div
                key={t.id}
                className="card"
                style={{
                  padding: '14px 16px',
                  border: isSelected ? `2px solid ${t.accentColor}` : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  transition: 'border-color 0.15s',
                }}
                onClick={() => setSelectedId(t.id)}
              >
                {/* Colour swatch */}
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: t.pageBg, border: `2px solid ${t.cardBorder}`,
                  flexShrink: 0, overflow: 'hidden', position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 18, height: 7, borderRadius: 3, background: t.buttonBg }} />
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{t.name}</strong>
                    {isCurrent && <span className="badge badge-success" style={{ fontSize: 10 }}>Active</span>}
                    {t.isPro && !isCurrent && <span className="badge" style={{ fontSize: 10, background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Pro</span>}
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '3px 0 0', lineHeight: 1.4 }}>
                    {t.description}
                  </p>
                </div>

                {isSelected && (
                  <Check size={18} color={t.accentColor} style={{ flexShrink: 0 }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Live preview + Activate */}
        <div style={{ display: 'grid', gap: 14, position: 'sticky', top: 20 }}>
          <div className="card" style={{ padding: '14px 14px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Live Preview
            </div>
            <PortalMockup t={selected} />
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: selected.accentColor }}>{selected.name}</span>
              {activeTemplate === selected.id && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>· currently active</span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            disabled={saving || isAlreadyActive}
            onClick={activate}
          >
            {saving ? (
              <><Loader2 size={15} className="animate-spin" /> Saving...</>
            ) : isAlreadyActive ? (
              <><Check size={15} /> Active</>
            ) : (
              <>Activate {selected.name}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
