import Link from 'next/link'
import type { Metadata } from 'next'
import { BookOpen, ArrowLeft, Calendar, Eye } from 'lucide-react'
import { fetchPublicApi } from '@/lib/api'
import type { BlogPostListResponse } from '@/lib/admin-types'

const SITE_URL = 'https://arofi.net'
const PAGE_SIZE = 20

export const revalidate = 60

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const { page } = await searchParams
  const pageNumber = Number.parseInt(page ?? '1', 10) || 1
  const canonical = pageNumber > 1 ? `${SITE_URL}/blog?page=${pageNumber}` : `${SITE_URL}/blog`

  return {
    title: 'Blog',
    description:
      'WiFi hotspot billing guides, MikroTik tutorials, mobile money setup, and tips for running a profitable internet business in Uganda — from the AROFi team.',
    alternates: { canonical },
  }
}

function coverUrl(coverImageId: string | null) {
  return coverImageId ? `${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/blog/images/${coverImageId}` : null
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page } = await searchParams
  const pageNumber = Number.parseInt(page ?? '1', 10) || 1

  const data = await fetchPublicApi<BlogPostListResponse>(
    `/blog/posts?page=${pageNumber}&pageSize=${PAGE_SIZE}`,
    60,
  )
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const hasNextPage = pageNumber * PAGE_SIZE < total
  const hasPrevPage = pageNumber > 1

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to AROFi
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <BookOpen className="w-6 h-6 text-blue-600" />
          <h1 className="text-3xl font-extrabold tracking-tight">AROFi Blog</h1>
        </div>
        <p className="text-slate-500 max-w-2xl mb-12">
          Guides on WiFi hotspot billing, MikroTik setup, mobile money integration, and growing your internet business in Uganda.
        </p>

        {items.length === 0 && <p className="text-slate-400">No articles published yet — check back soon.</p>}

        <div className="grid gap-8 sm:grid-cols-2">
          {items.map((post) => {
            const cover = coverUrl(post.coverImageId)
            return (
              <Link
                key={post.id}
                href={`/${post.slug}`}
                className="group block rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-blue-200 transition"
              >
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={post.title} className="w-full h-44 object-cover" loading="lazy" />
                )}
                <div className="p-5">
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition line-clamp-2">
                    {post.title}
                  </h2>
                  {post.excerpt && <p className="text-sm text-slate-500 mt-2 line-clamp-3">{post.excerpt}</p>}
                  <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
                    {post.publishedAt && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(post.publishedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {post.viewCount}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {(hasPrevPage || hasNextPage) && (
          <div className="flex items-center justify-between mt-12">
            {hasPrevPage ? (
              <Link href={`/blog?page=${pageNumber - 1}`} className="text-sm font-semibold text-blue-600 hover:underline">
                ← Newer posts
              </Link>
            ) : <span />}
            {hasNextPage && (
              <Link href={`/blog?page=${pageNumber + 1}`} className="text-sm font-semibold text-blue-600 hover:underline">
                Older posts →
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
