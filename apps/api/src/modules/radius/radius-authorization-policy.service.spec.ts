import { PackageActivationStatus, RadiusCredentialStatus, SessionStatus } from '@prisma/client'
import { RadiusAuthorizationPolicyService } from './radius-authorization-policy.service'

describe('RadiusAuthorizationPolicyService', () => {
  const service = new RadiusAuthorizationPolicyService()

  function buildTx(overrides: Record<string, unknown> = {}) {
    const activation = {
      id: 'activation-1',
      tenantId: 'tenant-1',
      routerId: 'router-a',
      status: PackageActivationStatus.ACTIVE,
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      boundMacAddress: 'AA:BB:CC:DD:EE:FF',
      package: { name: 'Daily' },
      ...(overrides.activation as object),
    }

    return {
      radiusCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'credential-1',
          username: 'voucher-1',
          routerId: 'router-a',
          status: RadiusCredentialStatus.ACTIVE,
          boundMacAddress: activation.boundMacAddress,
          activation,
        }),
        update: jest.fn(),
      },
      packageActivation: {
        update: jest.fn(),
      },
      router: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'router-z',
          tenantId: overrides.routerTenantId ?? 'tenant-1',
        }),
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

  it('allows an active voucher to hand off instantly from AP A to AP Z in the same business', async () => {
    const tx = buildTx({
      activeSession: {
        id: 'session-a',
        status: SessionStatus.ACTIVE,
        macAddress: 'AA:BB:CC:DD:EE:FF',
        routerId: 'router-a',
      },
    })

    const result = await service.authorize(tx, {
      username: 'voucher-1',
      macAddress: '11:22:33:44:55:66',
      routerId: 'router-z',
      ipAddress: '10.55.2.20',
    })

    expect(result.accepted).toBe(true)
    expect(result.reason).toContain('same-business AP handoff')
    expect(tx.packageActivation.update).toHaveBeenCalledWith({
      where: { id: 'activation-1' },
      data: expect.objectContaining({
        boundMacAddress: '11:22:33:44:55:66',
        routerId: 'router-z',
      }),
    })
    expect(tx.radiusCredential.update).toHaveBeenCalledWith({
      where: { id: 'credential-1' },
      data: expect.objectContaining({
        boundMacAddress: '11:22:33:44:55:66',
        routerId: 'router-z',
      }),
    })
  })

  it('still rejects a different MAC trying the credential on the same AP', async () => {
    const tx = buildTx()

    const result = await service.authorize(tx, {
      username: 'voucher-1',
      macAddress: '11:22:33:44:55:66',
      routerId: 'router-a',
      ipAddress: '10.55.0.20',
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toContain('another device')
    expect(tx.suspiciousAccessAttempt.create).toHaveBeenCalled()
  })

  it('rejects a handoff through an AP belonging to another business', async () => {
    const tx = buildTx({ routerTenantId: 'tenant-2' })

    const result = await service.authorize(tx, {
      username: 'voucher-1',
      macAddress: '11:22:33:44:55:66',
      routerId: 'router-z',
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toContain('not valid on this business network')
  })

  it('rejects an active concurrent session from another MAC when this is not a cross-AP handoff', async () => {
    const tx = buildTx({
      activeSession: {
        id: 'session-2',
        status: SessionStatus.ACTIVE,
        macAddress: '11:22:33:44:55:66',
        routerId: 'router-a',
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
