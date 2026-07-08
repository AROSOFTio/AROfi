import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, Eye } from 'lucide-react'
import { fetchPublicApi } from '@/lib/api'
import type { BlogPostDetail } from '@/lib/admin-types'
import { getAppLoginUrl } from '@/lib/admin-session'

const SITE_URL = 'https://arofi.net'
const SITE_NAME = 'AROFi by AROSOFT'

export const revalidate = 60

async function getPost(slug: string) {
  return fetchPublicApi<BlogPostDetail>(`/blog/posts/${encodeURIComponent(slug)}`, 60)
}

export async function generateStaticParams() {
  const slugs = await fetchPublicApi<Array<{ slug: string }>>('/blog/slugs', 300)
  return (slugs ?? []).map((entry) => ({ slug: entry.slug }))
}

function coverUrl(coverImageId: string | null) {
  return coverImageId ? `${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/blog/images/${coverImageId}` : `${SITE_URL}/logo.png`
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

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) {
    notFound()
  }

  const canonical = `${SITE_URL}/${post.slug}`
  const image = coverUrl(post.coverImageId)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription || post.excerpt || undefined,
    image: [image],
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Organization',
      name: 'AROSOFT Innovations Ltd',
      url: 'https://arosoftlabs.com',
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
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition mb-8">
          <ArrowLeft className="w-4 h-4" /> All articles
        </Link>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.map((tag) => (
              <span key={tag} className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}

        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">{post.title}</h1>

        <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
          {post.publishedAt && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(post.publishedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Eye className="w-4 h-4" />
            {post.viewCount} views
          </span>
        </div>

        {post.coverImageId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={post.title} className="w-full rounded-2xl mt-8 object-cover max-h-96" />
        )}

        <article
          className="blog-post-content mt-10 max-w-none"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </div>
    </main>
  )
}
