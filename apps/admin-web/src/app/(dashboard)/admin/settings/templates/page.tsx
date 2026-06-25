'use client'

import { useState, useMemo } from 'react'
import { 
  Palette, 
  Smartphone, 
  Check, 
  Layers, 
  Sparkles, 
  Laptop, 
  Info 
} from 'lucide-react'

type Template = {
  id: string
  name: string
  description: string
  tags: string[]
  accentColor: string
  isPremium?: boolean
}

const templates: Template[] = [
  {
    id: 'liquid-glass',
    name: 'Liquid Glass',
    description: 'Modern and sleek glassmorphism design with backdrop blur filters and dynamic gradient animations.',
    tags: ['Glass Effect', 'Blur Background', 'Modern Aesthetics'],
    accentColor: '#10b981',
    isPremium: true
  },
  {
    id: 'neon-cyber',
    name: 'Neon Cyberpunk',
    description: 'Vibrant neon outlines and dark synthwave color tones, perfect for modern urban settings.',
    tags: ['Neon Glow', 'Dark Theme', 'Animated Background'],
    accentColor: '#ec4899'
  },
  {
    id: 'minimalist-clean',
    name: 'Clean Slate',
    description: 'Minimal styling with high readability, fast loading speed, and focus on simple form validation.',
    tags: ['Lightweight', 'Ultra Fast', 'Corporate Branding'],
    accentColor: '#3b82f6'
  }
]

