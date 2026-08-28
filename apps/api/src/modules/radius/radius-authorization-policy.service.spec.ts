import { PackageActivationStatus, RadiusCredentialStatus, SessionStatus } from '@prisma/client'
import { RadiusAuthorizationPolicyService } from './radius-authorization-policy.service'

describe('RadiusAuthorizationPolicyService', () => {
  const service = new RadiusAuthorizationPolicyService()

  function buildTx(overrides: Record<string, unknown> = {}) {
    const activation = {
      id: 'activation-1',
      tenantId: 'tenant-1',
      status: PackageActivationStatus.ACTIVE,
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      boundMacAddress: 'AA:BB:CC:DD:EE:FF',
      package: { name: 'Daily' },
    }

    return {
      radiusCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'credential-1',
          username: 'voucher-1',
          status: RadiusCredentialStatus.ACTIVE,
          boundMacAddress: activation.boundMacAddress,
          activation: { ...activation, ...(overrides.activation as object) },
        }),
        update: jest.fn(),
      },
      packageActivation: {
        update: jest.fn(),
      },
      radAcct: {
        findFirst: jest.fn().mockResolvedValue({ radacctid: BigInt(1) }),
      },
      networkSession: {
        findFirst: jest.fn().mockResolvedValue(overrides.activeSession ?? null),
      },
      suspiciousAccessAttempt: {
        create: jest.fn(),
      },
    } as any
  }

  it('allows the same bound MAC while activation is active', async () => {
    const tx = buildTx()

    const result = await service.authorize(tx, {
      username: 'voucher-1',
      macAddress: 'aa-bb-cc-dd-ee-ff',
    })

    expect(result.accepted).toBe(true)
  })

  it('rejects a missing MAC because one-device enforcement would be impossible', async () => {
    const tx = buildTx()

    const result = await service.authorize(tx, {
      username: 'voucher-1',
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toContain('MAC address is required')
    expect(tx.suspiciousAccessAttempt.create).toHaveBeenCalled()
  })

  it('rejects a second MAC and records a suspicious attempt', async () => {
    const tx = buildTx()

    const result = await service.authorize(tx, {
      username: 'voucher-1',
      macAddress: '11:22:33:44:55:66',
      ipAddress: '10.0.0.20',
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toContain('another device')
    expect(tx.suspiciousAccessAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        observedMacAddress: '11:22:33:44:55:66',
      }),
    })
  })

  it('rejects an active concurrent session from another MAC', async () => {
    const tx = buildTx({
      activeSession: {
        id: 'session-2',
        status: SessionStatus.ACTIVE,
        macAddress: '11:22:33:44:55:66',
      },
    })

    const result = await service.authorize(tx, {
      username: 'voucher-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toContain('Concurrent session')
  })
})
