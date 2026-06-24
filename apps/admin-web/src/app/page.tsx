'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, BadgeDollarSign, Radio, Router, Ticket, Users, Wifi } from 'lucide-react'
import { LoginModal } from '@/components/LoginModal'
import { RegisterModal } from '@/components/RegisterModal'

const features = [
  { icon: Router, title: 'MikroTik Hotspot Billing', text: 'One RouterOS command to onboard. No lockouts, no console diving. Any MikroTik model.' },
  { icon: Ticket, title: 'WiFi Packages & Vouchers', text: 'Sell hourly & daily bundles, print voucher batches for field agents — all from one place.' },
  { icon: BadgeDollarSign, title: 'MTN MoMo & Airtel Money', text: 'Auto-collect mobile money. Wallets, settlements and reconciliation built-in.' },
  { icon: Users, title: 'Multi-Tenant · Self-Onboard', text: 'Every operator gets an isolated branded portal. No IT team needed.' },
]

// Decorative, illustrative figures for the hero preview — not live data.
const demoBars = [38, 52, 41, 64, 58, 79, 92]
const demoFeed = [
  { who: 'MoMo payment', plan: '4 HR', amount: 'UGX 1,500' },
  { who: 'Voucher redeemed', plan: '1 HR', amount: 'UGX 500' },
  { who: 'New session', plan: 'Mutungo Hill', amount: 'live' },
  { who: 'Airtel payment', plan: '24 HR', amount: 'UGX 4,000' },
  { who: 'Router online', plan: 'RB951Ui', amount: 'healthy' },
]

function useCountUp(target: number, durationMs = 1400) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | undefined>(undefined)
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, durationMs])
  return value
}

