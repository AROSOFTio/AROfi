'use strict'

const path = require('path')

const node = '/www/server/nodejs/v20.20.2/bin/node'
const root = path.resolve(__dirname, '..', '..')

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
      script: 'aapanel-server.cjs',
      interpreter: node,
      autorestart: true,
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
        HOSTNAME: '0.0.0.0',
      },
    },
    {
      name: 'arofi_portal',
      cwd: path.join(root, 'apps', 'portal-web'),
      script: 'aapanel-server.cjs',
      interpreter: node,
      autorestart: true,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        PORT: '3003',
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
}
