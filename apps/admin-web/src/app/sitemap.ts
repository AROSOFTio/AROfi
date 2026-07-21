import type { MetadataRoute } from 'next'
import { fetchPublicApi } from '@/lib/api'
import { docs } from './docs/[slug]/page'

const SITE_URL = 'https://arofi.net'

// Static public pages — update `lastmod` when page content changes significantly
const staticPages: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    changeFrequency: 'weekly',
    priority: 1.0,
    lastModified: new Date('2026-07-21'),
  },
  {
    url: `${SITE_URL}/blog`,
    changeFrequency: 'daily',
    priority: 0.9,
    lastModified: new Date(),
  },
  {
    url: `${SITE_URL}/docs`,
    changeFrequency: 'weekly',
    priority: 0.8,
    lastModified: new Date('2026-07-01'),
  },
  {
    url: `${SITE_URL}/privacy`,
    changeFrequency: 'yearly',
    priority: 0.4,
    lastModified: new Date('2026-01-01'),
  },
  {
    url: `${SITE_URL}/terms`,
    changeFrequency: 'yearly',
    priority: 0.4,
    lastModified: new Date('2026-01-01'),
  },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Docs pages — generated from the static docs config
  const docEntries: MetadataRoute.Sitemap = Object.keys(docs).map((slug) => ({
    url: `${SITE_URL}/docs/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
    lastModified: new Date('2026-07-01'),
  }))

  // Blog posts — fetched from the API (gracefully handles failure)
  let postEntries: MetadataRoute.Sitemap = []
  try {
    const posts = await fetchPublicApi<Array<{ slug: string; updatedAt: string }>>(
      '/blog/slugs',
      300,
    )
    postEntries = (posts ?? []).map((post) => ({
      url: `${SITE_URL}/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    }))
  } catch {
    // API unavailable during build — skip dynamic posts, static pages still included
  }

  return [...staticPages, ...docEntries, ...postEntries]
}
