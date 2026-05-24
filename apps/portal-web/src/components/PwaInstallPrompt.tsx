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
      void navigator.serviceWorker.register('/portal/sw.js', { scope: '/portal/' })
    }

    const nav = window.navigator as Navigator & { standalone?: boolean }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone)
    if (standalone || window.localStorage.getItem('arofi-portal-install-dismissed') === '1') {
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
    window.localStorage.setItem('arofi-portal-install-dismissed', '1')
    setVisible(false)
  }

  if (!visible) {
    return null
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-4 text-slate-900 shadow-2xl backdrop-blur sm:flex-row sm:items-center">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-xl font-black text-white">+</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">Install {appName}</div>
        <div className="mt-1 text-xs leading-5 text-slate-600">
          {iosGuide
            ? 'On iPhone or iPad, tap Share, then Add to Home Screen.'
            : 'Add it to your device for faster access and an app-like window.'}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void handleInstall()} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
          Install
        </button>
        <button type="button" onClick={dismiss} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">
          Later
        </button>
      </div>
    </div>
  )
}
