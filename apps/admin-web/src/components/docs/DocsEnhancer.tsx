'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const URL_LINE = /^https?:\/\/[^\s]+$/i

export default function DocsEnhancer() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname?.startsWith('/docs')) return

    function enhance() {
      const subtitle = document.querySelector<HTMLElement>('.book-brand small')
      if (subtitle) subtitle.textContent = 'Step-by-step setup and operations book'

      document.querySelectorAll<HTMLElement>('.book-code pre').forEach((pre) => {
        if (pre.dataset.linkified === 'true') return
        const lines = (pre.textContent ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
        if (!lines.length || !lines.every((line) => URL_LINE.test(line))) return

        pre.textContent = ''
        lines.forEach((href) => {
          const anchor = document.createElement('a')
          anchor.href = href
          anchor.target = '_blank'
          anchor.rel = 'noreferrer noopener'
          anchor.textContent = href
          anchor.className = 'book-external-link'
          pre.appendChild(anchor)
        })
        pre.dataset.linkified = 'true'
      })
    }

    enhance()
    const root = document.querySelector('.docs-book-shell')
    if (!root) return
    const observer = new MutationObserver(enhance)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [pathname])

  return (
    <style jsx global>{`
      .book-code pre .book-external-link {
        display: block;
        color: var(--arofi-accent, #2563eb);
        font-weight: 700;
        overflow-wrap: anywhere;
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
      }
      .book-code pre .book-external-link + .book-external-link { margin-top: 8px; }
    `}</style>
  )
}
