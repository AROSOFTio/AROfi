import type { MetadataRoute } from 'next'
import { fetchPublicApi } from '@/lib/api'
import { docs } from './docs/[slug]/page'

const SITE_URL = 'https://arofi.net'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/docs`, changeFrequency: 'weekly', priority: 0.6 },
    ...Object.keys(docs).map((slug) => ({
      url: `${SITE_URL}/docs/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ]

  const posts = await fetchPublicApi<Array<{ slug: string; updatedAt: string }>>('/blog/slugs', 300)

  const postEntries: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${SITE_URL}/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticEntries, ...postEntries]
}
