import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

@Injectable()
export class RouterCredentialsService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
  }

  decrypt(payload: string) {
    const [version, ivHex, authTagHex, encryptedHex] = payload.split(':')

    if (version !== 'v1' || !ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Unsupported router credential payload')
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getKey(),
      Buffer.from(ivHex, 'hex'),
    )
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  }

  mask(value: string, revealCount = 4) {
    if (!value) {
      return ''
    }

    if (value.length <= revealCount) {
      return '*'.repeat(value.length)
    }

    return `${'*'.repeat(Math.max(4, value.length - revealCount))}${value.slice(-revealCount)}`
  }

  maskCiphertext(payload?: string | null) {
    if (!payload) {
      return null
    }

    try {
      return this.mask(this.decrypt(payload))
    } catch {
      return 'Configured'
    }
  }

  private getKey() {
    const secret =
      this.configService.get<string>('ROUTER_CREDENTIAL_SECRET') ??
      'change_this_router_secret'

    return createHash('sha256').update(secret).digest()
  }
}
