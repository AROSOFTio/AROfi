import type { MetadataRoute } from 'next'
import { fetchPublicApi } from '@/lib/api'
import { docs } from './docs/[slug]/page'

const SITE_URL = 'https://arofi.net'

// Last time the static pages were meaningfully updated.
// Update this date whenever you make content changes to the homepage, privacy, or terms pages.
const STATIC_UPDATED = new Date('2026-07-21').toISOString()

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: STATIC_UPDATED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: now.toISOString(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/docs`,
      lastModified: STATIC_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: STATIC_UPDATED,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: STATIC_UPDATED,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...Object.keys(docs).map((slug) => ({
      url: `${SITE_URL}/docs/${slug}`,
      lastModified: STATIC_UPDATED,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]

  let postEntries: MetadataRoute.Sitemap = []
  try {
    const posts = await fetchPublicApi<Array<{ slug: string; updatedAt: string }>>('/blog/slugs', 300)
    postEntries = (posts ?? []).map((post) => ({
      url: `${SITE_URL}/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }))
  } catch {
    // Non-fatal: sitemap is still valid without blog posts
  }

  return [...staticEntries, ...postEntries]
}
