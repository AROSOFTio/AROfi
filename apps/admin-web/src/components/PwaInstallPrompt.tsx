'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function PwaInstallPrompt({ appName }: { appName: string }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosGuide, setIosGuide] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js')
    }

    const nav = window.navigator as Navigator & { standalone?: boolean }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone)
    if (standalone || window.localStorage.getItem('arofi-install-dismissed') === '1') {
      return
    }

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    const timer = window.setTimeout(() => {
      setVisible(true)
      setIosGuide(isIos)
    }, 1200)

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      setIosGuide(false)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  async function handleInstall() {
    if (!installEvent) {
      setIosGuide(true)
      return
    }

    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') {
      setVisible(false)
      setInstallEvent(null)
    }
  }

  function dismiss() {
    window.localStorage.setItem('arofi-install-dismissed', '1')
    setVisible(false)
  }

  if (!visible) {
    return null
  }

  return (
    <div className="install-prompt" role="dialog" aria-live="polite" aria-label={`Install ${appName}`}>
      <div className="install-prompt-icon" aria-hidden="true">+</div>
      <div className="install-prompt-body">
        <strong>Install {appName}</strong>
        <span>
          {iosGuide
            ? 'On iPhone or iPad, tap Share, then Add to Home Screen.'
            : 'Add it to your device for faster access and an app-like window.'}
        </span>
      </div>
      <div className="install-prompt-actions">
        <button type="button" className="btn btn-primary" onClick={() => void handleInstall()}>
          Install
        </button>
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Later
        </button>
      </div>
    </div>
  )
}
