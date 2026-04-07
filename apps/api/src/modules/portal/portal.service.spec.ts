import { UnauthorizedException } from '@nestjs/common'
import { PortalService } from './portal.service'

describe('PortalService', () => {
  const service = new PortalService(
    {} as never,
    {
      get: jest.fn((key: string) => {
        if (key === 'PORTAL_TOKEN_SECRET') {
          return 'portal-secret'
        }

        if (key === 'JWT_SECRET') {
          return 'jwt-fallback'
        }

        return undefined
      }),
    } as never,
    {} as never,
    {} as never,
  )

  it('normalizes Uganda customer phone numbers', () => {
    expect((service as any).normalizePhoneNumber('0772000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('+256 772 000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('772000000')).toBe('256772000000')
  })

  it('creates and verifies signed portal access tokens', () => {
    const token = (service as any).createAccessToken({
      tenantId: 'tenant-1',
      phoneNumber: '256772000000',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    })

    expect((service as any).verifyAccessToken(token)).toMatchObject({
      tenantId: 'tenant-1',
      phoneNumber: '256772000000',
    })
  })

  it('rejects tampered portal access tokens', () => {
    const token = (service as any).createAccessToken({
      tenantId: 'tenant-1',
      phoneNumber: '256772000000',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    })

    const [payload] = token.split('.')

    expect(() => (service as any).verifyAccessToken(`${payload}.broken-signature`)).toThrow(
      UnauthorizedException,
    )
  })
})
