import type { MetadataRoute } from 'next'
import { fetchPublicApi } from '@/lib/api'

const SITE_URL = 'https://arofi.net'

const staticPages: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    changeFrequency: 'weekly',
    priority: 1,
    lastModified: new Date('2026-08-07'),
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
    priority: 0.9,
    lastModified: new Date('2026-08-07'),
  },
  {
    url: `${SITE_URL}/referral-program`,
    changeFrequency: 'weekly',
    priority: 0.85,
    lastModified: new Date('2026-07-26'),
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
    // Keep the static sitemap available when the API is unavailable during build.
  }

  return [...staticPages, ...postEntries]
}
