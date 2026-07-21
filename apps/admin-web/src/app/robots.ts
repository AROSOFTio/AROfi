import type { MetadataRoute } from 'next'

const SITE_URL = 'https://arofi.net'

/**
 * robots.ts — AROFi crawling rules
 *
 * Key decisions:
 * - /portal is disallowed here; the portal Next.js app (apps/portal-web)
 *   owns its own robots and canonical, and we don't want Google to index
 *   the portal redirect/login page alongside the marketing site.
 * - All dashboard/operational paths are private and must not be indexed.
 * - Googlebot and GPTBot get explicit allow/disallow rules for clarity.
 * - Bingbot and other bots get a crawl-delay to reduce server load.
 */
export default function robots(): MetadataRoute.Robots {
  // Paths that should NEVER be indexed (app routes, not content routes)
  const privateDisallow = [
    '/portal',
    '/portal/',
    '/dashboard',
    '/dashboard/',
    '/admin',
    '/api/',
    '/login',
    '/register',
    '/setup',
    '/forgot-email',
    '/forgot-password',
    '/reset-password',
    '/packages',
    '/vouchers',
    '/sales',
    '/transactions',
    '/earnings',
    '/float',
    '/disbursements',
    '/users',
    '/agents',
    '/settings',
    '/support',
    '/tenants',
    '/businesses',
    '/feedback',
    '/sales-by-tenant',
    '/sales-by-business',
    '/feature-limits',
    '/audit-logs',
    '/sessions',
    '/hotspots',
    '/payments',
    '/reports',
    '/router',
    '/payment-return',
  ]

  return {
    rules: [
      // --- Googlebot: full access to public content, images enabled ---
      {
        userAgent: 'Googlebot',
        allow: [
          '/',
          '/blog',
          '/blog/',
          '/docs',
          '/docs/',
          '/privacy',
          '/terms',
          '/sitemap.xml',
          '/*.png',
          '/*.jpg',
          '/*.webp',
          '/*.svg',
          '/_next/static/',
        ],
        disallow: privateDisallow,
      },
      // --- Googlebot-Image: allow all public images ---
      {
        userAgent: 'Googlebot-Image',
        allow: ['/*.png', '/*.jpg', '/*.jpeg', '/*.webp', '/*.svg', '/*.gif', '/api/blog/images/'],
        disallow: [],
      },
      // --- Bingbot: same as Googlebot with crawl-delay ---
      {
        userAgent: 'Bingbot',
        allow: ['/', '/blog', '/docs', '/privacy', '/terms'],
        disallow: privateDisallow,
        crawlDelay: 2,
      },
      // --- AI / LLM crawlers: allow content pages ---
      {
        userAgent: 'GPTBot',
        allow: ['/', '/blog', '/docs', '/privacy', '/terms'],
        disallow: [...privateDisallow, '/api/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: ['/', '/blog', '/docs'],
        disallow: privateDisallow,
      },
      {
        userAgent: 'ClaudeBot',
        allow: ['/', '/blog', '/docs', '/privacy', '/terms'],
        disallow: [...privateDisallow, '/api/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: ['/', '/blog', '/docs', '/privacy', '/terms'],
        disallow: privateDisallow,
      },
      {
        userAgent: 'YouBot',
        allow: ['/', '/blog', '/docs'],
        disallow: privateDisallow,
      },
      {
        userAgent: 'anthropic-ai',
        allow: ['/', '/blog', '/docs'],
        disallow: [...privateDisallow, '/api/'],
      },
      {
        userAgent: 'Google-Extended',
        allow: ['/', '/blog', '/docs', '/privacy', '/terms'],
        disallow: [...privateDisallow, '/api/'],
      },
      {
        userAgent: 'FacebookExternalHit',
        allow: ['/', '/logo.png'],
        disallow: privateDisallow,
      },
      {
        userAgent: 'Twitterbot',
        allow: ['/', '/logo.png'],
        disallow: privateDisallow,
      },
      // --- Unwanted scrapers and bad bots: block everything ---
      { userAgent: 'AhrefsBot', disallow: ['/'] },
      { userAgent: 'SemrushBot', disallow: ['/'] },
      { userAgent: 'DotBot', disallow: ['/'] },
      { userAgent: 'MJ12bot', disallow: ['/'] },
      // --- Default: all other bots get public content ---
      {
        userAgent: '*',
        allow: ['/', '/blog', '/docs', '/privacy', '/terms'],
        disallow: privateDisallow,
        crawlDelay: 5,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
