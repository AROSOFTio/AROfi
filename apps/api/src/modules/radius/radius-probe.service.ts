import { Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import * as dgram from 'dgram'

// RFC 2865 attribute type numbers used by a minimal PAP Access-Request.
const ATTR_USER_NAME = 1
const ATTR_USER_PASSWORD = 2
const ATTR_NAS_IP_ADDRESS = 4
const ATTR_NAS_PORT_TYPE = 61

const CODE_ACCESS_REQUEST = 1
const CODE_ACCESS_ACCEPT = 2
const CODE_ACCESS_REJECT = 3
const CODE_ACCESS_CHALLENGE = 11

export type RadiusProbeInput = {
  host: string
  port: number
  secret: string
  nasIp: string
  username: string
  password: string
  timeoutMs?: number
}

export type RadiusProbeResult = {
  accepted: boolean
  code: number
  latencyMs: number
}

/**
 * Sends a real RFC 2865 PAP Access-Request over UDP and reports whether
 * FreeRADIUS accepted it. This is not a simulation against a mock — it is
 * the same protocol exchange a MikroTik HotSpot performs, sent directly to
 * the real RADIUS server, so an Access-Accept here means the credentials and
 * shared secret genuinely authenticate against the live `radcheck` table.
 */
@Injectable()
export class RadiusProbeService {
  async sendAccessRequest(input: RadiusProbeInput): Promise<RadiusProbeResult> {
    const timeoutMs = input.timeoutMs ?? 5000
    const identifier = randomBytes(1)[0]
    const requestAuthenticator = randomBytes(16)
    const packet = this.buildAccessRequest(input, identifier, requestAuthenticator)

    const startedAt = Date.now()
    const response = await this.send(packet, input.host, input.port, timeoutMs)
    const latencyMs = Date.now() - startedAt

    this.assertValidResponse(response, identifier)

    const code = response.readUInt8(0)
    return {
      accepted: code === CODE_ACCESS_ACCEPT,
      code,
      latencyMs,
    }
  }

  private buildAccessRequest(input: RadiusProbeInput, identifier: number, requestAuthenticator: Buffer) {
    const attributes = Buffer.concat([
      this.encodeAttribute(ATTR_USER_NAME, Buffer.from(input.username, 'utf8')),
      this.encodeAttribute(
        ATTR_USER_PASSWORD,
        this.encryptPapPassword(input.password, input.secret, requestAuthenticator),
      ),
      this.encodeAttribute(ATTR_NAS_IP_ADDRESS, this.ipToBuffer(input.nasIp)),
      this.encodeAttribute(ATTR_NAS_PORT_TYPE, this.uint32ToBuffer(19)), // Wireless-802.11
    ])

    const length = 20 + attributes.length
    const header = Buffer.alloc(20)
    header.writeUInt8(CODE_ACCESS_REQUEST, 0)
    header.writeUInt8(identifier, 1)
    header.writeUInt16BE(length, 2)
    requestAuthenticator.copy(header, 4)

    return Buffer.concat([header, attributes])
  }

  // RFC 2865 section 5.2 PAP password encryption: pad to a 16-byte multiple,
  // then XOR each 16-byte block with MD5(secret + previous-ciphertext-block),
  // using the Request Authenticator as the "previous block" for the first one.
  private encryptPapPassword(password: string, secret: string, requestAuthenticator: Buffer) {
    const passwordBytes = Buffer.from(password, 'utf8')
    const paddedLength = Math.max(16, Math.ceil(passwordBytes.length / 16) * 16)
    const padded = Buffer.alloc(paddedLength)
    passwordBytes.copy(padded)

    const secretBuffer = Buffer.from(secret, 'utf8')
    const encrypted = Buffer.alloc(paddedLength)
    let previousBlock = requestAuthenticator

    for (let offset = 0; offset < paddedLength; offset += 16) {
      const hash = createHash('md5').update(Buffer.concat([secretBuffer, previousBlock])).digest()
      const plainBlock = padded.subarray(offset, offset + 16)
      const cipherBlock = Buffer.alloc(16)
      for (let i = 0; i < 16; i++) {
        cipherBlock[i] = plainBlock[i] ^ hash[i]
      }
      cipherBlock.copy(encrypted, offset)
      previousBlock = cipherBlock
    }

    return encrypted
  }

  private encodeAttribute(type: number, value: Buffer) {
    const header = Buffer.from([type, value.length + 2])
    return Buffer.concat([header, value])
  }

  private ipToBuffer(ip: string) {
    const parts = ip.split('.').map((part) => Number.parseInt(part, 10))
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
      // NAS-IP-Address is informational here (auth is gated by the shared
      // secret, not this attribute) — fall back rather than fail the probe.
      return Buffer.from([0, 0, 0, 0])
    }
    return Buffer.from(parts)
  }

  private uint32ToBuffer(value: number) {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32BE(value, 0)
    return buffer
  }

  private send(packet: Buffer, host: string, port: number, timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4')
      let settled = false

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.close()
        fn()
      }

      const timer = setTimeout(() => {
        finish(() => reject(new Error(`RADIUS server ${host}:${port} did not respond within ${timeoutMs}ms`)))
      }, timeoutMs)

      socket.once('error', (error) => {
        finish(() => reject(error))
      })

      socket.once('message', (message) => {
        finish(() => resolve(message))
      })

      socket.send(packet, port, host, (error) => {
        if (error) {
          finish(() => reject(error))
        }
      })
    })
  }

  private assertValidResponse(response: Buffer, expectedIdentifier: number) {
    if (response.length < 20) {
      throw new Error('RADIUS response was too short to be valid')
    }

    const code = response.readUInt8(0)
    const identifier = response.readUInt8(1)

    if (identifier !== expectedIdentifier) {
      throw new Error('RADIUS response identifier did not match the request')
    }

    if (![CODE_ACCESS_ACCEPT, CODE_ACCESS_REJECT, CODE_ACCESS_CHALLENGE].includes(code)) {
      throw new Error(`Unexpected RADIUS response code ${code}`)
    }
  }
}
