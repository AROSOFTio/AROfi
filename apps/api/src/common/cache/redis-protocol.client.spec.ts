import { AddressInfo, createServer, Server } from 'node:net'
import { RedisProtocolClient } from './redis-protocol.client'

describe('RedisProtocolClient', () => {
  let server: Server
  let client: RedisProtocolClient | undefined
  const commands: string[] = []

  beforeEach(async () => {
    commands.length = 0
    server = createServer((socket) => {
      socket.on('data', (chunk) => {
        const command = chunk.toString('utf8')
        commands.push(command)

        if (command.includes('\r\nGET\r\n')) {
          socket.write('$5\r\nvalue\r\n')
          return
        }
        if (command.includes('\r\nSET\r\n')) {
          socket.write('+OK\r\n')
          return
        }
        if (command.includes('\r\nSCAN\r\n')) {
          socket.write('*2\r\n$1\r\n0\r\n*2\r\n$3\r\none\r\n$3\r\ntwo\r\n')
          return
        }
        if (command.includes('\r\nUNLINK\r\n')) {
          socket.write(':2\r\n')
          return
        }

        socket.write('-ERR unsupported command\r\n')
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    client = new RedisProtocolClient(`redis://127.0.0.1:${address.port}`, 1_000)
  })

  afterEach(async () => {
    client?.disconnect()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('supports the commands used by the read cache', async () => {
    await expect(client!.get('cache:key')).resolves.toBe('value')
    await expect(client!.setEx('cache:key', 30, '{"ok":true}')).resolves.toBeUndefined()
    await expect(client!.scan('0', 'arofi:v1:*', 200)).resolves.toEqual(['0', ['one', 'two']])
    await expect(client!.unlink(['one', 'two'])).resolves.toBeUndefined()

    expect(commands).toHaveLength(4)
    expect(commands[0]).toContain('cache:key')
    expect(commands[1]).toContain('\r\nEX\r\n')
    expect(commands[2]).toContain('arofi:v1:*')
  })
})
