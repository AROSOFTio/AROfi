'use strict'

const http = require('http')

const port = Number(process.env.PORT || 3999)

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('AROFI aaPanel deployment controller\n')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`AROFI aaPanel deployment controller listening on 127.0.0.1:${port}`)
})
