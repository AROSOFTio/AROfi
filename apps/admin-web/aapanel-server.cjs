'use strict'

process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.PORT = process.env.PORT || '3002'
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0'

process.argv = [
  process.execPath,
  'next',
  'start',
  '-p',
  process.env.PORT,
  '-H',
  process.env.HOSTNAME,
]

require('next/dist/bin/next')
