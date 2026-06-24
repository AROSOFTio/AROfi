'use client'

import { useState } from 'react'
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
          }}>
            
            {/* Phone Notch */}
            <div style={{
              position: 'absolute',
              top: 0,
              width: 110,
              height: 20,
              backgroundColor: '#202b40',
              borderRadius: '0 0 12px 12px',
              zIndex: 10
            }} />

            {/* Rendered Template Viewport */}
            <div style={{
              width: '100%',
              height: '100%',
              backgroundColor: selectedTheme === 'dark' ? '#0f172a' : '#f8fafc',
              color: selectedTheme === 'dark' ? '#f1f5f9' : '#0f172a',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: 20,
              position: 'relative',
              transition: 'background-color 0.3s',
              fontFamily: 'sans-serif'
            }}>
              
              {/* Optional Glassmorphism Circles behind screen */}
              {currentTemplate.id === 'liquid-glass' && (
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
              <div style={{ zIndex: 2, display: 'grid', gap: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: currentTemplate.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Sparkles size={18} /> AROFi Guest
                </div>
                
                <span style={{ fontSize: 11, color: selectedTheme === 'dark' ? '#94a3b8' : '#64748b' }}>
                  Enter payment or voucher credentials to get online
                </span>

                {/* Input Fields */}
                <div style={{ display: 'grid', gap: 8, textAlign: 'left', marginTop: 10 }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>Phone Number</span>
                    <input 
                      type="text" 
                      placeholder="0700 000 000" 
                      disabled
                      style={{
                        padding: 8,
                        borderRadius: 6,
                        border: selectedTheme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                        background: selectedTheme === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: currentTemplate.id === 'liquid-glass' ? 'blur(4px)' : 'none',
                        fontSize: 11,
                        color: 'inherit',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>Voucher Code</span>
                    <input 
                      type="text" 
                      placeholder="X-XXXXXX" 
                      disabled
                      style={{
                        padding: 8,
                        borderRadius: 6,
                        border: selectedTheme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                        background: selectedTheme === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: currentTemplate.id === 'liquid-glass' ? 'blur(4px)' : 'none',
                        fontSize: 11,
                        color: 'inherit',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Action button */}
                <button
                  type="button"
                  style={{
                    backgroundColor: currentTemplate.accentColor,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 10,
                    boxShadow: `0 4px 10px ${currentTemplate.accentColor}33`
                  }}
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
