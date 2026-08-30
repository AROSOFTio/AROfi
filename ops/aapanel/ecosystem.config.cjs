'use strict'

const path = require('path')

const node = '/www/server/nodejs/v20.20.2/bin/node'
const root = path.resolve(__dirname, '..', '..')
const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')

module.exports = {
  apps: [
    {
      name: 'arofi_api',
      cwd: path.join(root, 'apps', 'api'),
      script: 'aapanel-server.cjs',
      interpreter: node,
      autorestart: true,
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
    {
      name: 'arofi_admin',
      cwd: path.join(root, 'apps', 'admin-web'),
      // Run Next from the complete build tree instead of the traced standalone
      // bundle. Next 16 can complete a build while standalone tracing omits
      // route client-reference manifests; serving the full .next tree keeps
      // CSS/static assets and route manifests together and writable by `www`.
      script: nextCli,
      args: 'start -p 3002 -H 0.0.0.0',
      interpreter: node,
      autorestart: true,
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
        HOSTNAME: '0.0.0.0',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
    {
      name: 'arofi_portal',
      cwd: path.join(root, 'apps', 'portal-web'),
      // Keep Portal on the same full-build runtime as Admin so generated
      // _next/static assets are served directly from the build that produced
      // them, rather than from an incomplete standalone trace.
      script: nextCli,
      args: 'start -p 3003 -H 0.0.0.0',
      interpreter: node,
      autorestart: true,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        PORT: '3003',
        HOSTNAME: '0.0.0.0',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
}
