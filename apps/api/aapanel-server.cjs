'use strict'

const fs = require('fs')
const path = require('path')

process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.PORT = process.env.PORT || '3001'

const candidates = [
  path.join(__dirname, 'dist', 'main.js'),
  path.join(__dirname, 'dist', 'src', 'main.js'),
]

const entry = candidates.find((candidate) => fs.existsSync(candidate))

if (!entry) {
  throw new Error(`AROFI API build entrypoint not found. Checked: ${candidates.join(', ')}`)
}

require(entry)
