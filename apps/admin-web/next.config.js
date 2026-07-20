/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  // Force a single build worker. Next's default (cpu-count - 1) spawns
  // multiple webpack/SWC worker processes that each carry their own memory
  // budget independent of NODE_OPTIONS, which overruns small (2-4GB) hosts.
  // Next.js 16 moved outputFileTracingExcludes out of experimental
  outputFileTracingExcludes: {
    '*': ['**/node_modules/**'],
  },
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: true,
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
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
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
        ],
      },
    ]
  },
}
module.exports = nextConfig
