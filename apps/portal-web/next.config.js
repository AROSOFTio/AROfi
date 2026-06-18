/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    basePath: '/portal',
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    compress: true,
    // Force a single build worker. Next's default (cpu-count - 1) spawns
    // multiple webpack/SWC worker processes that each carry their own memory
    // budget independent of NODE_OPTIONS, which overruns small (2-4GB) hosts.
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
    async redirects() {
        return [
            {
                source: '/',
                destination: '/portal',
                permanent: false,
                basePath: false,
            },
        ]
    },
    async headers() {
        return [
            {
                // Next.js static assets are content-hashed — safe to cache for a year
                source: '/_next/static/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            },
            {
                // HTML pages and API routes must never be stale
                source: '/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
                    { key: 'Pragma', value: 'no-cache' },
                    { key: 'Expires', value: '0' },
                ],
            },
        ]
    },
}
module.exports = nextConfig
