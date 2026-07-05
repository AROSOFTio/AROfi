import { PackageActivationStatus, RadiusCredentialStatus } from '@prisma/client'
import { RadiusCredentialService } from './radius-credential.service'

function buildTx(overrides: Record<string, unknown> = {}) {
  const activation = {
    id: 'activation-1',
    tenantId: 'tenant-1',
    status: PackageActivationStatus.ACTIVE,
    source: 'VOUCHER',
    radiusUsername: null,
    radiusPassword: null,
    boundMacAddress: 'AA:BB:CC:DD:EE:FF',
    routerId: 'router-1',
    endsAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour remaining
    downloadSpeedKbps: null,
    uploadSpeedKbps: null,
    package: { id: 'pkg-1' },
    ...overrides,
  }

  return {
    activation,
    tx: {
      packageActivation: {
        findUnique: jest.fn().mockResolvedValue(activation),
        update: jest.fn().mockResolvedValue(activation),
      },
      radiusCredential: {
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ ...create, id: 'cred-1' })),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      radCheck: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      radReply: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    },
  }
}

describe('RadiusCredentialService', () => {
  const service = new RadiusCredentialService()

  it('provisions Session-Timeout with the remaining bundle seconds', async () => {
    const { tx } = buildTx()

    await service.provisionForActivation(tx as never, {
      tenantId: 'tenant-1',
      activationId: 'activation-1',
    })

    const replyRows = tx.radReply.createMany.mock.calls[0][0].data as Array<{
      attribute: string
      value: string
    }>
    const sessionTimeout = replyRows.find((row) => row.attribute === 'Session-Timeout')
    expect(sessionTimeout).toBeDefined()
    const seconds = Number.parseInt(sessionTimeout!.value, 10)
    expect(seconds).toBeGreaterThan(3500)
    expect(seconds).toBeLessThanOrEqual(3600)
  })

  it('NEVER provisions Idle-Timeout — idle users must stay connected until bundle expiry', async () => {
    const { tx } = buildTx({ downloadSpeedKbps: 2048, uploadSpeedKbps: 1024 })

    await service.provisionForActivation(tx as never, {
      tenantId: 'tenant-1',
      activationId: 'activation-1',
    })

    for (const call of tx.radReply.createMany.mock.calls) {
      const rows = call[0].data as Array<{ attribute: string }>
      expect(rows.some((row) => row.attribute === 'Idle-Timeout')).toBe(false)
    }
    for (const call of tx.radCheck.createMany.mock.calls) {
      const rows = call[0].data as Array<{ attribute: string }>
      expect(rows.some((row) => row.attribute === 'Idle-Timeout')).toBe(false)
    }
  })

  it('creates an Expiration radcheck row matching the activation end', async () => {
    const { tx } = buildTx()

    await service.provisionForActivation(tx as never, {
      tenantId: 'tenant-1',
      activationId: 'activation-1',
    })

    const checkRows = tx.radCheck.createMany.mock.calls[0][0].data as Array<{
      attribute: string
    }>
    expect(checkRows.some((row) => row.attribute === 'Cleartext-Password')).toBe(true)
    expect(checkRows.some((row) => row.attribute === 'Expiration')).toBe(true)
  })

  it('does not write radcheck/radreply rows for an already-expired activation', async () => {
    const { tx } = buildTx({
      endsAt: new Date(Date.now() - 10 * 60 * 1000),
      status: PackageActivationStatus.EXPIRED,
    })
    tx.radiusCredential.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, id: 'cred-1', status: RadiusCredentialStatus.DISABLED }),
    )

    await service.provisionForActivation(tx as never, {
      tenantId: 'tenant-1',
      activationId: 'activation-1',
    })

    expect(tx.radCheck.createMany).not.toHaveBeenCalled()
    expect(tx.radReply.createMany).not.toHaveBeenCalled()
  })

  it('removes radcheck and radreply rows when disabling a credential', async () => {
    const { tx } = buildTx()
    tx.radiusCredential.findUnique.mockResolvedValue({
      id: 'cred-1',
      username: 'arofi-user',
    })
    tx.radiusCredential.update.mockResolvedValue({ id: 'cred-1', status: RadiusCredentialStatus.EXPIRED })

    await service.disableForActivation(tx as never, 'activation-1', RadiusCredentialStatus.EXPIRED)

    expect(tx.radCheck.deleteMany).toHaveBeenCalledWith({ where: { username: 'arofi-user' } })
    expect(tx.radReply.deleteMany).toHaveBeenCalledWith({ where: { username: 'arofi-user' } })
    expect(tx.radiusCredential.update).toHaveBeenCalledWith({
      where: { id: 'cred-1' },
      data: { status: RadiusCredentialStatus.EXPIRED },
    })
  })
})
