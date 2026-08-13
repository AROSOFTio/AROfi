'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Home,
  Info,
  Menu,
  Search,
  X,
} from 'lucide-react'
import { arofiBook, type BookBlock } from '@/content/arofi-book'

const SWIPE_THRESHOLD = 68

type IndexedPage = { item: (typeof arofiBook)[number]; index: number }
type DocumentationBookProps = { initialSlug?: string }

export default function DocumentationBook({ initialSlug }: DocumentationBookProps) {
  const initialIndex = Math.max(0, arofiBook.findIndex((item) => item.slug === initialSlug))
  const [pageIndex, setPageIndex] = useState(initialIndex)
  const [query, setQuery] = useState('')
  const [contentsOpen, setContentsOpen] = useState(false)
  const [direction, setDirection] = useState<'next' | 'previous' | null>(null)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<number | null>(null)
  const pointerStart = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const animationTimer = useRef<number | null>(null)

  const page = arofiBook[pageIndex]
  const progress = ((pageIndex + 1) / arofiBook.length) * 100
  const pageNumber = String(pageIndex + 1).padStart(2, '0')
  const totalPages = String(arofiBook.length).padStart(2, '0')

  const filteredPages = useMemo<IndexedPage[]>(() => {
    const indexed = arofiBook.map((item, index) => ({ item, index }))
    const normalized = query.trim().toLowerCase()
    if (!normalized) return indexed

    return indexed.filter(({ item }) => {
      const body = item.blocks.map(blockToSearchText).join(' ')
      return `${item.chapter} ${item.title} ${item.summary} ${item.audience} ${body}`
        .toLowerCase()
        .includes(normalized)
    })
  }, [query])

  const openPage = useCallback((index: number, requestedDirection?: 'next' | 'previous') => {
    if (index < 0 || index >= arofiBook.length || index === pageIndex) return
    if (animationTimer.current !== null) window.clearTimeout(animationTimer.current)

    playPaperTurnSound(requestedDirection ?? (index > pageIndex ? 'next' : 'previous'))
    setDirection(requestedDirection ?? (index > pageIndex ? 'next' : 'previous'))
    setPageIndex(index)
    setDragX(0)
    setDragging(false)
    setContentsOpen(false)
    window.history.pushState(null, '', `/docs/${arofiBook[index].slug}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    animationTimer.current = window.setTimeout(() => {
      setDirection(null)
      animationTimer.current = null
    }, 460)
  }, [pageIndex])

  const previousPage = useCallback(() => openPage(pageIndex - 1, 'previous'), [openPage, pageIndex])
  const nextPage = useCallback(() => openPage(pageIndex + 1, 'next'), [openPage, pageIndex])

  useEffect(() => {
    const slug = window.location.pathname.split('/').filter(Boolean).at(-1)
    const nextIndex = slug && slug !== 'docs' ? arofiBook.findIndex((item) => item.slug === slug) : 0
    if (nextIndex >= 0) setPageIndex(nextIndex)
  }, [initialSlug])

  useEffect(() => {
    function handlePopState() {
      const slug = window.location.pathname.split('/').filter(Boolean).at(-1)
      const nextIndex = slug && slug !== 'docs' ? arofiBook.findIndex((item) => item.slug === slug) : 0
      setPageIndex(nextIndex >= 0 ? nextIndex : 0)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') previousPage()
      if (event.key === 'ArrowRight') nextPage()
      if (event.key === 'Escape') setContentsOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextPage, previousPage])

  useEffect(() => {
    return () => {
      if (animationTimer.current !== null) window.clearTimeout(animationTimer.current)
    }
  }, [])

  function beginDrag(clientX: number) {
    dragStart.current = clientX
    pointerStart.current = { x: clientX, y: 0, moved: false }
    setDragging(true)
    setDragX(0)
  }

  function updateDrag(clientX: number, clientY?: number) {
    if (dragStart.current === null) return
    const delta = clientX - dragStart.current
    if (pointerStart.current && (Math.abs(clientX - pointerStart.current.x) > 8 || Math.abs((clientY ?? 0) - pointerStart.current.y) > 8)) {
      pointerStart.current.moved = true
    }
    setDragX(Math.max(-170, Math.min(170, delta)))
  }

  function finishDrag(clientX?: number, pageWidth?: number) {
    if (dragStart.current === null) return
    const completedX = dragX
    const started = pointerStart.current
    dragStart.current = null
    pointerStart.current = null
    setDragging(false)

    if (completedX <= -SWIPE_THRESHOLD) nextPage()
    else if (completedX >= SWIPE_THRESHOLD) previousPage()
    else if (started && !started.moved && typeof clientX === 'number' && typeof pageWidth === 'number') {
      if (clientX < pageWidth * 0.36) previousPage()
      else if (clientX > pageWidth * 0.64) nextPage()
      else setDragX(0)
    }
    else setDragX(0)
  }

  return (
    <main className="docs-book-shell">
      <BookStyles />

      <header className="book-topbar">
        <Link href="/" className="book-brand">
          <img src="/logo.png" alt="AROFi" />
          <span>
            AROFi Handbook
            <small>Visual product and operations guide</small>
          </span>
        </Link>

        <div className="book-top-actions">
          <button type="button" className="mobile-contents-button" onClick={() => setContentsOpen(true)}>
            <Menu size={15} /> Contents
          </button>
          <Link href="/"><Home size={14} /> Home</Link>
          <Link href="/login">Sign in</Link>
        </div>
      </header>

      <div className="book-layout">
        <aside className="book-contents" aria-label="Book contents">
          <ContentsHeader query={query} setQuery={setQuery} />
          <ContentsList pages={filteredPages} pageIndex={pageIndex} openPage={openPage} />
        </aside>

        <section className="book-stage">
          <div className="book-progress">
            <span>{page.chapter}</span>
            <span className="book-progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
            <span>Page {pageNumber} / {totalPages}</span>
          </div>

          <div className="book-desk">
            <article
              className={`book-page ${dragging ? 'dragging' : ''} ${direction === 'next' ? 'turn-next' : direction === 'previous' ? 'turn-previous' : ''}`}
              style={dragging || dragX !== 0 ? { transform: `translateX(${dragX}px) rotateY(${dragX * -0.025}deg)` } : undefined}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return
                if ((event.target as HTMLElement).closest('a,button,input,textarea,select')) return
                event.currentTarget.setPointerCapture(event.pointerId)
                beginDrag(event.clientX)
                pointerStart.current = { x: event.clientX, y: event.clientY, moved: false }
              }}
              onPointerMove={(event) => updateDrag(event.clientX, event.clientY)}
              onPointerUp={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                finishDrag(event.clientX - rect.left, rect.width)
              }}
              onPointerCancel={() => finishDrag()}
            >
              <div className="page-fold" aria-hidden="true" />
              <div className="page-header">
                <div className="page-kicker">
                  <span>{page.chapter}</span>
                  <span className="page-audience">{page.audience}</span>
                </div>
                <h1>{page.title}</h1>
                <p className="page-summary">{page.summary}</p>
              </div>

              <div className="book-blocks">
                {page.blocks.map((block, index) => (
                  <RenderBlock block={block} key={`${page.slug}-${index}`} />
                ))}
              </div>

              <footer className="paper-footer">
                <span>AROFi · AROSOFT Innovations Ltd</span>
                <strong>{pageNumber}</strong>
                <span>{page.title}</span>
              </footer>
            </article>
          </div>

          <nav className="book-navigation" aria-label="Page navigation">
            <button type="button" className="book-nav-button" onClick={previousPage} disabled={pageIndex === 0}>
              <ArrowLeft size={16} />
              <span><small>Previous page</small><strong>{arofiBook[pageIndex - 1]?.title ?? 'Beginning'}</strong></span>
            </button>

            <div className="book-page-control">
              <strong>{pageNumber}</strong>
              <span>of {totalPages}</span>
              <small>Tap page sides or drag to turn</small>
            </div>

            <button type="button" className="book-nav-button next" onClick={nextPage} disabled={pageIndex === arofiBook.length - 1}>
              <span><small>Next page</small><strong>{arofiBook[pageIndex + 1]?.title ?? 'End'}</strong></span>
              <ArrowRight size={16} />
            </button>
          </nav>
        </section>
      </div>

      <div className={`contents-overlay ${contentsOpen ? 'open' : ''}`} onClick={() => setContentsOpen(false)}>
        <aside className="contents-drawer" onClick={(event) => event.stopPropagation()}>
          <div className="contents-drawer-title">
            <strong>Book contents</strong>
            <button type="button" onClick={() => setContentsOpen(false)} aria-label="Close contents"><X size={19} /></button>
          </div>
          <ContentsHeader query={query} setQuery={setQuery} />
          <ContentsList pages={filteredPages} pageIndex={pageIndex} openPage={openPage} />
        </aside>
      </div>
    </main>
  )
}

function playPaperTurnSound(direction: 'next' | 'previous') {
  try {
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) return

    const context = new AudioContextConstructor()
    const duration = 0.18
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate)
    const data = buffer.getChannelData(0)
    const sweep = direction === 'next' ? 1 : -1

    for (let i = 0; i < data.length; i += 1) {
      const t = i / data.length
      const envelope = Math.sin(Math.PI * t) * (1 - t * 0.35)
      const noise = (Math.random() * 2 - 1) * 0.018
      const brush = Math.sin((240 + sweep * 80 * t) * t * Math.PI) * 0.012
      data[i] = (noise + brush) * envelope
    }

    const source = context.createBufferSource()
    const gain = context.createGain()
    gain.gain.value = 0.45
    source.buffer = buffer
    source.connect(gain)
    gain.connect(context.destination)
    source.start()
    source.stop(context.currentTime + duration)
    window.setTimeout(() => void context.close().catch(() => undefined), 320)
  } catch {
    // Browsers may block audio when the page change was not user initiated.
  }
}

function blockToSearchText(block: BookBlock) {
  if (block.type === 'image') return `${block.alt} ${block.caption}`
  if ('text' in block) return block.text
  if ('items' in block) return block.items.join(' ')
  if (block.type === 'table') return [...block.headers, ...block.rows.flat()].join(' ')
  return [block.title ?? '', ...block.lines].join(' ')
}

function ContentsHeader({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return (
    <div className="contents-head">
      <div className="contents-title">
        <span><BookOpen size={14} /> Contents</span>
        <small>{arofiBook.length} pages</small>
      </div>
      <div className="contents-search">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the book" aria-label="Search the handbook" />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button> : null}
      </div>
    </div>
  )
}

function ContentsList({ pages, pageIndex, openPage }: { pages: IndexedPage[]; pageIndex: number; openPage: (index: number) => void }) {
  return (
    <div className="contents-list">
      {pages.length === 0 ? <div className="contents-empty">No page matches this search.</div> : null}
      {pages.map(({ item, index }) => (
        <Link href={`/docs/${item.slug}`} className={`contents-item ${index === pageIndex ? 'active' : ''}`} key={item.slug} onClick={(event) => { event.preventDefault(); openPage(index) }}>
          <span className="contents-number">{String(index + 1).padStart(2, '0')}</span>
          <span className="contents-copy"><strong>{item.title}</strong><small>{item.chapter} · {item.audience}</small></span>
        </Link>
      ))}
    </div>
  )
}

function RenderBlock({ block }: { block: BookBlock }) {
  if (block.type === 'p') return <p>{block.text}</p>
  if (block.type === 'h2') return <h2>{block.text}</h2>
  if (block.type === 'h3') return <h3>{block.text}</h3>
  if (block.type === 'ul') return <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
  if (block.type === 'ol') return <ol>{block.items.map((item) => <li key={item}>{item}</li>)}</ol>

  if (block.type === 'image') {
    return (
      <figure className="book-figure">
        <img src={block.src} alt={block.alt} loading="lazy" />
        <figcaption>{block.caption}</figcaption>
      </figure>
    )
  }

  if (block.type === 'table') {
    return (
      <div className="book-table-wrap">
        <table className="book-table">
          <thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }

  if (block.type === 'code') {
    return <div className="book-code">{block.title ? <div className="book-code-title">{block.title}</div> : null}<pre>{block.lines.join('\n')}</pre></div>
  }

  const Icon = block.tone === 'success' ? CheckCircle2 : block.tone === 'warning' ? AlertCircle : Info
  return <aside className={`book-callout ${block.tone}`}><Icon size={18} /><div><strong>{block.title}</strong><p>{block.text}</p></div></aside>
}

function BookStyles() {
  return (
    <style>{`
      :root{--book-ink:#172033;--book-muted:#667085;--book-line:#cfe0ff;--book-paper:#ffffff;--book-blue:#2463eb;--book-green:#00a86b;--book-bg:#f4f8ff}
      *{box-sizing:border-box}
      .docs-book-shell{min-height:100vh;background:radial-gradient(circle at 18% 0%,#fff 0,transparent 34%),linear-gradient(135deg,#f7fbff,#ffffff 48%,#eef6ff);color:var(--book-ink);font-family:"Segoe UI",SegoeUI,Roboto,"Helvetica Neue",Arial,sans-serif;padding-bottom:38px}
      .book-topbar{height:64px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 24px;border-bottom:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.88);backdrop-filter:blur(18px);position:sticky;top:0;z-index:40}
      .book-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--book-ink);font-size:15px;font-weight:750}.book-brand img{width:31px;height:31px;object-fit:contain}.book-brand small{font-size:11px;color:var(--book-muted);font-weight:600;display:block;margin-top:1px}
      .book-top-actions{display:flex;align-items:center;gap:8px}.book-top-actions a,.book-top-actions button{display:inline-flex;align-items:center;gap:6px;height:36px;border:1px solid var(--book-line);background:#fff;color:#344054;border-radius:9px;padding:0 12px;font:600 12.5px/1 "Segoe UI",sans-serif;text-decoration:none;cursor:pointer}.mobile-contents-button{display:none!important}
      .book-layout{width:min(1460px,calc(100% - 36px));margin:24px auto 0;display:grid;grid-template-columns:286px minmax(0,1fr);gap:24px;align-items:start}
      .book-contents{position:sticky;top:88px;max-height:calc(100vh - 112px);display:flex;flex-direction:column;border:1px solid rgba(148,163,184,.38);border-radius:16px;background:rgba(255,255,255,.9);box-shadow:0 18px 45px rgba(15,23,42,.07);overflow:hidden}
      .contents-head{padding:16px;border-bottom:1px solid var(--book-line)}.contents-title{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:750;margin-bottom:11px}.contents-title span{display:flex;align-items:center;gap:7px}.contents-title small{font-size:10.5px;color:var(--book-muted);font-weight:600}
      .contents-search{position:relative}.contents-search>svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#8290a6}.contents-search input{width:100%;height:37px;border:1px solid var(--book-line);border-radius:9px;background:#f8fafc;padding:0 31px 0 34px;font:13px "Segoe UI",sans-serif;outline:none;color:var(--book-ink)}.contents-search input:focus{border-color:#8db1ff;box-shadow:0 0 0 3px rgba(36,99,235,.1)}.contents-search button{position:absolute;right:7px;top:7px;width:23px;height:23px;border:0;background:transparent;color:#7a879a;cursor:pointer;padding:3px}
      .contents-list{overflow:auto;padding:8px}.contents-item{width:100%;display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:start;border:1px solid transparent;background:transparent;border-radius:10px;padding:9px;text-align:left;color:#344054;cursor:pointer;font-family:inherit;text-decoration:none}.contents-item:hover{background:#f7fbff;border-color:#dceaff}.contents-item.active{background:#eaf2ff;color:#174ebd;border-color:#bcd6ff}.contents-number{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#edf6ff;color:#66758a;font-size:10.5px;font-weight:800}.contents-item.active .contents-number{background:#d7e7ff;color:#1753ca}.contents-copy strong{display:block;font-size:12.6px;line-height:1.32;font-weight:680}.contents-copy small{display:block;margin-top:3px;color:#8290a3;font-size:9.8px;font-weight:600}.contents-empty{padding:28px 12px;text-align:center;color:var(--book-muted);font-size:12px}
      .book-stage{min-width:0}.book-progress{display:grid;grid-template-columns:auto minmax(100px,1fr) auto;gap:14px;align-items:center;margin:0 4px 12px;color:#5e6b7f;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.book-progress-track{height:4px;border-radius:999px;background:#d6deea;overflow:hidden}.book-progress-track span{display:block;height:100%;background:linear-gradient(90deg,#2463eb,#60a5fa);border-radius:inherit;transition:width .28s ease}
      .book-desk{padding:12px 18px 22px;border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.78),rgba(36,99,235,.06));perspective:1800px;border:1px solid rgba(207,224,255,.74)}
      .book-page{position:relative;min-height:760px;border:1px solid #cfe0ff;border-radius:5px 16px 16px 5px;background:linear-gradient(90deg,#f8fbff 0,#ffffff 2.4%,#ffffff 97%,#f7fbff 100%);box-shadow:0 24px 55px rgba(15,23,42,.12),inset 18px 0 22px rgba(36,99,235,.035);padding:52px 72px 82px;transform-origin:left center;transition:transform .2s ease,box-shadow .2s ease;overflow:hidden;touch-action:pan-y;cursor:grab}.book-page.dragging{transition:none;cursor:grabbing;box-shadow:0 30px 70px rgba(15,23,42,.18)}
      .book-page::before{content:"";position:absolute;left:22px;top:0;bottom:0;width:1px;background:rgba(36,99,235,.16);box-shadow:5px 0 12px rgba(36,99,235,.05)}.book-page::after{content:"";position:absolute;right:0;top:0;bottom:0;width:8px;background:repeating-linear-gradient(90deg,#e8f1ff 0 1px,#ffffff 1px 2px);opacity:.85}
      .page-fold{position:absolute;right:0;top:0;width:70px;height:70px;background:linear-gradient(225deg,#eef6ff 0 48%,#bcd6ff 49% 51%,#ffffff 52% 100%);clip-path:polygon(0 0,100% 100%,100% 0);filter:drop-shadow(-5px 7px 5px rgba(36,99,235,.10));pointer-events:none}
      .turn-next{animation:turnNext .46s cubic-bezier(.2,.75,.2,1)}.turn-previous{animation:turnPrevious .46s cubic-bezier(.2,.75,.2,1)}@keyframes turnNext{0%{transform:rotateY(-7deg) translateX(18px);opacity:.7}100%{transform:none;opacity:1}}@keyframes turnPrevious{0%{transform:rotateY(7deg) translateX(-18px);opacity:.7}100%{transform:none;opacity:1}}
      .page-header{padding-right:34px;border-bottom:1px solid #dceaff;padding-bottom:24px;margin-bottom:28px}.page-kicker{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#2463eb;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.13em}.page-audience{color:#00a86b;letter-spacing:.05em}.book-page h1{font-size:clamp(32px,4vw,52px);line-height:1.07;letter-spacing:-.038em;margin:17px 0 12px;color:#172033;font-weight:760;max-width:920px}.page-summary{font-size:18px!important;line-height:1.55!important;color:#607087!important;margin:0!important;max-width:900px}
      .book-blocks{max-width:1000px;margin:0 auto}.book-blocks>p{font-size:16px;line-height:1.75;color:#344054;margin:0 0 18px}.book-blocks h2{font-size:25px;line-height:1.25;margin:34px 0 13px;color:#172033;letter-spacing:-.018em}.book-blocks h3{font-size:19px;margin:25px 0 10px;color:#22304a}.book-blocks ul,.book-blocks ol{margin:0 0 22px;padding-left:25px;color:#344054}.book-blocks li{font-size:15.5px;line-height:1.68;padding-left:5px;margin:7px 0}.book-blocks li::marker{color:#2463eb;font-weight:750}
      .book-figure{margin:0 0 30px;border:1px solid #d8dfeb;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,.08)}.book-figure img{display:block;width:100%;height:auto;aspect-ratio:1400/760;object-fit:cover;background:#eef3f9}.book-figure figcaption{padding:12px 16px;border-top:1px solid #e3e8f0;color:#667085;font-size:12.5px;line-height:1.5;background:#fbfcfe}
      .book-callout{display:grid;grid-template-columns:22px minmax(0,1fr);gap:11px;margin:24px 0;padding:16px 18px;border:1px solid #cfe0ff;border-radius:12px;background:#f2f7ff;color:#24508f}.book-callout.success{border-color:#bce8cc;background:#f0fbf4;color:#087443}.book-callout.warning{border-color:#f4d7a3;background:#fff9ed;color:#9a5a08}.book-callout svg{margin-top:2px}.book-callout strong{display:block;font-size:14px;margin-bottom:4px}.book-callout p{margin:0;font-size:13.5px;line-height:1.58;color:inherit}
      .book-table-wrap{overflow:auto;margin:20px 0 28px;border:1px solid #d8dfeb;border-radius:12px;background:#fff}.book-table{width:100%;border-collapse:collapse;min-width:560px}.book-table th,.book-table td{padding:12px 14px;border-bottom:1px solid #e5e9f0;text-align:left;vertical-align:top;font-size:13px;line-height:1.45}.book-table th{background:#f3f6fa;color:#344054;font-weight:750}.book-table td{color:#475467}.book-table tr:last-child td{border-bottom:0}
      .book-code{margin:20px 0 26px;border-radius:12px;background:#111827;color:#e5eefb;overflow:hidden;box-shadow:0 12px 25px rgba(15,23,42,.12)}.book-code-title{padding:10px 14px;background:#1f2937;color:#a8c6ff;font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.book-code pre{margin:0;padding:17px;overflow:auto;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
      .paper-footer{position:absolute;left:72px;right:72px;bottom:27px;padding-top:13px;border-top:1px solid #dceaff;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;color:#667085;font-size:9.5px;text-transform:uppercase;letter-spacing:.08em}.paper-footer strong{display:grid;place-items:center;width:36px;height:36px;border:1px solid #bcd6ff;border-radius:50%;font-size:13px;color:#174ebd;background:#f7fbff}.paper-footer span:last-child{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .book-navigation{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:14px;margin-top:14px}.book-nav-button{min-width:0;display:flex;align-items:center;gap:11px;border:1px solid rgba(148,163,184,.48);border-radius:12px;background:rgba(255,255,255,.86);padding:11px 13px;color:#344054;cursor:pointer;text-align:left;font-family:inherit}.book-nav-button.next{justify-content:flex-end;text-align:right}.book-nav-button:disabled{opacity:.42;cursor:not-allowed}.book-nav-button span{min-width:0}.book-nav-button small{display:block;color:#8290a3;font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.book-nav-button strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.book-page-control{text-align:center;min-width:150px}.book-page-control strong{font-size:24px;color:#172033}.book-page-control span{font-size:12px;color:#667085;margin-left:5px}.book-page-control small{display:block;margin-top:3px;font-size:9.5px;color:#8290a3}
      .contents-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:70}.contents-overlay.open{display:block}.contents-drawer{width:min(360px,90vw);height:100%;background:#fff;margin-left:auto;display:flex;flex-direction:column;box-shadow:-20px 0 50px rgba(15,23,42,.2)}.contents-drawer-title{height:58px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--book-line)}.contents-drawer-title button{border:0;background:transparent;padding:7px;color:#667085;cursor:pointer}
      @media(max-width:1040px){.book-layout{grid-template-columns:1fr}.book-contents{display:none}.mobile-contents-button{display:inline-flex!important}.book-page{padding:46px 52px 78px}.paper-footer{left:52px;right:52px}}
      @media(max-width:720px){.book-topbar{padding:0 14px}.book-top-actions>a:first-of-type{display:none}.book-brand small{display:none}.book-layout{width:calc(100% - 18px);margin-top:12px}.book-progress{grid-template-columns:auto 1fr;font-size:9.5px}.book-progress>span:last-child{display:none}.book-desk{padding:5px 2px 12px;border-radius:14px}.book-page{min-height:650px;padding:34px 23px 75px;border-radius:4px 11px 11px 4px}.book-page::before{left:8px}.page-fold{width:48px;height:48px}.page-header{padding-right:18px;margin-bottom:22px}.book-page h1{font-size:31px}.page-summary{font-size:15.5px!important}.book-blocks>p{font-size:14.5px}.book-blocks h2{font-size:21px;margin-top:28px}.book-blocks li{font-size:14px}.book-figure{margin-left:-6px;margin-right:-6px;border-radius:11px}.paper-footer{left:23px;right:23px;bottom:20px}.paper-footer span{display:none}.paper-footer{grid-template-columns:1fr;justify-items:center}.book-navigation{grid-template-columns:1fr 78px 1fr;gap:7px}.book-nav-button{padding:9px}.book-nav-button strong{display:none}.book-nav-button small{margin:0}.book-page-control{min-width:0}.book-page-control small{display:none}}
      @media(max-width:460px){.book-top-actions a{display:none}.book-top-actions button{height:34px;padding:0 9px}.book-brand{font-size:13px}.page-kicker{font-size:9.5px}.book-page h1{font-size:27px}.book-table th,.book-table td{padding:10px;font-size:12px}}
      @media(prefers-reduced-motion:reduce){.book-page,.book-progress-track span{transition:none}.turn-next,.turn-previous{animation:none}}
    `}</style>
  )
}
