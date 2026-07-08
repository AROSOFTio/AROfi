'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Bot, Headset, Sparkles } from 'lucide-react'

interface Message {
  sender: 'visitor' | 'admin'
  text: string
  timestamp: string
}

interface SuggestedLink {
  label: string
  path: string
}

interface AiMessage {
  role: 'user' | 'assistant'
  text: string
  links?: SuggestedLink[]
}

const DEFAULT_GREETING =
  "Hi! I'm Aria, AROFi's AI assistant. Ask me about pricing, routers, mobile money payouts, or anything else about the platform."

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'ai' | 'support'>('ai')
  const [sessionUser, setSessionUser] = useState<{ displayName: string } | null>(null)

  // Human support chat (WhatsApp bridge) — unchanged from the original widget.
  const [name, setName] = useState('')
  const [hasStarted, setHasStarted] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // AI assistant chat (Aria)
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([{ role: 'assistant', text: DEFAULT_GREETING }])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const aiMessagesEndRef = useRef<HTMLDivElement>(null)

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

  // If signed in, personalize Aria's greeting — the real account snapshot
  // (routers, revenue) is fetched per-message by the backend once they ask.
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.user) return
        setSessionUser({ displayName: data.user.displayName })
        setAiMessages([
          {
            role: 'assistant',
            text: `Hi ${data.user.displayName.split(' ')[0]}! I'm Aria. Ask me about your routers, revenue, or any account issue — I can see your live numbers and help troubleshoot.`,
          },
        ])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Poll for messages when session is active and widget is open
  useEffect(() => {
    if (!sessionId || !isOpen || mode !== 'support') return

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
  }, [sessionId, isOpen, mode])

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, aiLoading])

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
      const reply = data?.reply || 'Sorry, something went wrong. Please try again or use "Talk to Support".'
      const links: SuggestedLink[] = Array.isArray(data?.links) ? data.links : []
      setAiMessages((prev) => [...prev, { role: 'assistant', text: reply, links }])
    } catch (err) {
      console.error(err)
      setAiMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, something went wrong. Please try again or use "Talk to Support".' }])
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
              <h3>{mode === 'ai' ? <><Sparkles size={15} /> Aria</> : 'AROFi Support'}</h3>
              {mode === 'support' && hasStarted && code && (
                <div className="chat-header-desc">Session Code: #{code}</div>
              )}
              {mode === 'ai' && (
                <div className="chat-header-desc">{sessionUser ? `Your AI copilot, ${sessionUser.displayName.split(' ')[0]}` : "AROFi's AI assistant"}</div>
              )}
            </div>
            <button className="close-btn" onClick={() => setIsOpen(false)} aria-label="Close chat">
              &times;
            </button>
          </div>

          {mode === 'ai' ? (
            <>
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
                    placeholder={sessionUser ? 'Ask about your routers, revenue, an issue...' : 'Ask about pricing, routers, payouts...'}
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    className="chat-input-field"
                    maxLength={600}
                    required
                  />
                  <button type="submit" className="chat-btn-primary" style={{ padding: '0 16px' }} disabled={aiLoading}>Send</button>
                </form>
                <button type="button" className="chat-escalate-link" onClick={() => setMode('support')}>
                  <Headset size={12} /> Prefer a human? Talk to Support
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="chat-body">
                <button type="button" className="chat-back-link" onClick={() => setMode('ai')}>
                  <ArrowLeft size={12} /> Back to Aria
                </button>
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
            </>
          )}
        </div>
      ) : (
        <div className="chat-bubble" onClick={() => setIsOpen(true)} role="button" aria-label="Chat with Aria, AROFi's AI assistant">
          <Bot size={28} strokeWidth={2} />
        </div>
      )}
    </div>
  )
}
