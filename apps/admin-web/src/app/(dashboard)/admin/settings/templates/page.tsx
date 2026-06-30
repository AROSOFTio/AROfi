'use client'

import { useState, useEffect } from 'react'
import { Check, Wifi, Loader2, AlertCircle } from 'lucide-react'
import { clientFetchApi, clientPatchApi } from '@/lib/client-api'

type PortalTemplateId = 'classic' | 'fresh' | 'midnight' | 'sunrise' | 'minimal'

type TemplateDefinition = {
  id: PortalTemplateId
  name: string
  description: string
  isPro: boolean
  // These values mirror the Tailwind classes in PortalCheckout.tsx exactly
  pageBg: string
  shellBg: string
  shellBorder: string
  shellShadow: string
  shellRadius: number
  cardBg: string
  cardBorder: string
  titleColor: string
  subtitleColor: string
  inputBg: string
  inputBorder: string
  inputText: string
  buttonBg: string
  buttonText: string
  accentColor: string
}

const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Clean green-and-white. Works on any device, loads fast. Default for all plans.',
    isPro: false,
    pageBg: '#f1f5f9',
    shellBg: '#f8fafc',
    shellBorder: '#cbd5e1',
    shellShadow: '0 1px 3px rgba(0,0,0,0.08)',
    shellRadius: 8,
    cardBg: '#ffffff',
    cardBorder: '#cbd5e1',
    titleColor: '#059669',
    subtitleColor: '#64748b',
    inputBg: '#ffffff',
    inputBorder: '#cbd5e1',
    inputText: '#0f172a',
    buttonBg: '#10b981',
    buttonText: '#ffffff',
    accentColor: '#10b981',
  },
  {
    id: 'fresh',
    name: 'Fresh',
    description: 'Crisp white with emerald accents and a soft green glow — modern and welcoming.',
    isPro: true,
    pageBg: '#ecfdf5',
    shellBg: '#ffffff',
    shellBorder: '#a7f3d0',
    shellShadow: '0 18px 60px rgba(16,185,129,0.12)',
    shellRadius: 16,
    cardBg: '#ffffff',
    cardBorder: '#a7f3d0',
    titleColor: '#047857',
    subtitleColor: '#6b7280',
    inputBg: '#ffffff',
    inputBorder: '#a7f3d0',
    inputText: '#0f172a',
    buttonBg: '#059669',
    buttonText: '#ffffff',
    accentColor: '#059669',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark background with sky-blue accents — sleek look for evening and night venues.',
    isPro: true,
    pageBg: '#020617',
    shellBg: '#020617',
    shellBorder: '#0c4a6e',
    shellShadow: '0 22px 70px rgba(2,6,23,0.4)',
    shellRadius: 16,
    cardBg: '#0f172a',
    cardBorder: '#075985',
    titleColor: '#7dd3fc',
    subtitleColor: '#94a3b8',
    inputBg: '#0f172a',
    inputBorder: '#075985',
    inputText: '#f1f5f9',
    buttonBg: '#0ea5e9',
    buttonText: '#020617',
    accentColor: '#0ea5e9',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    description: 'Warm amber and orange tones — energetic feel, great for cafés and outdoor spots.',
    isPro: true,
    pageBg: '#fef3c7',
    shellBg: '#fff7ed',
    shellBorder: '#fde68a',
    shellShadow: '0 18px 60px rgba(245,158,11,0.14)',
    shellRadius: 16,
    cardBg: '#ffffff',
    cardBorder: '#fde68a',
    titleColor: '#92400e',
    subtitleColor: '#78350f',
    inputBg: '#ffffff',
    inputBorder: '#fde68a',
    inputText: '#0f172a',
    buttonBg: '#f59e0b',
    buttonText: '#ffffff',
    accentColor: '#f59e0b',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Pure black-and-white, no decorative colors — maximum readability, zero distraction.',
    isPro: true,
    pageBg: '#f8fafc',
    shellBg: '#ffffff',
    shellBorder: '#e2e8f0',
    shellShadow: '0 1px 3px rgba(0,0,0,0.08)',
    shellRadius: 0,
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    titleColor: '#020617',
    subtitleColor: '#64748b',
    inputBg: '#ffffff',
    inputBorder: '#cbd5e1',
    inputText: '#0f172a',
    buttonBg: '#020617',
    buttonText: '#ffffff',
    accentColor: '#020617',
  },
]

