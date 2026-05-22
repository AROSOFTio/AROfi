'use client'

import { useState } from 'react'

export default function DocsCommandBlock({
  title,
  commands,
}: {
  title: string
  commands: string[]
}) {
  const [copied, setCopied] = useState(false)
  const text = commands.join('\n')

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-4 text-sm leading-7 text-emerald-100">
        <code>{text}</code>
      </pre>
    </div>
  )
}
