'use client'

import React, { useEffect, useRef, useState } from 'react'

interface Message {
  sender: 'visitor' | 'admin'
  text: string
  timestamp: string
}

export default function ChatWidget() {
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
      {isOpen ? (
        <div className="chat-window">
          <div className="chat-header">
            <div>
              <h3>AROFi Support</h3>
              {hasStarted && code && (
                <div className="chat-header-desc">Session Code: #{code}</div>
              )}
            </div>
            <button className="close-btn" onClick={() => setIsOpen(false)} aria-label="Close chat">
              &times;
            </button>
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
        <div className="chat-bubble" onClick={() => setIsOpen(true)} role="button" aria-label="Open support chat">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
      )}
    </div>
  )
}