export default function RootPage() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [feedIndex, setFeedIndex] = useState(0)

  const revenue = useCountUp(284500)
  const sessions = useCountUp(126)
  const routers = useCountUp(18)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('register') === '1') {
      setRegisterOpen(true)
      window.history.replaceState(null, '', '/')
    }
    if (params.get('login') === '1') {
      setLoginOpen(true)
      window.history.replaceState(null, '', '/')
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setFeedIndex((i) => (i + 1) % demoFeed.length), 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="home-shell">
      <nav className="home-nav">
        {/* Logo only — hide text when logo is present */}
        <div className="home-brand">
          <img src="/logo.png" alt="AROFi" />
          <span className="home-brand-text" aria-hidden="true">AROFi</span>
        </div>
        <div className="home-actions">
          <Link href="/docs" className="btn btn-ghost">Docs</Link>
          <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Sign In</button>
          <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Get Started Free</button>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-kicker"><Activity size={15} /> Free WiFi Billing · Uganda</div>
          <h1>Run your WiFi<br />like a business.</h1>
          <p>MikroTik hotspot billing with MTN MoMo &amp; Airtel Money. Self-onboarding, no IT team, free to start.</p>
          <div className="home-cta">
            <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>Start for Free</button>
            <Link href="/docs" className="btn btn-ghost">Documentation</Link>
            <button type="button" className="btn btn-ghost" onClick={() => setLoginOpen(true)}>Sign In</button>
          </div>
          <div className="home-trust">
            <span><Radio size={13} className="pulse-dot" /> RADIUS auth</span>
            <span>MTN MoMo &amp; Airtel</span>
            <span>Vouchers &amp; wallets</span>
            <span>Uganda-wide</span>
          </div>
        </div>

        {/* Illustrative live console preview (decorative) */}
        <div className="home-console" aria-hidden="true">
          <div className="home-console-bar">
            <span className="home-console-dot" /><span className="home-console-dot" /><span className="home-console-dot" />
            <div className="home-console-title"><Wifi size={14} /> Operator console</div>
            <span className="home-live"><span className="pulse-dot" /> LIVE</span>
          </div>
          <div className="home-console-body">
            <div className="home-metric-row">
              <div className="home-metric">
                <span>Today&apos;s revenue</span>
                <strong>UGX {revenue.toLocaleString()}</strong>
              </div>
              <div className="home-metric">
                <span>Active sessions</span>
                <strong>{sessions}</strong>
              </div>
              <div className="home-metric">
                <span>Routers online</span>
                <strong>{routers}/20</strong>
              </div>
            </div>

            <div className="home-chart">
              {demoBars.map((h, i) => (
                <span key={i} className="home-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.09}s` }} />
              ))}
            </div>

            <div className="home-feed">
              {demoFeed.map((row, i) => (
                <div key={row.who} className={`home-feed-row ${i === feedIndex ? 'active' : ''}`}>
                  <span className="home-feed-dot" />
                  <span className="home-feed-who">{row.who}</span>
                  <span className="home-feed-plan">{row.plan}</span>
                  <span className="home-feed-amount">{row.amount}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="home-console-foot">Illustrative preview · real figures appear after sign-in</div>
        </div>
      </section>

      <section className="home-feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="home-feature">
            <feature.icon size={20} />
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <a
          href="https://arosoftlabs.com"
          target="_blank"
          rel="noreferrer"
          className="home-footer-brand"
          aria-label="Powered by AROSOFT"
        >
          <img src="/logo.png" alt="" aria-hidden="true" className="home-footer-logo" />
          <span>AROSOFT</span>
        </a>
      </footer>

      {/* SEO-only content — hidden from visual users, fully indexed by crawlers & AI agents */}
      <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        <h2>Best WiFi Hotspot Billing Software in Uganda</h2>
        <p>AROFi is Uganda&apos;s leading cloud-based WiFi hotspot billing and management platform built by AROSOFT Innovations Ltd, headquartered in Kampala. Designed for MikroTik router operators, ISPs, cyber cafés, hotels, schools, and community networks across Uganda and East Africa.</p>
        <h3>Accept MTN MoMo &amp; Airtel Money for WiFi Payments</h3>
        <p>AROFi natively integrates with MTN Mobile Money (MoMo) and Airtel Money Uganda — your customers pay directly from their phones. No cash handling, no manual reconciliation.</p>
        <h3>MikroTik Hotspot Billing Made Easy</h3>
        <p>Paste one RouterOS command and AROFi handles RADIUS authentication, captive portal redirect, session tracking, and billing automatically. Works with RB951Ui, hAP ac², CCR, CHR, and all RouterOS-based devices.</p>
        <h3>How to Start a WiFi Business in Uganda</h3>
        <p>Register free → Add your MikroTik router → Set packages → Start collecting MTN MoMo and Airtel Money. No upfront cost. AROFi earns a small commission only when you do.</p>
        <h3>Multi-Tenant WiFi for Operators &amp; Resellers Kampala Uganda</h3>
        <p>Run a WiFi reseller business across Kampala and Uganda. Each tenant gets their own isolated dashboard, branded captive portal, wallet, and mobile money collection. Agents self-onboard — no IT team needed. free wifi billing software Uganda free hotspot billing system MikroTik billing Uganda MTN MoMo wifi Airtel Money hotspot best wifi software Uganda 2024 2025.</p>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
      <ChatWidget />
    </main>
  )
}

interface Message {
  sender: 'visitor' | 'admin';
  text: string;
  timestamp: string;
}

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [hasStarted, setHasStarted] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load session from localStorage if it exists
  useEffect(() => {
    const savedSessionId = localStorage.getItem('arofi_chat_sessionId')
    const savedCode = localStorage.getItem('arofi_chat_code')
    const savedName = localStorage.getItem('arofi_chat_name')
    if (savedSessionId && savedCode && savedName) {
      setSessionId(savedSessionId)
      setCode(savedCode)
      setName(savedName)
      setHasStarted(true)
    }
  }, [])

  // Poll for messages when session is active and widget is open
  useEffect(() => {
    if (!sessionId || !isOpen) return

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages || [])
        }
      } catch (err) {
        console.error('Error fetching messages:', err)
      }
    }

    fetchMessages() // initial fetch
    const id = setInterval(fetchMessages, 3000)
    return () => clearInterval(id)
  }, [sessionId, isOpen])

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const data = await res.json()
        setSessionId(data.sessionId)
        setCode(data.code)
        setHasStarted(true)
        localStorage.setItem('arofi_chat_sessionId', data.sessionId)
        localStorage.setItem('arofi_chat_code', data.code)
        localStorage.setItem('arofi_chat_name', name)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || !sessionId) return
    const msgText = inputText
    setInputText('')

    // Optimistically add to list
    const tempMsg: Message = {
      sender: 'visitor',
      text: msgText,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMsg])

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text: msgText }),
      })
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="arofi-chat-widget">
      {/* CSS Styles */}
      <style>{`
        .arofi-chat-widget {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99999;
          font-family: inherit;
        }
        .chat-bubble {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #10b981;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .chat-bubble:hover {
          transform: scale(1.05);
          background: #059669;
        }
        .chat-window {
          position: absolute;
          bottom: 72px;
          right: 0;
          width: 340px;
          height: 460px;
          background: #1a1f2c;
          border: 1px solid #2d3748;
          border-radius: 12px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideUp 0.25s ease-out;
        }
        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .chat-header {
          background: #10b981;
          color: white;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .chat-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
        }
        .chat-header-desc {
          font-size: 11px;
          opacity: 0.8;
          margin-top: 2px;
        }
        .close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.8;
        }
        .close-btn:hover {
          opacity: 1;
        }
        .chat-body {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          color: #e2e8f0;
          background: #111827;
        }
        .chat-setup-form {
          display: flex;
          flex-direction: column;
          justify-content: center;
          height: 100%;
          gap: 12px;
        }
        .chat-setup-form p {
          font-size: 13px;
          color: #94a3b8;
          text-align: center;
          margin: 0 0 10px 0;
        }
        .chat-input-field {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 6px;
          padding: 10px 12px;
          color: white;
          font-size: 13px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
        }
        .chat-input-field:focus {
          border-color: #10b981;
        }
        .chat-btn-primary {
          background: #10b981;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .chat-btn-primary:hover {
          background: #059669;
        }
        .chat-btn-primary:disabled {
          background: #4b5563;
          cursor: not-allowed;
        }
        .msg-bubble {
          max-width: 80%;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.4;
          word-break: break-word;
        }
        .msg-bubble.visitor {
          background: #2d3748;
          color: #f7fafc;
          align-self: flex-end;
          border-bottom-right-radius: 2px;
        }
        .msg-bubble.admin {
          background: #064e3b;
          color: #ecfdf5;
          align-self: flex-start;
          border-bottom-left-radius: 2px;
          border: 1px solid #065f46;
        }
        .msg-time {
          font-size: 9px;
          color: #718096;
          margin-top: 4px;
          text-align: right;
        }
        .chat-footer {
          padding: 12px;
          background: #1a1f2c;
          border-top: 1px solid #2d3748;
        }
        .chat-input-row {
          display: flex;
          gap: 8px;
        }
        .chat-input-row input {
          flex: 1;
        }
        .chat-footer-brand {
          font-size: 9px;
          color: #4a5568;
          text-align: center;
          margin-top: 6px;
        }
      `}</style>

      {isOpen ? (
        <div className="chat-window">
          <div className="chat-header">
            <div>
              <h3>AROFi Support</h3>
              {hasStarted && code && (
                <div className="chat-header-desc">Session Code: #{code}</div>
              )}
            </div>
            <button className="close-btn" onClick={() => setIsOpen(false)}>&times;</button>
          </div>

          <div className="chat-body">
            {!hasStarted ? (
              <form onSubmit={handleStartChat} className="chat-setup-form">
                <p>Have questions about AROFi billing? Chat with support directly from your screen!</p>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="chat-input-field"
                  required
                />
                <button type="submit" className="chat-btn-primary" disabled={loading}>
                  {loading ? 'Starting...' : 'Start Chat'}
                </button>
              </form>
            ) : (
              <>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#718096', fontSize: '12px', margin: 'auto' }}>
                    Type a message below to start chatting with support.
                  </div>
                )}
                {messages.map((msg, index) => (
                  <div key={index} className={`msg-bubble ${msg.sender}`}>
                    <div>{msg.text}</div>
                    <div className="msg-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {hasStarted && (
            <div className="chat-footer">
              <form onSubmit={handleSendMessage} className="chat-input-row">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="chat-input-field"
                  required
                />
                <button type="submit" className="chat-btn-primary" style={{ padding: '0 16px' }}>Send</button>
              </form>
              <div className="chat-footer-brand">Powered by AROSOFT WhatsApp Bridge</div>
            </div>
          )}
        </div>
      ) : (
        <div className="chat-bubble" onClick={() => setIsOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
      )}
    </div>
  )
}
