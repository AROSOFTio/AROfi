'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Bot, Sparkles, MessageSquareCode } from 'lucide-react'

interface SuggestedLink {
  label: string
  path: string
}

interface AiMessage {
  role: 'user' | 'assistant'
  text: string
  links?: SuggestedLink[]
}

type ChatWidgetProps = {
  initiallyOpen?: boolean
}

const DEFAULT_GREETING =
  "Hi! I'm AROFi Support AI. Ask about pricing, routers, vouchers, mobile money payouts, or message a human on WhatsApp anytime."

const WHATSAPP_NUMBER = '256787726388'
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi AROFi team, I need help with my account.')}`

export default function ChatWidget({ initiallyOpen = false }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const [sessionUser, setSessionUser] = useState<{ displayName: string } | null>(null)
  const sessionRequestedRef = useRef(false)

  // AI assistant chat
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([{ role: 'assistant', text: DEFAULT_GREETING }])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const aiMessagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || sessionRequestedRef.current) return
    sessionRequestedRef.current = true

    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.user) return
        setSessionUser({ displayName: data.user.displayName })
        setAiMessages([
          {
            role: 'assistant',
            text: `Hi ${data.user.displayName.split(' ')[0]}! I'm AROFi Support AI. Ask me about routers, revenue, vouchers, or any account issue — I can help troubleshoot and hand you to a human if needed.`,
          },
        ])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, aiLoading])

  useEffect(() => {
    const openChat = () => setIsOpen(true)
    window.addEventListener('arofi:open-chat', openChat)
    return () => window.removeEventListener('arofi:open-chat', openChat)
  }, [])

  const handleSendAiMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = aiInput.trim()
    if (!text || aiLoading) return
    setAiInput('')

    const history = aiMessages.map((m) => ({ role: m.role === 'assistant' ? ('model' as const) : ('user' as const), text: m.text }))

    setAiMessages((prev) => [...prev, { role: 'user', text }])
    setAiLoading(true)
    try {
      const res = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })
      const data = res.ok ? await res.json() : null
      const reply = data?.reply || 'Sorry, something went wrong. Please try again or message us on WhatsApp.'
      const links: SuggestedLink[] = Array.isArray(data?.links) ? data.links : []
      setAiMessages((prev) => [...prev, { role: 'assistant', text: reply, links }])
    } catch (err) {
      console.error(err)
      setAiMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, something went wrong. Please try again or message us on WhatsApp.' }])
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="arofi-chat-widget">
      {isOpen ? (
        <div className="chat-window">
          <div className="chat-header">
            <div>
              <h3><Sparkles size={16} className="text-amber-400" /> AROFi AI Support</h3>
              <div className="chat-header-desc">{sessionUser ? `AI-Powered Assistance for ${sessionUser.displayName.split(' ')[0]}` : 'AI Support with Human Escalation'}</div>
            </div>
            <button className="close-btn" onClick={() => setIsOpen(false)} aria-label="Close chat">
              &times;
            </button>
          </div>

          <div className="chat-body">
            {aiMessages.map((msg, index) => (
              <div key={index} className={`msg-bubble ${msg.role === 'user' ? 'visitor' : 'admin'}`}>
                <div>{msg.text}</div>
                {msg.links && msg.links.length > 0 && (
                  <div className="chat-link-row">
                    {msg.links.map((link) => (
                      <Link key={link.path} href={link.path} className="chat-link-chip" onClick={() => setIsOpen(false)}>
                        {link.label} <ArrowRight size={12} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {aiLoading && (
              <div className="msg-bubble admin">
                <div className="chat-typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={aiMessagesEndRef} />
          </div>
          <div className="chat-footer">
            <form onSubmit={handleSendAiMessage} className="chat-input-row">
              <input
                type="text"
                placeholder={sessionUser ? 'Ask AI about your routers, revenue, issues...' : 'Ask AI about pricing, routers, payouts...'}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                className="chat-input-field"
                maxLength={600}
                required
              />
              <button type="submit" className="chat-btn-primary" style={{ padding: '0 16px' }} disabled={aiLoading}>Send</button>
            </form>
            <a href={WHATSAPP_HREF} target="_blank" rel="noreferrer" className="chat-escalate-link">
              Prefer a human? Message us on WhatsApp
            </a>
          </div>
        </div>
      ) : (
        <div
          className="chat-bubble ai-chat-bubble"
          onClick={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setIsOpen(true)
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Open AROFi AI Support"
        >
          <div className="ai-bubble-content">
            <Sparkles size={22} className="chat-bubble-ai-icon" aria-hidden="true" />
            <span className="ai-bubble-label">AI Support</span>
          </div>
          <MessageSquareCode size={15} className="chat-bubble-sparkle-badge" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

