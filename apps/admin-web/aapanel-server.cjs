'use strict'

const fs = require('fs')
const path = require('path')

process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.PORT = process.env.PORT || '3002'
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0'

const standaloneDir = path.join(__dirname, '.next', 'standalone', 'apps', 'admin-web')
const server = path.join(standaloneDir, 'server.js')

if (!fs.existsSync(server)) {
  throw new Error(`AROFI Admin standalone server not found: ${server}`)
}

process.chdir(standaloneDir)
require(server)
