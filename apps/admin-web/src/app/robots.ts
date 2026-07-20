import type { MetadataRoute } from 'next'

const SITE_URL = 'https://arofi.net'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/admin',
          '/api',
          '/login',
          '/register',
          '/setup',
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
          '/sales-by-tenant',
          '/sales-by-business',
          '/feature-limits',
          '/audit-logs',
          '/sessions',
          '/hotspots',
          '/payments',
          '/reports',
          '/router',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