export default function HotspotTemplatesPage() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('liquid-glass')
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light'>('dark')
  
  const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0]

  const mockupStyles = useMemo(() => {
    const isDark = selectedTheme === 'dark'
    const accent = currentTemplate.accentColor
    
    if (selectedTemplateId === 'liquid-glass') {
      return {
        viewport: {
          background: isDark 
            ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' 
            : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          display: 'flex',
          flexDirection: 'column' as const,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          padding: 20,
          position: 'relative' as const,
          width: '100%',
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          transition: 'all 0.3s'
        },
        card: {
          background: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(12px)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 16,
          padding: 18,
          width: '100%',
          boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(31, 38, 135, 0.06)',
          zIndex: 2,
          display: 'grid',
          gap: 12
        },
        input: {
          padding: 8,
          borderRadius: 8,
          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
          background: isDark ? 'rgba(15, 23, 42, 0.3)' : 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(4px)',
          fontSize: 11,
          color: isDark ? '#f1f5f9' : '#0f172a',
          outline: 'none',
          width: '100%'
        },
        button: {
          background: `linear-gradient(135deg, ${accent} 0%, #1d4ed8 100%)`,
          color: '#ffffff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          marginTop: 6,
          boxShadow: `0 4px 14px ${accent}44`
        }
      }
    } else if (selectedTemplateId === 'neon-cyber') {
      return {
        viewport: {
          background: '#090a0f',
          backgroundImage: 'linear-gradient(rgba(236, 72, 153, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236, 72, 153, 0.05) 1px, transparent 1px)',
          backgroundSize: '15px 15px',
          fontFamily: 'Courier New, Courier, monospace',
          display: 'flex',
          flexDirection: 'column' as const,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          padding: 20,
          position: 'relative' as const,
          width: '100%',
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          transition: 'all 0.3s'
        },
        card: {
          background: '#0d0f19',
          border: `2px solid ${accent}`,
          boxShadow: `0 0 15px ${accent}66, inset 0 0 8px ${accent}22`,
          borderRadius: 8,
          padding: 16,
          width: '100%',
          zIndex: 2,
          display: 'grid',
          gap: 12
        },
        input: {
          padding: 8,
          borderRadius: 4,
          border: `1px solid ${accent}88`,
          background: '#04060a',
          fontFamily: 'monospace',
          fontSize: 11,
          color: accent,
          outline: 'none',
          boxShadow: `inset 0 0 4px ${accent}33`,
          width: '100%'
        },
        button: {
          background: 'transparent',
          color: accent,
          border: `2px solid ${accent}`,
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'monospace',
          textTransform: 'uppercase' as const,
          cursor: 'pointer',
          marginTop: 6,
          boxShadow: `0 0 10px ${accent}44`,
          textShadow: `0 0 5px ${accent}`
        }
      }
    } else {
      // minimalist-clean
      return {
        viewport: {
          background: isDark ? '#0f172a' : '#f8fafc',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          display: 'flex',
          flexDirection: 'column' as const,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          padding: 20,
          position: 'relative' as const,
          width: '100%',
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          transition: 'all 0.3s'
        },
        card: {
          background: isDark ? '#1e293b' : '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          width: '100%',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 2,
          display: 'grid',
          gap: 12
        },
        input: {
          padding: 8,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: isDark ? '#0f172a' : '#f8fafc',
          fontSize: 11,
          color: isDark ? '#f1f5f9' : '#0f172a',
          outline: 'none',
          width: '100%'
        },
        button: {
          background: accent,
          color: '#ffffff',
          border: 'none',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          marginTop: 6
        }
      }
    }
  }, [selectedTemplateId, selectedTheme, currentTemplate])

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 980, margin: '0 auto' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '20px 0' }}>
        <div style={{ 
          width: 60, 
          height: 60, 
          borderRadius: 20, 
          background: 'var(--blue-light)', 
          color: 'var(--primary)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginBottom: 10
        }}>
          <Palette size={32} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Hotspot Template Library</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 600, lineHeight: 1.5 }}>
          Modern, responsive captive portal templates for MikroTik routers. Choose from our collection of professionally designed themes.
        </p>
      </div>

      {/* Main Grid: Selection and Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
        
        {/* Left Side: Theme Collection */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={18} /> Available Themes
          </h2>

          {templates.map((template) => {
            const isSelected = template.id === selectedTemplateId
            return (
              <div 
                key={template.id}
                className="card"
                style={{
                  padding: 16,
                  border: isSelected ? `2px solid ${template.accentColor}` : '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  display: 'grid',
                  gap: 10
                }}
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>{template.name}</strong>
                  {template.isPremium && (
                    <span className="badge badge-success" style={{ fontSize: 10 }}>Premium</span>
                  )}
                </div>

                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                  {template.description}
                </p>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {template.tags.map((tag) => (
                    <span key={tag} className="badge badge-info" style={{ fontSize: 10, background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}

          <div style={{
            padding: 14,
            background: 'var(--bg-muted)',
            borderRadius: 12,
            border: '1px dashed var(--border)',
            display: 'flex',
            gap: 10,
            fontSize: 12.5,
            color: 'var(--text-secondary)',
            lineHeight: 1.45
          }}>
            <Info size={16} style={{ flexShrink: 0, color: 'var(--primary)' }} />
            <span>
              Templates are fully automated. Once selected, AROFi compiles the code and hosts it directly on the Cloud Portal instance linked to your router.
            </span>
          </div>
        </div>

        {/* Right Side: Visual Previewer */}
        <div className="card" style={{ padding: 24, display: 'grid', gap: 16, alignContent: 'start', minHeight: 560 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Active Template Preview</h2>
            
            <div style={{ display: 'flex', background: 'var(--bg-muted)', padding: 3, borderRadius: 6, gap: 2 }}>
              <button
                type="button"
                className={`btn ${selectedTheme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '4px 10px', height: 'auto', borderRadius: 4 }}
                onClick={() => setSelectedTheme('dark')}
              >
                Dark Theme
              </button>
              <button
                type="button"
                className={`btn ${selectedTheme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '4px 10px', height: 'auto', borderRadius: 4 }}
                onClick={() => setSelectedTheme('light')}
              >
                Light Theme
              </button>
            </div>
          </div>

          {/* Interactive Mobile Screen Mockup */}
          <div style={{
            background: '#090d16',
            borderRadius: 24,
            padding: 12,
            border: '8px solid #202b40',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
            aspectRatio: '9/16',
            maxWidth: 320,
            margin: '0 auto',
            width: '100%'
          }} className="mobile-phone-mockup">
            
            {/* Phone Notch */}
            <div style={{
              position: 'absolute',
              top: 0,
              width: 110,
              height: 20,
              backgroundColor: '#202b40',
              borderRadius: '0 0 12px 12px',
              zIndex: 10
            }} className="phone-notch" />

            {/* Rendered Template Viewport */}
            <div style={mockupStyles.viewport}>
              
              {/* Optional Glassmorphism Circles behind screen */}
              {selectedTemplateId === 'liquid-glass' && (
                <>
                  <div style={{
                    position: 'absolute',
                    top: '20%',
                    left: '10%',
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${currentTemplate.accentColor}33 0%, transparent 70%)`,
                    zIndex: 1
                  }} />
                  <div style={{
                    position: 'absolute',
                    bottom: '15%',
                    right: '10%',
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, #818cf833 0%, transparent 70%)',
                    zIndex: 1
                  }} />
                </>
              )}

              {/* Captive Portal UI elements inside phone */}
              <div style={mockupStyles.card}>
                <div style={{ 
                  fontSize: selectedTemplateId === 'neon-cyber' ? 16 : 18, 
                  fontWeight: selectedTemplateId === 'neon-cyber' ? 800 : 700, 
                  color: currentTemplate.accentColor, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 6,
                  textShadow: selectedTemplateId === 'neon-cyber' ? `0 0 8px ${currentTemplate.accentColor}` : 'none'
                }}>
                  <Sparkles size={16} /> AROFi Guest
                </div>
                
                <span style={{ 
                  fontSize: 10.5, 
                  color: selectedTheme === 'dark' ? '#94a3b8' : '#64748b',
                  fontFamily: selectedTemplateId === 'neon-cyber' ? 'monospace' : 'inherit'
                }}>
                  Enter payment or voucher credentials to get online
                </span>

                {/* Input Fields */}
                <div style={{ display: 'grid', gap: 8, textAlign: 'left', marginTop: selectedTemplateId === 'neon-cyber' ? 4 : 8 }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 600 }}>Phone Number</span>
                    <input 
                      type="text" 
                      placeholder="0770 000 000" 
                      disabled
                      style={mockupStyles.input}
                    />
                  </div>

                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 600 }}>Voucher Code</span>
                    <input 
                      type="text" 
                      placeholder="X-XXXXXX" 
                      disabled
                      style={mockupStyles.input}
                    />
                  </div>
                </div>

                {/* Action button */}
                <button
                  type="button"
                  style={mockupStyles.button}
                  disabled
                >
                  Pay & Connect
                </button>
              </div>

            </div>
          </div>

          {/* Quick Activate Trigger */}
          <button 
            type="button" 
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => alert(`Captive Template set to "${currentTemplate.name}" successfully!`)}
          >
            <Check size={16} /> Activate {currentTemplate.name}
          </button>
        </div>
      </div>
    </div>
  )
}
