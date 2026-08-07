/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  // Keep browser and server source maps disabled in production. Generating them
  // significantly increases peak memory during webpack compilation on the VPS.
  productionBrowserSourceMaps: false,
  // Force a single build worker. Next's default (cpu-count - 1) spawns
  // multiple webpack/SWC worker processes that each carry their own memory
  // budget independent of NODE_OPTIONS, which overruns small (2-4GB) hosts.
  // Next.js 16 moved outputFileTracingExcludes out of experimental.
  outputFileTracingExcludes: {
    '*': ['**/node_modules/**'],
  },
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: true,
    // Official Next.js low-memory mode reduces webpack's maximum resident
    // memory at the cost of slightly longer compilation time.
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
    serverSourceMaps: false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Allow all HTTPS images so OG previews, social bots, and external
              // CDN images render correctly. data: and blob: needed for canvas/PWA.
              "img-src 'self' https: data: blob:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https:",
              "frame-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          {
            // SAMEORIGIN (matching the nginx layer) instead of DENY: the blog
            // admin's responsive preview iframes the live article page from
            // the same origin. Cross-origin framing stays blocked.
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        // Ensure crawlers always receive a fresh robots.txt and sitemap
        source: '/(robots\\.txt|sitemap\\.xml)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' },
        ],
      },
    ]
  },
}
module.exports = nextConfig
