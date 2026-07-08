import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Calendar, Eye, PenLine, RefreshCw } from 'lucide-react'
import { fetchPublicApi } from '@/lib/api'
import type { BlogPostDetail, BlogPostListResponse, BlogPostSummary } from '@/lib/admin-types'
import { getAppLoginUrl } from '@/lib/admin-session'
import SiteFooter from '@/components/SiteFooter'

const SITE_URL = 'https://arofi.net'
const SITE_NAME = 'AROFi by AROSOFT'

export const revalidate = 60

async function getPost(slug: string) {
  return fetchPublicApi<BlogPostDetail & { authorName?: string | null }>(`/blog/posts/${encodeURIComponent(slug)}`, 60)
}

export async function generateStaticParams() {
  const slugs = await fetchPublicApi<Array<{ slug: string }>>('/blog/slugs', 300)
  return (slugs ?? []).map((entry) => ({ slug: entry.slug }))
}

function coverUrl(coverImageId: string | null) {
  return coverImageId ? `${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/blog/images/${coverImageId}` : `${SITE_URL}/logo.png`
}

function formatDay(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
}

// Split the sanitized article HTML after the Nth closing paragraph so the
// inline "You might also like" block can sit between the two halves without
// ever landing inside a tag.
function splitAfterParagraph(html: string, paragraphCount: number): [string, string] {
  let index = -1
  for (let found = 0; found < paragraphCount; found++) {
    const next = html.indexOf('</p>', index + 1)
    if (next === -1) return [html, '']
    index = next
  }
  const cut = index + '</p>'.length
  // Only split if there's meaningful content left after the cut.
  return html.length - cut > 200 ? [html.slice(0, cut), html.slice(cut)] : [html, '']
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) {
    return {}
  }

  const title = post.metaTitle || post.title
  const description = post.metaDescription || post.excerpt || undefined
  const image = coverUrl(post.coverImageId)
  const canonical = `${SITE_URL}/${post.slug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'article',
      url: canonical,
      siteName: SITE_NAME,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      tags: post.tags,
      images: [{ url: image }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

function RelatedCard({ post }: { post: BlogPostSummary }) {
  const cover = post.coverImageId ? coverUrl(post.coverImageId) : null
  return (
    <Link href={`/${post.slug}`} className="blog-related-card">
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt={post.title} loading="lazy" />
      )}
      <div className="blog-related-card-body">
        <h3>{post.title}</h3>
        {post.excerpt && <p>{post.excerpt}</p>}
      </div>
    </Link>
  )
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [post, related, recent] = await Promise.all([
    getPost(slug),
    fetchPublicApi<BlogPostSummary[]>(`/blog/posts/${encodeURIComponent(slug)}/related`, 300),
    fetchPublicApi<BlogPostListResponse>('/blog/posts?page=1&pageSize=6', 120),
  ])
  if (!post) {
    notFound()
  }

  const canonical = `${SITE_URL}/${post.slug}`
  const image = coverUrl(post.coverImageId)
  const relatedPosts = (related ?? []).slice(0, 4)
  const inlineRelated = relatedPosts.slice(0, 3)
  const recentPosts = (recent?.items ?? []).filter((item) => item.slug !== post.slug).slice(0, 5)
  const topics = Array.from(new Set((recent?.items ?? []).flatMap((item) => item.tags))).slice(0, 8)
  const primaryTag = post.tags[0] ?? null
  const published = formatDay(post.publishedAt ?? post.createdAt)
  const updated = formatDay(post.updatedAt)
  const showUpdated = updated && published !== updated
  const [contentTop, contentRest] = splitAfterParagraph(post.contentHtml, 3)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription || post.excerpt || undefined,
    image: [image],
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt,
    author: {
      '@type': post.authorName ? 'Person' : 'Organization',
      name: post.authorName || 'AROSOFT Innovations Ltd',
    },
    publisher: {
      '@type': 'Organization',
      name: 'AROSOFT Innovations Ltd',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="home-nav" style={{ padding: '24px 24px 0' }}>
        <Link href="/" className="home-brand">
          <img src="/logo.png" alt="AROFi" />
          <span className="home-brand-text" aria-hidden="true">AROFi</span>
        </Link>
        <div className="home-nav-links">
          <Link href="/#features">Features</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/#contact">Contact</Link>
        </div>
        <div className="home-actions">
          <Link href="/docs" className="btn btn-ghost">Docs</Link>
          <a href={getAppLoginUrl()} className="btn btn-ghost">Sign In</a>
          <Link href="/?register=1" className="btn btn-primary">Register Free</Link>
        </div>
      </nav>

      <div className="blog-article-shell">
        <article className="blog-article">
          <Link href="/blog" className="blog-back-link">
            <ArrowLeft size={15} /> All articles
          </Link>

          <h1 className="blog-article-title">{post.title}</h1>
          {post.excerpt && <p className="blog-article-excerpt">{post.excerpt}</p>}

          {post.coverImageId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={post.title} className="blog-article-cover" />
          )}

          <div className="blog-article-meta">
            <span><PenLine size={14} /> {post.authorName || 'AROFi Team'}</span>
            {published && <span><Calendar size={14} /> Published {published}</span>}
            {showUpdated && <span><RefreshCw size={14} /> Updated {updated}</span>}
            {primaryTag && <Link href={`/blog?tag=${encodeURIComponent(primaryTag)}`} className="blog-meta-tag">{primaryTag}</Link>}
            <span><Eye size={14} /> {post.viewCount} views</span>
          </div>

          <div className="blog-post-content" dangerouslySetInnerHTML={{ __html: contentTop }} />

          {contentRest && inlineRelated.length > 0 && (
            <aside className="blog-inline-related" aria-label="Related reading">
              <h2>You might also like</h2>
              <ul>
                {inlineRelated.map((item) => (
                  <li key={item.id}>
                    <Link href={`/${item.slug}`}>{item.title} <ArrowRight size={13} /></Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          {contentRest && <div className="blog-post-content" dangerouslySetInnerHTML={{ __html: contentRest }} />}

          {post.tags.length > 0 && (
            <div className="blog-article-tags">
              <span>Tags:</span>
              {post.tags.map((tag) => (
                <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag)}`} className="blog-tag-chip">{tag}</Link>
              ))}
            </div>
          )}

          {relatedPosts.length > 0 && (
            <section className="blog-related-section" aria-label="Related articles">
              <h2>Related Articles</h2>
              <div className="blog-related-grid">
                {relatedPosts.map((item) => (
                  <RelatedCard key={item.id} post={item} />
                ))}
              </div>
            </section>
          )}
        </article>

        <aside className="blog-sidebar">
          <div className="blog-sidebar-card blog-cta-card">
            <img src="/logo.png" alt="" aria-hidden="true" />
            <h3>Run WiFi the professional way</h3>
            <p>Manage MikroTik hotspots, vouchers, mobile money payments and reports with AROFi — built for authorised and compliant operators.</p>
            <Link href="/" className="btn btn-primary btn-block">Visit AROFi.net</Link>
          </div>

          {recentPosts.length > 0 && (
            <div className="blog-sidebar-card">
              <h3>Recent Articles</h3>
              <ul className="blog-sidebar-list">
                {recentPosts.map((item) => (
                  <li key={item.id}>
                    <Link href={`/${item.slug}`}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {topics.length > 0 && (
            <div className="blog-sidebar-card">
              <h3>Topics</h3>
              <div className="blog-sidebar-topics">
                {topics.map((tag) => (
                  <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag)}`} className="blog-tag-chip">{tag}</Link>
                ))}
              </div>
            </div>
          )}

          <div className="blog-sidebar-card">
            <h3>Important Links</h3>
            <ul className="blog-sidebar-list">
              <li><Link href="/docs">AROFi Documentation</Link></li>
              <li><Link href="/#pricing">Plans &amp; Pricing</Link></li>
              <li><a href="https://www.ucc.co.ug" target="_blank" rel="noreferrer">UCC — Uganda Communications Commission</a></li>
              <li><Link href="/#contact">Contact Support</Link></li>
            </ul>
          </div>
        </aside>
      </div>

      <SiteFooter />
    </main>
  )
}
