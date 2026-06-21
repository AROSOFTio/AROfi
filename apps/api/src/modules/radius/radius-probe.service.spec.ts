import { createHash } from 'crypto'
import * as dgram from 'dgram'
import { RadiusProbeService } from './radius-probe.service'

const SECRET = 'test-shared-secret'

// Mirrors RFC 2865 5.2 PAP decryption so the fake server can recover the
// plaintext password the same way real FreeRADIUS would, proving our
// encryption in radius-probe.service.ts round-trips correctly.
function decryptPapPassword(encrypted: Buffer, secret: string, requestAuthenticator: Buffer) {
  const secretBuffer = Buffer.from(secret, 'utf8')
  const decrypted = Buffer.alloc(encrypted.length)
  let previousBlock = requestAuthenticator

  for (let offset = 0; offset < encrypted.length; offset += 16) {
    const hash = createHash('md5').update(Buffer.concat([secretBuffer, previousBlock])).digest()
    const cipherBlock = encrypted.subarray(offset, offset + 16)
    for (let i = 0; i < 16; i++) {
      decrypted[offset + i] = cipherBlock[i] ^ hash[i]
    }
    previousBlock = cipherBlock
  }

  return decrypted.toString('utf8').replace(/\0+$/, '')
}

function parseAttributes(buffer: Buffer) {
  const attrs: Record<number, Buffer> = {}
  let offset = 20
  while (offset < buffer.length) {
    const type = buffer.readUInt8(offset)
    const len = buffer.readUInt8(offset + 1)
    attrs[type] = buffer.subarray(offset + 2, offset + len)
    offset += len
  }
  return attrs
}

function startFakeRadiusServer(decision: 'accept' | 'reject', expected: { username: string; password: string }) {
  const socket = dgram.createSocket('udp4')

  socket.on('message', (message, rinfo) => {
    const identifier = message.readUInt8(1)
    const requestAuthenticator = message.subarray(4, 20)
    const attrs = parseAttributes(message)

    const username = attrs[1]?.toString('utf8')
    const password = attrs[2] ? decryptPapPassword(attrs[2], SECRET, requestAuthenticator) : ''

    const matches = username === expected.username && password === expected.password
    const code = decision === 'accept' && matches ? 2 : 3

    const response = Buffer.alloc(20)
    response.writeUInt8(code, 0)
    response.writeUInt8(identifier, 1)
    response.writeUInt16BE(20, 2)
    // Response Authenticator correctness isn't verified by our client, so a
    // zero-filled value is sufficient for this test double.
    socket.send(response, rinfo.port, rinfo.address)
  })

  return new Promise<dgram.Socket>((resolve) => {
    socket.bind(0, '127.0.0.1', () => resolve(socket))
  })
}

describe('RadiusProbeService', () => {
  const service = new RadiusProbeService()

  it('reports accepted=true when the real credentials match (Access-Accept)', async () => {
    const socket = await startFakeRadiusServer('accept', { username: 'arofi-test-user', password: 'sup3r-secret' })
    const port = (socket.address() as { port: number }).port

    try {
      const result = await service.sendAccessRequest({
        host: '127.0.0.1',
        port,
        secret: SECRET,
        nasIp: '203.0.113.1',
        username: 'arofi-test-user',
        password: 'sup3r-secret',
        timeoutMs: 2000,
      })

      expect(result.accepted).toBe(true)
      expect(result.code).toBe(2)
    } finally {
      socket.close()
    }
  })

  it('reports accepted=false when credentials are wrong (Access-Reject)', async () => {
    const socket = await startFakeRadiusServer('accept', { username: 'arofi-test-user', password: 'sup3r-secret' })
    const port = (socket.address() as { port: number }).port

    try {
      const result = await service.sendAccessRequest({
        host: '127.0.0.1',
        port,
        secret: SECRET,
        nasIp: '203.0.113.1',
        username: 'arofi-test-user',
        password: 'wrong-password',
        timeoutMs: 2000,
      })

      expect(result.accepted).toBe(false)
      expect(result.code).toBe(3)
    } finally {
      socket.close()
    }
  })

  it('rejects when the server never replies (timeout)', async () => {
    await expect(
      service.sendAccessRequest({
        host: '127.0.0.1',
        port: 39999,
        secret: SECRET,
        nasIp: '203.0.113.1',
        username: 'nobody',
        password: 'nope',
        timeoutMs: 300,
      }),
    ).rejects.toThrow(/did not respond/)
  })
})