function PortalMockup({ t }: { t: TemplateDefinition }) {
  const r = Math.min(6, t.shellRadius)
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
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 72,
        height: 14,
        background: '#1e293b',
        borderRadius: '0 0 10px 10px',
        zIndex: 10,
      }} />
      {/* Screen */}
      <div style={{
        background: t.pageBg,
        borderRadius: 20,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px 8px 8px',
      }}>
        {/* Portal card — mirrors the shell + inner layout from PortalCheckout */}
        <div style={{
          background: t.shellBg,
          borderRadius: t.shellRadius,
          border: `1px solid ${t.shellBorder}`,
          boxShadow: t.shellShadow,
          padding: '10px 9px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {/* Header: WiFi icon + tenant name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
            <Wifi size={11} color={t.titleColor} strokeWidth={2.5} />
            <span style={{ fontSize: 11, fontWeight: 700, color: t.titleColor, letterSpacing: '-0.01em' }}>
              BRENDA WiFi
            </span>
          </div>

          {/* Subtitle */}
          <p style={{ fontSize: 7.5, color: t.subtitleColor, margin: 0, lineHeight: 1.3 }}>
            Enter voucher or pay to get online
          </p>

          {/* Input: phone */}
          <div style={{
            background: t.inputBg,
            border: `1px solid ${t.inputBorder}`,
            borderRadius: r,
            padding: '4px 7px',
            fontSize: 8,
            color: t.inputText === '#f1f5f9' ? t.subtitleColor : '#94a3b8',
          }}>
            07XX XXX XXX
          </div>

          {/* Input: voucher */}
          <div style={{
            background: t.inputBg,
            border: `1px solid ${t.inputBorder}`,
            borderRadius: r,
            padding: '4px 7px',
            fontSize: 8,
            color: t.inputText === '#f1f5f9' ? t.subtitleColor : '#94a3b8',
          }}>
            Voucher code...
          </div>

          {/* Connect button */}
          <div style={{
            background: t.buttonBg,
            color: t.buttonText,
            borderRadius: r,
            padding: '5px 8px',
            fontSize: 9,
            fontWeight: 600,
            textAlign: 'center',
          }}>
            Pay &amp; Connect
          </div>

          {/* Package card */}
          <div style={{
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: r,
            padding: '5px 7px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 2,
          }}>
            <div>
              <div style={{ fontSize: 7, color: t.subtitleColor, fontWeight: 500 }}>1 HOUR</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: t.titleColor }}>UGX 1,000</div>
            </div>
            <div style={{
              background: t.buttonBg,
              color: t.buttonText,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 8,
              fontWeight: 700,
            }}>
              BUY
            </div>
          </div>
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
        const tpl = (data.tenant?.portalTemplate ?? 'classic') as PortalTemplateId
        setActiveTemplate(tpl)
        setSelectedId(tpl)
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
      const name = TEMPLATES.find(t => t.id === selectedId)?.name ?? selectedId
      setSuccess(`${name} is now your active portal template.`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update template')
    } finally {
      setSaving(false)
    }
  }

  const selected = TEMPLATES.find(t => t.id === selectedId) ?? TEMPLATES[0]
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
          Choose the design your customers see when they connect to your WiFi.
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
          {TEMPLATES.map((t) => {
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
                {/* Color swatch — shows the real portal colors */}
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: t.shellBg,
                  border: `2px solid ${t.accentColor}`,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <div style={{ width: '100%', height: '100%', background: t.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: t.shellRadius === 0 ? 2 : 6, background: t.shellBg, border: `1px solid ${t.shellBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 18, height: 7, borderRadius: t.shellRadius === 0 ? 0 : 3, background: t.buttonBg }} />
                    </div>
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
