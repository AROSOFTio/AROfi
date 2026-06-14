import { ConfigService } from '@nestjs/config'
import { RouterCredentialsService } from './router-credentials.service'

describe('RouterCredentialsService', () => {
  it('encrypts and decrypts router secrets', () => {
    const service = new RouterCredentialsService(
      new ConfigService({
        ROUTER_CREDENTIAL_SECRET: 'phase4-router-secret',
      }),
    )

    const encrypted = service.encrypt('mikrotik-password')

    expect(encrypted).not.toContain('mikrotik-password')
    expect(service.decrypt(encrypted)).toBe('mikrotik-password')
  })

  it('round-trips an empty value (blank admin password)', () => {
    const service = new RouterCredentialsService(
      new ConfigService({ ROUTER_CREDENTIAL_SECRET: 'phase4-router-secret' }),
    )

    const encrypted = service.encrypt('')
    expect(service.decrypt(encrypted)).toBe('')
  })
})
