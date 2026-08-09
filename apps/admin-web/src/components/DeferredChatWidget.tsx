'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const ChatWidget = dynamic(() => import('./ChatWidget'), {
  ssr: false,
  loading: () => null,
})

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export default function DeferredChatWidget() {
  const [enabled, setEnabled] = useState(false)
  const [openOnMount, setOpenOnMount] = useState(false)

  useEffect(() => {
    const idleWindow = window as IdleWindow
    let idleHandle: number | undefined
    let timeoutHandle: number | undefined

    const enable = () => setEnabled(true)
    const openChat = () => {
      setOpenOnMount(true)
      setEnabled(true)
    }

    window.addEventListener('arofi:open-chat', openChat)

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(enable, { timeout: 5000 })
    } else {
      timeoutHandle = window.setTimeout(enable, 3500)
    }

    return () => {
      window.removeEventListener('arofi:open-chat', openChat)
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle)
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
    }
  }, [])

  return enabled ? <ChatWidget initiallyOpen={openOnMount} /> : null
}
