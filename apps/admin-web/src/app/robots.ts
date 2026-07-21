import type { MetadataRoute } from 'next'

const SITE_URL = 'https://arofi.net'

/**
 * Private dashboard routes — must NEVER be indexed by any crawler.
 * Update this list whenever new protected routes are added.
 */
const PRIVATE: string[] = [
  '/api/',
  '/login',
  '/register',
  '/setup',
  '/forgot-password',
  '/forgot-email',
  '/reset-password',
  // Operator dashboard routes
  '/dashboard',
  '/admin',
  '/packages',
  '/vouchers',
  '/sales',
  '/sales-by-tenant',
  '/sales-by-business',
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
  '/customers',
  '/billing',
  '/routers',
  '/hotspots',
  '/sessions',
  '/payments',
  '/reports',
  '/router',
  '/audit-logs',
  '/feature-limits',
  '/feedback',
  '/compliance',
  '/settlements',
  // Portal (captive portal web-app — has its own robots)
  '/portal',
  '/payment-return',
]

/**
 * Public pages that every crawler should be able to reach.
 */
const PUBLIC: string[] = [
  '/',
  '/blog',
  '/blog/',
  '/docs',
  '/docs/',
  '/privacy',
  '/terms',
  '/sitemap.xml',
  '/llms.txt',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── Googlebot ────────────────────────────────────────────────
      {
        userAgent: 'Googlebot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      // ── Googlebot-Image: index all public images ──────────────────
      {
        userAgent: 'Googlebot-Image',
        allow: ['/', '/*.png', '/*.jpg', '/*.jpeg', '/*.webp', '/*.svg'],
        disallow: PRIVATE,
      },
      // ── Google AI training crawler ────────────────────────────────
      {
        userAgent: 'Google-Extended',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      // ── Bingbot ───────────────────────────────────────────────────
      {
        userAgent: 'Bingbot',
        allow: PUBLIC,
        disallow: PRIVATE,
        crawlDelay: 2,
      },
      // ── AI / LLM Crawlers ─────────────────────────────────────────
      {
        userAgent: 'GPTBot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'ChatGPT-User',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'ClaudeBot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'Claude-Web',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'anthropic-ai',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'PerplexityBot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'YouBot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'meta-externalagent',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'Applebot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      {
        userAgent: 'Applebot-Extended',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      // ── Social preview bots ───────────────────────────────────────
      {
        userAgent: 'facebookexternalhit',
        allow: ['/', '/logo.png', '/og-image.png'],
        disallow: PRIVATE,
      },
      {
        userAgent: 'Twitterbot',
        allow: ['/', '/logo.png', '/og-image.png'],
        disallow: PRIVATE,
      },
      {
        userAgent: 'LinkedInBot',
        allow: ['/', '/logo.png', '/og-image.png'],
        disallow: PRIVATE,
      },
      {
        userAgent: 'WhatsApp',
        allow: ['/', '/logo.png', '/og-image.png'],
        disallow: PRIVATE,
      },
      {
        userAgent: 'Slackbot',
        allow: ['/', '/logo.png', '/og-image.png'],
        disallow: PRIVATE,
      },
      {
        userAgent: 'DuckDuckBot',
        allow: PUBLIC,
        disallow: PRIVATE,
      },
      // ── Known scrapers / SEO tool bots — block entirely ───────────
      { userAgent: 'AhrefsBot', disallow: ['/'] },
      { userAgent: 'SemrushBot', disallow: ['/'] },
      { userAgent: 'DotBot', disallow: ['/'] },
      { userAgent: 'MJ12bot', disallow: ['/'] },
      { userAgent: 'BLEXBot', disallow: ['/'] },
      { userAgent: 'DataForSeoBot', disallow: ['/'] },
      // ── Catch-all ─────────────────────────────────────────────────
      {
        userAgent: '*',
        allow: PUBLIC,
        disallow: PRIVATE,
        crawlDelay: 5,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
