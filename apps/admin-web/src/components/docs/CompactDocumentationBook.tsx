'use client'

import { useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Info,
  Search,
  X,
} from 'lucide-react'
import { arofiBook, type BookBlock } from '@/content/arofi-book'

type IndexedPage = { item: (typeof arofiBook)[number]; index: number }

const URL_LINE = /^https?:\/\/[^\s]+$/i

export default function CompactDocumentationBook() {
  const [pageIndex, setPageIndex] = useState(0)
  const [query, setQuery] = useState('')
  const pageTopRef = useRef<HTMLDivElement | null>(null)

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

  function openPage(index: number) {
    if (index < 0 || index >= arofiBook.length || index === pageIndex) return
    setPageIndex(index)
    window.requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <section className="compact-doc-book" aria-label="AROFi handbook">
      <style jsx global>{`
        .compact-doc-book {
          --compact-book-ink: #172033;
          --compact-book-muted: #667085;
          --compact-book-line: #d7deea;
          --compact-book-paper: #fffdf8;
          --compact-book-blue: var(--arofi-accent, #2563eb);
          display: grid;
          grid-template-columns: minmax(210px, 248px) minmax(0, 1fr);
          gap: 16px;
          align-items: start;
          color: var(--compact-book-ink);
          font-family: "Segoe UI", SegoeUI, Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        .compact-book-contents {
          position: sticky;
          top: 76px;
          max-height: calc(100vh - 100px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, .38);
          border-radius: 14px;
          background: color-mix(in srgb, var(--surface, #fff) 94%, transparent);
          box-shadow: 0 12px 30px rgba(15, 23, 42, .06);
        }
        .compact-book-contents-head { padding: 13px; border-bottom: 1px solid var(--compact-book-line); }
        .compact-book-contents-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; font-size: 12px; font-weight: 800; }
        .compact-book-contents-title span { display: inline-flex; align-items: center; gap: 6px; }
        .compact-book-contents-title small { color: var(--compact-book-muted); font-size: 9.5px; font-weight: 700; }
        .compact-book-search { position: relative; }
        .compact-book-search > svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: #8290a6; }
        .compact-book-search input { width: 100%; height: 34px; border: 1px solid var(--compact-book-line); border-radius: 8px; background: var(--surface-2, #f8fafc); padding: 0 29px 0 31px; color: var(--text, #172033); outline: none; font: 12px "Segoe UI", sans-serif; }
        .compact-book-search input:focus { border-color: #8db1ff; box-shadow: 0 0 0 3px rgba(37, 99, 235, .09); }
        .compact-book-search button { position: absolute; right: 5px; top: 5px; width: 24px; height: 24px; border: 0; background: transparent; color: #7a879a; cursor: pointer; }
        .compact-book-list { overflow: auto; padding: 6px; }
        .compact-book-item { width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; align-items: start; border: 0; border-radius: 9px; background: transparent; padding: 7px; color: var(--text-2, #344054); text-align: left; cursor: pointer; font-family: inherit; }
        .compact-book-item:hover { background: var(--surface-2, #f2f5f9); }
        .compact-book-item.active { background: color-mix(in srgb, var(--compact-book-blue) 10%, #fff); color: var(--compact-book-blue); }
        .compact-book-number { width: 27px; height: 27px; display: grid; place-items: center; border-radius: 7px; background: var(--surface-2, #edf1f6); color: #66758a; font-size: 9.5px; font-weight: 850; }
        .compact-book-item.active .compact-book-number { background: color-mix(in srgb, var(--compact-book-blue) 16%, #fff); color: var(--compact-book-blue); }
        .compact-book-copy strong { display: block; font-size: 11.6px; line-height: 1.27; font-weight: 720; }
        .compact-book-copy small { display: block; margin-top: 2px; color: #8290a3; font-size: 8.9px; line-height: 1.25; font-weight: 650; }
        .compact-book-empty { padding: 24px 10px; text-align: center; color: var(--compact-book-muted); font-size: 11px; }
        .compact-book-stage { min-width: 0; scroll-margin-top: 82px; }
        .compact-book-progress { display: grid; grid-template-columns: auto minmax(90px, 1fr) auto; gap: 10px; align-items: center; margin: 0 3px 9px; color: var(--text-3, #667085); font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
        .compact-book-progress-track { height: 3px; overflow: hidden; border-radius: 999px; background: #d6deea; }
        .compact-book-progress-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--compact-book-blue), #60a5fa); transition: width .2s ease; }
        .compact-book-desk { padding: 8px 11px 14px; border-radius: 18px; background: linear-gradient(145deg, rgba(255, 255, 255, .38), rgba(105, 119, 141, .07)); }
        .compact-book-page { position: relative; min-height: 570px; overflow: hidden; border: 1px solid #d8d5cc; border-radius: 4px 13px 13px 4px; background: linear-gradient(90deg, #f6f1e8 0, var(--compact-book-paper) 2.3%, var(--compact-book-paper) 97%, #f2eee5 100%); box-shadow: 0 16px 36px rgba(15, 23, 42, .12), inset 13px 0 18px rgba(88, 75, 53, .03); padding: 34px 42px 64px; }
        .compact-book-page::before { content: ""; position: absolute; left: 16px; top: 0; bottom: 0; width: 1px; background: rgba(161, 143, 111, .17); box-shadow: 4px 0 10px rgba(74, 61, 41, .05); }
        .compact-book-page::after { content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 6px; background: repeating-linear-gradient(90deg, #e6e0d5 0 1px, var(--compact-book-paper) 1px 2px); opacity: .7; }
        .compact-page-fold { position: absolute; right: 0; top: 0; width: 48px; height: 48px; background: linear-gradient(225deg, #e8edf5 0 48%, #d0d7e3 49% 51%, #f6f1e8 52% 100%); clip-path: polygon(0 0, 100% 100%, 100% 0); filter: drop-shadow(-4px 5px 4px rgba(15, 23, 42, .1)); pointer-events: none; }
        .compact-page-header { padding: 0 26px 18px 0; margin-bottom: 20px; border-bottom: 1px solid #ddd8cf; }
        .compact-page-kicker { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--compact-book-blue); font-size: 9.5px; font-weight: 850; text-transform: uppercase; letter-spacing: .11em; }
        .compact-page-audience { color: #6f7b8e; letter-spacing: .04em; }
        .compact-book-page h2.compact-book-title { max-width: 760px; margin: 12px 0 8px; color: #172033; font-size: clamp(24px, 3vw, 36px); line-height: 1.08; letter-spacing: -.032em; font-weight: 780; }
        .compact-page-summary { max-width: 780px; margin: 0; color: #607087; font-size: 14px; line-height: 1.5; }
        .compact-book-blocks { max-width: 850px; margin: 0 auto; }
        .compact-book-blocks > p { margin: 0 0 13px; color: #344054; font-size: 13px; line-height: 1.65; }
        .compact-book-blocks h2 { margin: 24px 0 9px; color: #172033; font-size: 19px; line-height: 1.24; letter-spacing: -.015em; }
        .compact-book-blocks h3 { margin: 19px 0 7px; color: #22304a; font-size: 15px; }
        .compact-book-blocks ul, .compact-book-blocks ol { margin: 0 0 16px; padding-left: 21px; color: #344054; }
        .compact-book-blocks li { margin: 5px 0; padding-left: 3px; font-size: 12.8px; line-height: 1.55; }
        .compact-book-blocks li::marker { color: var(--compact-book-blue); font-weight: 800; }
        .compact-book-figure { margin: 0 0 20px; overflow: hidden; border: 1px solid #d8dfeb; border-radius: 12px; background: #fff; box-shadow: 0 8px 20px rgba(15, 23, 42, .06); }
        .compact-book-figure img { display: block; width: 100%; height: auto; max-height: 360px; object-fit: contain; background: #eef3f9; }
        .compact-book-figure figcaption { padding: 9px 12px; border-top: 1px solid #e3e8f0; background: #fbfcfe; color: #667085; font-size: 10.5px; line-height: 1.4; }
        .compact-book-callout { display: grid; grid-template-columns: 19px minmax(0, 1fr); gap: 9px; margin: 17px 0; padding: 12px 13px; border: 1px solid #cfe0ff; border-radius: 10px; background: #f2f7ff; color: #24508f; }
        .compact-book-callout.success { border-color: #bce8cc; background: #f0fbf4; color: #087443; }
        .compact-book-callout.warning { border-color: #f4d7a3; background: #fff9ed; color: #9a5a08; }
        .compact-book-callout svg { margin-top: 1px; }
        .compact-book-callout strong { display: block; margin-bottom: 3px; font-size: 12px; }
        .compact-book-callout p { margin: 0; color: inherit; font-size: 11.5px; line-height: 1.5; }
        .compact-book-table-wrap { overflow: auto; margin: 15px 0 19px; border: 1px solid #d8dfeb; border-radius: 10px; background: #fff; }
        .compact-book-table { width: 100%; min-width: 500px; border-collapse: collapse; }
        .compact-book-table th, .compact-book-table td { padding: 9px 10px; border-bottom: 1px solid #e5e9f0; text-align: left; vertical-align: top; font-size: 11px; line-height: 1.4; }
        .compact-book-table th { background: #f3f6fa; color: #344054; font-weight: 780; }
        .compact-book-table td { color: #475467; }
        .compact-book-table tr:last-child td { border-bottom: 0; }
        .compact-book-code { margin: 15px 0 19px; overflow: hidden; border-radius: 10px; background: #111827; color: #e5eefb; box-shadow: 0 8px 18px rgba(15, 23, 42, .1); }
        .compact-book-code-title { padding: 8px 11px; background: #1f2937; color: #a8c6ff; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
        .compact-book-code pre { margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
        .compact-book-code a { display: inline-flex; align-items: center; gap: 5px; color: #93c5fd; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
        .compact-paper-footer { position: absolute; left: 42px; right: 42px; bottom: 20px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding-top: 9px; border-top: 1px solid #ddd8cf; color: #8b877f; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; }
        .compact-paper-footer strong { width: 29px; height: 29px; display: grid; place-items: center; border: 1px solid #cfc8bb; border-radius: 50%; background: var(--compact-book-paper); color: #4d5665; font-size: 10px; }
        .compact-paper-footer span:last-child { overflow: hidden; white-space: nowrap; text-align: right; text-overflow: ellipsis; }
        .compact-book-navigation { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 9px; margin-top: 10px; }
        .compact-book-nav { min-width: 0; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(148, 163, 184, .46); border-radius: 10px; background: var(--surface, rgba(255,255,255,.9)); padding: 8px 10px; color: var(--text-2, #344054); cursor: pointer; text-align: left; font-family: inherit; }
        .compact-book-nav.next { justify-content: flex-end; text-align: right; }
        .compact-book-nav:disabled { opacity: .4; cursor: not-allowed; }
        .compact-book-nav span { min-width: 0; }
        .compact-book-nav small { display: block; margin-bottom: 2px; color: #8290a3; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; }
        .compact-book-nav strong { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 10px; }
        .compact-book-page-control { min-width: 92px; text-align: center; }
        .compact-book-page-control strong { color: var(--text, #172033); font-size: 18px; }
        .compact-book-page-control span { margin-left: 4px; color: var(--text-3, #667085); font-size: 10px; }
        @media (max-width: 1050px) {
          .compact-doc-book { grid-template-columns: 205px minmax(0, 1fr); gap: 12px; }
          .compact-book-page { padding: 30px 32px 60px; }
          .compact-paper-footer { left: 32px; right: 32px; }
        }
        @media (max-width: 820px) {
          .compact-doc-book { grid-template-columns: 1fr; }
          .compact-book-contents { position: static; max-height: 310px; }
          .compact-book-page { min-height: 520px; }
        }
        @media (max-width: 560px) {
          .compact-book-page { padding: 26px 21px 58px; }
          .compact-book-page::before { left: 8px; }
          .compact-book-page h2.compact-book-title { font-size: 24px; }
          .compact-page-summary { font-size: 12.5px; }
          .compact-book-blocks li, .compact-book-blocks > p { font-size: 12px; }
          .compact-paper-footer { left: 21px; right: 21px; grid-template-columns: 1fr; justify-items: center; }
          .compact-paper-footer span { display: none; }
          .compact-book-navigation { grid-template-columns: 1fr 58px 1fr; gap: 6px; }
          .compact-book-nav strong { display: none; }
          .compact-book-page-control { min-width: 0; }
        }
      `}</style>

      <aside className="compact-book-contents" aria-label="Handbook contents">
        <div className="compact-book-contents-head">
          <div className="compact-book-contents-title">
            <span><BookOpen size={13} /> Handbook contents</span>
            <small>{arofiBook.length} pages</small>
          </div>
          <div className="compact-book-search">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search handbook"
              aria-label="Search handbook"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="compact-book-list">
          {filteredPages.length === 0 ? <div className="compact-book-empty">No page matches this search.</div> : null}
          {filteredPages.map(({ item, index }) => (
            <button
              type="button"
              className={`compact-book-item ${index === pageIndex ? 'active' : ''}`}
              key={item.slug}
              aria-current={index === pageIndex ? 'page' : undefined}
              onClick={() => openPage(index)}
            >
              <span className="compact-book-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="compact-book-copy">
                <strong>{item.title}</strong>
                <small>{item.chapter} · {item.audience}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="compact-book-stage" ref={pageTopRef}>
        <div className="compact-book-progress">
          <span>{page.chapter}</span>
          <span className="compact-book-progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
          <span>Page {pageNumber} / {totalPages}</span>
        </div>

        <div className="compact-book-desk">
          <article className="compact-book-page">
            <div className="compact-page-fold" aria-hidden="true" />
            <header className="compact-page-header">
              <div className="compact-page-kicker">
                <span>{page.chapter}</span>
                <span className="compact-page-audience">{page.audience}</span>
              </div>
              <h2 className="compact-book-title">{page.title}</h2>
              <p className="compact-page-summary">{page.summary}</p>
            </header>

            <div className="compact-book-blocks">
              {page.blocks.map((block, index) => (
                <RenderCompactBlock block={block} key={`${page.slug}-${index}`} />
              ))}
            </div>

            <footer className="compact-paper-footer">
              <span>AROFi · AROSOFT Innovations Ltd</span>
              <strong>{pageNumber}</strong>
              <span>{page.title}</span>
            </footer>
          </article>
        </div>

        <nav className="compact-book-navigation" aria-label="Handbook page navigation">
          <button type="button" className="compact-book-nav" onClick={() => openPage(pageIndex - 1)} disabled={pageIndex === 0}>
            <ArrowLeft size={14} />
            <span><small>Previous</small><strong>{arofiBook[pageIndex - 1]?.title ?? 'Beginning'}</strong></span>
          </button>

          <div className="compact-book-page-control">
            <strong>{pageNumber}</strong><span>of {totalPages}</span>
          </div>

          <button type="button" className="compact-book-nav next" onClick={() => openPage(pageIndex + 1)} disabled={pageIndex === arofiBook.length - 1}>
            <span><small>Next</small><strong>{arofiBook[pageIndex + 1]?.title ?? 'End'}</strong></span>
            <ArrowRight size={14} />
          </button>
        </nav>
      </div>
    </section>
  )
}

function blockToSearchText(block: BookBlock) {
  if (block.type === 'image') return `${block.alt} ${block.caption}`
  if ('text' in block) return block.text
  if ('items' in block) return block.items.join(' ')
  if (block.type === 'table') return [...block.headers, ...block.rows.flat()].join(' ')
  return [block.title ?? '', ...block.lines].join(' ')
}

function RenderCompactBlock({ block }: { block: BookBlock }) {
  if (block.type === 'p') return <p>{block.text}</p>
  if (block.type === 'h2') return <h2>{block.text}</h2>
  if (block.type === 'h3') return <h3>{block.text}</h3>
  if (block.type === 'ul') return <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
  if (block.type === 'ol') return <ol>{block.items.map((item) => <li key={item}>{item}</li>)}</ol>

  if (block.type === 'image') {
    return (
      <figure className="compact-book-figure">
        <img src={block.src} alt={block.alt} loading="lazy" />
        <figcaption>{block.caption}</figcaption>
      </figure>
    )
  }

  if (block.type === 'table') {
    return (
      <div className="compact-book-table-wrap">
        <table className="compact-book-table">
          <thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }

  if (block.type === 'code') {
    const linksOnly = block.lines.length > 0 && block.lines.every((line) => URL_LINE.test(line.trim()))
    return (
      <div className="compact-book-code">
        {block.title ? <div className="compact-book-code-title">{block.title}</div> : null}
        <pre>{linksOnly
          ? block.lines.map((line, index) => (
              <span key={line}>
                {index > 0 ? '\n' : null}
                <a href={line.trim()} target="_blank" rel="noreferrer noopener">{line.trim()} <ExternalLink size={11} /></a>
              </span>
            ))
          : block.lines.join('\n')}
        </pre>
      </div>
    )
  }

  const Icon = block.tone === 'success' ? CheckCircle2 : block.tone === 'warning' ? AlertCircle : Info
  return (
    <aside className={`compact-book-callout ${block.tone}`}>
      <Icon size={16} />
      <div><strong>{block.title}</strong><p>{block.text}</p></div>
    </aside>
  )
}
