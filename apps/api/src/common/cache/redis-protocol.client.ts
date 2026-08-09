import { Socket, connect as connectTcp } from 'node:net'
import { connect as connectTls, TLSSocket } from 'node:tls'

type RedisSocket = Socket | TLSSocket

type PendingCommand = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class RedisProtocolClient {
  private readonly url: URL
  private readonly timeoutMs: number
  private socket?: RedisSocket
  private connectPromise?: Promise<void>
  private pending?: PendingCommand
  private receiveBuffer = Buffer.alloc(0)
  private commandTail: Promise<void> = Promise.resolve()
  private closed = false

  constructor(redisUrl: string, timeoutMs: number) {
    this.url = new URL(redisUrl)
    if (!['redis:', 'rediss:'].includes(this.url.protocol)) {
      throw new Error('REDIS_URL must use redis:// or rediss://')
    }
    this.timeoutMs = Math.max(250, timeoutMs)
  }

  get isReady() {
    return Boolean(this.socket && !this.socket.destroyed && this.socket.writable)
  }

  async get(key: string): Promise<string | null> {
    const value = await this.command(['GET', key])
    return value === null ? null : String(value)
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.command(['SET', key, value, 'EX', String(Math.max(1, Math.floor(ttlSeconds)))])
  }

  async scan(cursor: string, pattern: string, count = 200): Promise<[string, string[]]> {
    const value = await this.command(['SCAN', cursor, 'MATCH', pattern, 'COUNT', String(count)])
    if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[1])) {
      throw new Error('Unexpected Redis SCAN response')
    }
    return [String(value[0]), value[1].map((item) => String(item))]
  }

  async unlink(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return
    }
    await this.command(['UNLINK', ...keys])
  }

  disconnect() {
    this.closed = true
    this.rejectPending(new Error('Redis client disconnected'))
    this.socket?.destroy()
    this.socket = undefined
  }

  private command<T = unknown>(args: string[]): Promise<T> {
    const operation = this.commandTail.then(() => this.execute(args) as Promise<T>)
    this.commandTail = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  private async execute(args: string[]): Promise<unknown> {
    await this.ensureConnected()
    return this.sendOnConnectedSocket(args)
  }

  private async ensureConnected() {
    if (this.isReady) {
      return
    }
    if (this.closed) {
      throw new Error('Redis client is closed')
    }
    if (!this.connectPromise) {
      this.connectPromise = this.openConnection().finally(() => {
        this.connectPromise = undefined
      })
    }
    await this.connectPromise
  }

  private async openConnection() {
    const port = Number.parseInt(this.url.port || '6379', 10)
    const host = this.url.hostname

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const onConnected = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }
      const onError = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      }
      const timer = setTimeout(() => {
        onError(new Error(`Redis connection timed out after ${this.timeoutMs}ms`))
        this.socket?.destroy()
      }, this.timeoutMs)

      this.socket = this.url.protocol === 'rediss:'
        ? connectTls({ host, port, servername: host }, onConnected)
        : connectTcp({ host, port }, onConnected)
      this.socket.once('error', onError)
    })

    if (!this.socket) {
      throw new Error('Redis connection was not created')
    }

    this.receiveBuffer = Buffer.alloc(0)
    this.socket.removeAllListeners('error')
    this.socket.on('data', (chunk) => this.handleData(Buffer.from(chunk)))
    this.socket.on('error', (error) => {
      this.rejectPending(error)
      this.socket?.destroy()
    })
    this.socket.on('close', () => {
      this.rejectPending(new Error('Redis connection closed'))
      this.socket = undefined
    })

    const username = decodeURIComponent(this.url.username || '')
    const password = decodeURIComponent(this.url.password || '')
    if (password) {
      await this.sendOnConnectedSocket(username ? ['AUTH', username, password] : ['AUTH', password])
    }

    const database = this.url.pathname.replace(/^\//, '')
    if (database && database !== '0') {
      await this.sendOnConnectedSocket(['SELECT', database])
    }
  }

  private sendOnConnectedSocket(args: string[]): Promise<unknown> {
    if (!this.socket || this.socket.destroyed || !this.socket.writable) {
      throw new Error('Redis socket is not writable')
    }
    if (this.pending) {
      throw new Error('Redis command overlap detected')
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejectPending(new Error(`Redis command timed out after ${this.timeoutMs}ms`))
        this.socket?.destroy()
      }, this.timeoutMs)
      this.pending = { resolve, reject, timer }
      this.socket?.write(this.encodeCommand(args), (error) => {
        if (error) {
          this.rejectPending(error)
        }
      })
    })
  }

  private handleData(chunk: Buffer) {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk])
    if (!this.pending) {
      return
    }

    try {
      const parsed = this.parseValue(this.receiveBuffer, 0)
      if (!parsed) {
        return
      }
      this.receiveBuffer = this.receiveBuffer.subarray(parsed.nextOffset)
      const pending = this.pending
      this.pending = undefined
      clearTimeout(pending.timer)
      pending.resolve(parsed.value)
    } catch (error) {
      this.rejectPending(error instanceof Error ? error : new Error(String(error)))
      this.socket?.destroy()
    }
  }

  private rejectPending(error: Error) {
    if (!this.pending) {
      return
    }
    const pending = this.pending
    this.pending = undefined
    clearTimeout(pending.timer)
    pending.reject(error)
  }

  private encodeCommand(args: string[]) {
    const chunks: Buffer[] = [Buffer.from(`*${args.length}\r\n`)]
    for (const arg of args) {
      const value = Buffer.from(arg)
      chunks.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from('\r\n'))
    }
    return Buffer.concat(chunks)
  }

  private parseValue(buffer: Buffer, offset: number): { value: unknown; nextOffset: number } | null {
    if (offset >= buffer.length) {
      return null
    }
    const prefix = String.fromCharCode(buffer[offset])
    const line = this.readLine(buffer, offset + 1)
    if (!line) {
      return null
    }

    if (prefix === '+') {
      return { value: line.value, nextOffset: line.nextOffset }
    }
    if (prefix === '-') {
      throw new Error(`Redis error: ${line.value}`)
    }
    if (prefix === ':') {
      return { value: Number.parseInt(line.value, 10), nextOffset: line.nextOffset }
    }
    if (prefix === '$') {
      const length = Number.parseInt(line.value, 10)
      if (length === -1) {
        return { value: null, nextOffset: line.nextOffset }
      }
      const end = line.nextOffset + length
      if (buffer.length < end + 2) {
        return null
      }
      return { value: buffer.subarray(line.nextOffset, end).toString('utf8'), nextOffset: end + 2 }
    }
    if (prefix === '*') {
      const length = Number.parseInt(line.value, 10)
      if (length === -1) {
        return { value: null, nextOffset: line.nextOffset }
      }
      const values: unknown[] = []
      let nextOffset = line.nextOffset
      for (let index = 0; index < length; index += 1) {
        const parsed = this.parseValue(buffer, nextOffset)
        if (!parsed) {
          return null
        }
        values.push(parsed.value)
        nextOffset = parsed.nextOffset
      }
      return { value: values, nextOffset }
    }

    throw new Error(`Unsupported Redis response prefix: ${prefix}`)
  }

  private readLine(buffer: Buffer, offset: number): { value: string; nextOffset: number } | null {
    const end = buffer.indexOf('\r\n', offset)
    if (end < 0) {
      return null
    }
    return { value: buffer.subarray(offset, end).toString('utf8'), nextOffset: end + 2 }
  }
}
