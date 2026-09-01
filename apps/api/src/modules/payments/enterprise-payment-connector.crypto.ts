import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

@Injectable()
export class EnterprisePaymentConnectorCrypto {
  constructor(private readonly configService: ConfigService) {}

  encryptObject(value: Record<string, unknown>) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
  }

  decryptObject<T extends Record<string, unknown>>(payload: string): T {
    const [version, ivHex, tagHex, dataHex] = payload.split(':')
    if (version !== 'v1' || !ivHex || !tagHex || dataHex === undefined) {
      throw new InternalServerErrorException('Unsupported Enterprise payment credential payload')
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ])
    return JSON.parse(decrypted.toString('utf8')) as T
  }

  encryptText(value: string) {
    return this.encryptObject({ value })
  }

  decryptText(payload: string) {
    return String(this.decryptObject<{ value: string }>(payload).value ?? '')
  }

  private key() {
    const configured = this.configService.get<string>('PAYMENT_CONNECTOR_SECRET')?.trim()
    if (!configured && process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException(
        'PAYMENT_CONNECTOR_SECRET must be configured before Enterprise payment connectors can be used in production',
      )
    }

    const source =
      configured ||
      this.configService.get<string>('ROUTER_CREDENTIAL_SECRET')?.trim() ||
      'development-only-enterprise-payment-secret'

    return createHash('sha256').update(source).digest()
  }
}
