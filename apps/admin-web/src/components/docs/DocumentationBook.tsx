'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Home,
  Info,
  List,
  Menu,
  Search,
  X,
} from 'lucide-react'
import { arofiBook, type BookBlock } from '@/content/arofi-book'

const SWIPE_THRESHOLD = 64

export default function DocumentationBook() {
  const [pageIndex, setPageIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [contentsOpen, setContentsOpen] = useState(false)
  const [direction, setDirection] = useState<'next' | 'previous' | null>(null)
  const [dragX, setDragX] = useState(0)
  const dragStart = useRef<number | null>(null)
  const animationTimer = useRef<number | null>(null)

  const page = arofiBook[pageIndex]
  const progress = ((pageIndex + 1) / arofiBook.length) * 100

  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return arofiBook.map((item, index) => ({ item, index }))
    return arofiBook
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const blockText = item.blocks.map((block) => {
          if ('text' in block) return block.text
          if ('items' in block) return block.items.join(' ')
          if (block.type === 'table') return [...block.headers, ...block.rows.flat()].join(' ')
          if (block.type === 'code') return block.lines.join(' ')
          return ''
        }).join(' ')
        return `${item.title} ${item.summary} ${item.chapter} ${blockText}`.toLowerCase().includes(normalized)
      })
  }, [query])

  const openPage = useCallback((index: number, nextDirection?: 'next' | 'previous') => {
    if (index < 0 || index >= arofiBook.length || index === pageIndex) return
    if (animationTimer.current) window.clearTimeout(animationTimer.current)
    setDirection(nextDirection ?? (index > pageIndex ? 'next' : 'previous'))
    setPageIndex(index)
    setDragX(0)
    setContentsOpen(false)
    const nextSlug = arofiBook[index].slug
    window.history.replaceState(null, '', `/docs#${nextSlug}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    animationTimer.current = window.setTimeout(() => setDirection(null), 520)
  }, [pageIndex])

  const previousPage = useCallback(() => openPage(pageIndex - 1, 'previous'), [openPage, pageIndex])
  const nextPage = useCallback(() => openPage(pageIndex + 1, 'next'), [openPage, pageIndex])

  useEffect(() => {
    const slug = window.location.hash.replace('#', '')
    const index = arofiBook.findIndex((item) => item.slug === slug)
    if (index >= 0) setPageIndex(index)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') previousPage()
      if (event.key === 'ArrowRight') nextPage()
      if (event.key === 'Escape') setContentsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nextPage, previousPage])

  useEffect(() => () => {
    if (animationTimer.current) window.clearTimeout(animationTimer.current)
  }, [])

  function beginDrag(clientX: number) {
    dragStart.current = clientX
    setDragX(0)
  }

  function updateDrag(clientX: number) {
    if (dragStart.current === null) return
    setDragX(Math.max(-150, Math.min(150, clientX - dragStart.current)))
  }

  function finishDrag() {
    if (dragStart.current === null) return
    if (dragX <= -SWIPE_THRESHOLD) nextPage()
    else if (dragX >= SWIPE_THRESHOLD) previousPage()
    else setDragX(0)
    dragStart.current = null
  }

  return (
    <main className="docs-book-shell">
      <style>{`
        :root{--book-ink:#172033;--book-muted:#657187;--book-line:#d8deea;--book-paper:#fffdf8;--book-blue:#2463eb;--book-blue-soft:#edf4ff;--book-bg:#eef2f7}
        *{box-sizing:border-box}
        .docs-book-shell{min-height:100vh;background:radial-gradient(circle at 15% 0%,#fff 0,transparent 35%),linear-gradient(135deg,#edf1f7,#f8fafc 48%,#e9eef6);color:var(--book-ink);font-family:"Segoe UI",SegoeUI,Roboto,"Helvetica Neue",Arial,sans-serif;padding-bottom:36px}
        .book-topbar{height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 24px;border-bottom:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.82);backdrop-filter:blur(18px);position:sticky;top:0;z-index:40}
        .book-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--book-ink);font-size:15px;font-weight:700}.book-brand img{width:31px;height:31px;object-fit:contain}.book-brand small{font-size:11px;color:var(--book-muted);font-weight:600;display:block;margin-top:1px}
        .book-top-actions{display:flex;align-items:center;gap:8px}.book-top-actions a,.book-top-actions button{display:inline-flex;align-items:center;gap:6px;height:36px;border:1px solid var(--book-line);background:#fff;color:#334155;border-radius:9px;padding:0 12px;font:600 12.5px inherit;text-decoration:none;cursor:pointer}.book-top-actions button:hover,.book-top-actions a:hover{border-color:#aeb9cc;background:#f8fafc}
        .book-layout{width:min(1440px,calc(100% - 36px));margin:24px auto 0;display:grid;grid-template-columns:282px minmax(0,1fr);gap:22px;align-items:start}
        .book-contents{position:sticky;top:88px;max-height:calc(100vh - 112px);display:flex;flex-direction:column;border:1px solid rgba(148,163,184,.36);border-radius:15px;background:rgba(255,255,255,.84);box-shadow:0 18px 45px rgba(15,23,42,.06);overflow:hidden}
        .contents-head{padding:16px;border-bottom:1px solid var(--book-line)}.contents-title{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:11px}.contents-count{font-size:10.5px;color:var(--book-muted);font-weight:600}
        .contents-search{position:relative}.contents-search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#8290a6}.contents-search input{width:100%;height:37px;border:1px solid var(--book-line);border-radius:9px;background:#f8fafc;padding:0 30px 0 34px;font:13px inherit;outline:none;color:var(--book-ink)}.contents-search input:focus{border-color:#8db1ff;box-shadow:0 0 0 3px rgba(36,99,235,.1)}.contents-search button{position:absolute;right:7px;top:7px;width:23px;height:23px;border:0;background:transparent;color:#7a879a;cursor:pointer;padding:3px}
        .contents-list{overflow:auto;padding:8px}.contents-item{width:100%;display:grid;grid-template-columns:32px minmax(0,1fr);gap:9px;align-items:start;border:0;background:transparent;border-radius:9px;padding:9px;text-align:left;color:#344054;cursor:pointer;font-family:inherit}.contents-item:hover{background:#f3f6fa}.contents-item.active{background:var(--book-blue-soft);color:#174ebd}.contents-number{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:#edf1f6;color:#66758a;font-size:10.5px;font-weight:700}.contents-item.active .contents-number{background:#d9e8ff;color:#1753ca}.contents-copy strong{display:block;font-size:12.7px;line-height:1.3;font-weight:650}.contents-copy span{display:block;font-size:10.5px;color:#8490a2;margin-top:3px;line-height:1.3}.contents-empty{padding:28px 16px;text-align:center;color:var(--book-muted);font-size:12px}
        .book-stage{min-width:0;perspective:1800px}.book-progress{display:flex;align-items:center;gap:12px;margin:0 2px 10px;color:#69778b;font-size:11.5px}.book-progress-track{height:3px;flex:1;background:#dce3ed;border-radius:999px;overflow:hidden}.book-progress-track span{display:block;height:100%;background:linear-gradient(90deg,#2463eb,#4c8dff);transition:width .35s ease}
        .book-page-wrap{position:relative;transform-style:preserve-3d}.book-page{position:relative;min-height:760px;background:var(--book-paper);border:1px solid rgba(148,163,184,.42);border-radius:4px 15px 15px 4px;box-shadow:0 28px 70px rgba(15,23,42,.13),inset 18px 0 35px rgba(37,46,63,.035);padding:56px clamp(34px,6vw,92px) 46px;overflow:hidden;touch-action:pan-y;user-select:text;transform:translateX(calc(var(--drag-x,0) * 1px)) rotateY(calc(var(--drag-x,0) * -.025deg));transition:transform .2s ease,box-shadow .2s ease}
        .book-page.dragging{transition:none;cursor:grabbing}.book-page.turn-next{animation:pageNext .5s cubic-bezier(.22,.7,.25,1)}.book-page.turn-previous{animation:pagePrevious .5s cubic-bezier(.22,.7,.25,1)}
        @keyframes pageNext{0%{transform:rotateY(0) translateX(0);opacity:1}45%{transform:rotateY(-10deg) translateX(-20px);opacity:.72}100%{transform:rotateY(0) translateX(0);opacity:1}}
        @keyframes pagePrevious{0%{transform:rotateY(0) translateX(0);opacity:1}45%{transform:rotateY(10deg) translateX(20px);opacity:.72}100%{transform:rotateY(0) translateX(0);opacity:1}}
        .book-page::before{content:"";position:absolute;top:-1px;right:-1px;width:55px;height:55px;background:linear-gradient(225deg,var(--book-bg) 0 49%,#d8dee9 50%,#f7f4ec 52% 70%,rgba(255,255,255,0) 71%);filter:drop-shadow(-3px 4px 3px rgba(15,23,42,.13));border-top-right-radius:15px;pointer-events:none;transition:width .24s ease,height .24s ease}.book-page:hover::before{width:66px;height:66px}
        .book-page::after{content:"";position:absolute;left:13px;top:22px;bottom:22px;width:1px;background:linear-gradient(transparent,#e5e0d7 9%,#e5e0d7 91%,transparent);pointer-events:none}
        .page-kicker{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:13px;color:#65748a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.09em}.page-audience{border:1px solid #d9e0ea;background:#f8fafc;border-radius:999px;padding:4px 8px;text-transform:none;letter-spacing:0;color:#637087;font-weight:600}
        .book-page h1{font-size:clamp(31px,4.2vw,50px);line-height:1.08;letter-spacing:-.035em;margin:0;color:#111827;font-weight:720;max-width:830px}.page-summary{font-size:16px;line-height:1.65;color:#5c687a;margin:17px 0 33px;max-width:800px;padding-bottom:26px;border-bottom:1px solid #e4e0d9}
        .book-blocks{max-width:860px}.book-blocks h2{font-size:23px;line-height:1.25;letter-spacing:-.018em;margin:34px 0 12px;color:#172033;font-weight:690}.book-blocks h3{font-size:17px;margin:25px 0 9px;font-weight:680}.book-blocks p{font-size:15px;line-height:1.78;color:#3d4859;margin:0 0 15px}.book-blocks ul,.book-blocks ol{margin:8px 0 20px;padding-left:24px;color:#3d4859}.book-blocks li{font-size:14.7px;line-height:1.68;margin:7px 0;padding-left:3px}.book-blocks li::marker{color:#2764df;font-weight:700}
        .book-table-wrap{overflow:auto;margin:18px 0 25px;border:1px solid #dfe3ea;border-radius:10px}.book-table{width:100%;border-collapse:collapse;min-width:540px;background:#fff}.book-table th{background:#f4f7fb;color:#344054;font-size:11px;text-transform:uppercase;letter-spacing:.055em;text-align:left;padding:11px 13px;border-bottom:1px solid #dfe3ea}.book-table td{font-size:13px;color:#465266;padding:11px 13px;border-bottom:1px solid #e8ebf0;vertical-align:top;line-height:1.5}.book-table tr:last-child td{border-bottom:0}
        .book-callout{display:grid;grid-template-columns:25px minmax(0,1fr);gap:10px;border:1px solid #cbdcfb;background:#f4f8ff;border-radius:11px;padding:14px 15px;margin:21px 0}.book-callout.success{border-color:#bfe8d0;background:#f1fbf5}.book-callout.warning{border-color:#f2d198;background:#fff9ec}.book-callout svg{margin-top:1px;color:#2764df}.book-callout.success svg{color:#17834b}.book-callout.warning svg{color:#b46a09}.book-callout strong{display:block;font-size:13px;margin-bottom:3px}.book-callout p{font-size:13.2px;line-height:1.55;margin:0;color:#536075}
        .book-code{margin:18px 0 24px;border-radius:11px;overflow:hidden;background:#152034;color:#dce8ff;border:1px solid #263651}.book-code-title{padding:9px 13px;background:#1d2a42;border-bottom:1px solid #30415f;color:#aebed7;font-size:11px;font-weight:650}.book-code pre{margin:0;padding:15px;overflow:auto;font:12.5px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}
        .page-edge{position:absolute;z-index:3;top:80px;bottom:80px;width:44px;border:0;background:transparent;opacity:0;cursor:pointer}.page-edge:hover{opacity:1}.page-edge.previous{left:16px}.page-edge.next{right:16px}.page-edge span{width:30px;height:42px;display:grid;place-items:center;border:1px solid #d7dee8;background:rgba(255,255,255,.9);border-radius:9px;color:#5f6e83;box-shadow:0 6px 18px rgba(15,23,42,.08)}
        .book-navigation{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:14px}.book-nav-button{display:flex;align-items:center;gap:10px;min-height:52px;border:1px solid rgba(148,163,184,.45);background:rgba(255,255,255,.82);border-radius:11px;padding:8px 12px;color:#344054;text-decoration:none;font-family:inherit;cursor:pointer}.book-nav-button:hover{background:#fff;border-color:#a9b6c8}.book-nav-button.next{justify-self:end;text-align:right}.book-nav-button:disabled{opacity:.4;cursor:not-allowed}.book-nav-button span{display:block;font-size:10px;color:#7b8798;margin-bottom:2px}.book-nav-button strong{display:block;font-size:12.5px;font-weight:650}.book-page-number{font-size:11.5px;color:#6f7c8f;white-space:nowrap}
        .contents-overlay{display:none}.mobile-contents{display:none}
        @media(max-width:900px){.book-layout{grid-template-columns:1fr;width:min(100% - 24px,980px);margin-top:14px}.book-contents{display:none}.mobile-contents{display:inline-flex!important}.book-page{min-height:720px;padding:44px clamp(25px,7vw,58px) 38px}.contents-overlay{display:block;position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);z-index:60;opacity:0;pointer-events:none;transition:opacity .2s}.contents-overlay.open{opacity:1;pointer-events:auto}.contents-drawer{position:absolute;left:0;top:0;bottom:0;width:min(86vw,340px);background:#fff;transform:translateX(-100%);transition:transform .25s ease;display:flex;flex-direction:column}.contents-overlay.open .contents-drawer{transform:translateX(0)}.contents-drawer-head{height:61px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid var(--book-line)}.contents-drawer-head button{border:0;background:transparent;padding:7px;color:#475569}.contents-drawer .contents-list{flex:1}.contents-drawer .contents-head{border-bottom:1px solid var(--book-line)}}
        @media(max-width:600px){.book-topbar{height:58px;padding:0 12px}.book-brand small{display:none}.book-top-actions .home-label{display:none}.book-top-actions a,.book-top-actions button{height:34px;padding:0 9px}.book-layout{width:100%;margin-top:0}.book-progress{padding:9px 13px;margin:0;background:#eef2f7}.book-page{border-radius:0;min-height:calc(100vh - 125px);border-left:0;border-right:0;padding:34px 23px 31px;box-shadow:none}.book-page::after{display:none}.book-page h1{font-size:31px}.page-summary{font-size:14.5px;margin-bottom:25px;padding-bottom:20px}.book-blocks h2{font-size:20px;margin-top:28px}.book-blocks p,.book-blocks li{font-size:14px}.page-edge{display:none}.book-navigation{padding:0 12px;margin:12px 0}.book-nav-button{max-width:42%;min-height:48px}.book-nav-button strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px}.book-nav-button span{display:none}.book-page-number{font-size:10.5px}.page-kicker{padding-right:25px}.page-audience{display:none}}
        @media(prefers-reduced-motion:reduce){.book-page,.book-page.turn-next,.book-page.turn-previous,.contents-drawer,.contents-overlay{animation:none!important;transition:none!important}.book-page{transform:none!important}}
      `}</style>

      <header className="book-topbar">
        <Link href="/" className="book-brand">
          <img src="/logo.png" alt="AROFi" />
          <span>AROFi Handbook<small>Product & operations documentation</small></span>
        </Link>
        <div className="book-top-actions">
          <button type="button" className="mobile-contents" onClick={() => setContentsOpen(true)}><Menu size={15} /> Contents</button>
          <Link href="/"><Home size={14} /><span className="home-label">Home</span></Link>
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
            <span className="book-progress-track"><span style={{ width: `${progress}%` }} /></span>
            <span>{pageIndex + 1} / {arofiBook.length}</span>
          </div>

          <div className="book-page-wrap">
            <article
              className={`book-page ${dragStart.current !== null ? 'dragging' : ''} ${direction === 'next' ? 'turn-next' : direction === 'previous' ? 'turn-previous' : ''}`}
              style={{ '--drag-x': dragX } as React.CSSProperties}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return
                event.currentTarget.setPointerCapture(event.pointerId)
                beginDrag(event.clientX)
              }}
              onPointerMove={(event) => updateDrag(event.clientX)}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              <button type="button" className="page-edge previous" onClick={previousPage} disabled={pageIndex === 0} aria-label="Previous page"><span><ChevronLeft size={18} /></span></button>
              <button type="button" className="page-edge next" onClick={nextPage} disabled={pageIndex === arofiBook.length - 1} aria-label="Next page"><span><ChevronRight size={18} /></span></button>

              <div className="page-kicker"><span>{page.chapter}</span><span className="page-audience">{page.audience}</span></div>
              <h1>{page.title}</h1>
              <p className="page-summary">{page.summary}</p>
              <div className="book-blocks">{page.blocks.map((block, index) => <RenderBlock block={block} key={`${page.slug}-${index}`} />)}</div>
            </article>
          </div>

          <nav className="book-navigation" aria-label="Page navigation">
            <button type="button" className="book-nav-button previous" onClick={previousPage} disabled={pageIndex === 0}>
              <ArrowLeft size={16} />
              <span><span>Previous</span><strong>{arofiBook[pageIndex - 1]?.title ?? 'Beginning'}</strong></span>
            </button>
            <span className="book-page-number">Drag left for next · right for previous</span>
            <button type="button" className="book-nav-button next" onClick={nextPage} disabled={pageIndex === arofiBook.length - 1}>
              <span><span>Next</span><strong>{arofiBook[pageIndex + 1]?.title ?? 'End'}</strong></span>
              <ArrowRight size={16} />
            </button>
          </nav>
        </section>
      </div>

      <div className={`contents-overlay ${contentsOpen ? 'open' : ''}`} onClick={() => setContentsOpen(false)}>
        <aside className="contents-drawer" onClick={(event) => event.stopPropagation()}>
          <div className="contents-drawer-head"><strong>Contents</strong><button type="button" onClick={() => setContentsOpen(false)} aria-label="Close contents"><X size={19} /></button></div>
          <ContentsHeader query={query} setQuery={setQuery} />
          <ContentsList pages={filteredPages} pageIndex={pageIndex} openPage={openPage} />
        </aside>
      </div>
    </main>
  )
}

function ContentsHeader({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return (
    <div className="contents-head">
      <div className="contents-title"><span><BookOpen size={14} style={{ marginRight: 7, verticalAlign: -2 }} />Contents</span><span className="contents-count">{arofiBook.length} chapters</span></div>
      <div className="contents-search">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search handbook" aria-label="Search handbook" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}
      </div>
    </div>
  )
}

function ContentsList({ pages, pageIndex, openPage }: { pages: Array<{ item: (typeof arofiBook)[number]; index: number }>; pageIndex: number; openPage: (index: number) => void }) {
  return (
    <div className="contents-list">
      {pages.length === 0 && <div className="contents-empty">No chapter matches this search.</div>}
      {pages.map(({ item, index }) => (
        <button type="button" className={`contents-item ${index === pageIndex ? 'active' : ''}`} key={item.slug} onClick={() => openPage(index)}>
          <span className="contents-number">{String(index + 1).padStart(2, '0')}</span>
          <span className="contents-copy"><strong>{item.title}</strong><span>{item.audience}</span></span>
        </button>
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
  if (block.type === 'table') {
    return (
      <div className="book-table-wrap"><table className="book-table"><thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>
    )
  }
  if (block.type === 'code') return <div className="book-code">{block.title && <div className="book-code-title">{block.title}</div>}<pre>{block.lines.join('\n')}</pre></div>
  const Icon = block.tone === 'success' ? CheckCircle2 : block.tone === 'warning' ? CircleAlert : Info
  return <aside className={`book-callout ${block.tone}`}><Icon size={18} /><div><strong>{block.title}</strong><p>{block.text}</p></div></aside>
}
