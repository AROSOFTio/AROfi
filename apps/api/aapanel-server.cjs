'use strict'

const fs = require('fs')
const path = require('path')

process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.PORT = process.env.PORT || '3001'

// main.ts validates required production configuration before Nest's
// ConfigModule is created. Load the aaPanel API .env at the runtime boundary
// so those values exist before the compiled application is required.
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath)
  } else {
    require('dotenv').config({ path: envPath })
  }
}

const candidates = [
  path.join(__dirname, 'dist', 'main.js'),
  path.join(__dirname, 'dist', 'src', 'main.js'),
]

const entry = candidates.find((candidate) => fs.existsSync(candidate))

if (!entry) {
  throw new Error(`AROFI API build entrypoint not found. Checked: ${candidates.join(', ')}`)
}

require(entry)
