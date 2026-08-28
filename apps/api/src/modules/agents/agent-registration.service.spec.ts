import { BadRequestException } from '@nestjs/common'
import { AgentType } from '@prisma/client'
import { AgentRegistrationService } from './agent-registration.service'

describe('AgentRegistrationService', () => {
  const tenant = { id: 'tenant-1', name: 'Test WiFi' }

  function createHarness() {
    const tx = {
      agent: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'agent-1', status: 'ACTIVE', ...data })),
      },
      user: {
        create: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
    }

    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-agent' }) },
      agent: { findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any
    const roleCatalog = { ensureStandardRoles: jest.fn().mockResolvedValue(undefined) } as any
    const service = new AgentRegistrationService(prisma, roleCatalog)

    return { service, prisma, roleCatalog, tx }
  }

  const registration = {
    tenantId: tenant.id,
    code: 'kla-01',
    name: 'Kampala Agent',
    phoneNumber: '0772123456',
    email: 'AGENT@example.com',
    temporaryPassword: 'temporary-123',
    type: AgentType.FIELD_AGENT,
    commissionRateBps: 500,
  }

  it('creates the Agent and VoucherAgent login in the same transaction', async () => {
    const { service, prisma, tx } = createHarness()

    const result = await service.register(registration)

    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'VoucherAgent' },
      select: { id: true },
    })
    expect(prisma.agent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: tenant.id }),
      }),
    )
    expect(tx.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: tenant.id,
          code: 'KLA-01',
          phoneNumber: '256772123456',
          email: 'agent@example.com',
        }),
      }),
    )
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'agent@example.com',
        roleId: 'role-agent',
        tenantId: tenant.id,
      }),
    })
    expect(result.loginReady).toBe(true)
  })

  it('rejects a temporary password that becomes too short after trimming before DB work', async () => {
    const { service, prisma, roleCatalog } = createHarness()

    await expect(
      service.register({ ...registration, temporaryPassword: '       x       ' }),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(roleCatalog.ensureStandardRoles).not.toHaveBeenCalled()
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('does not create an Agent when the login email already belongs to a user', async () => {
    const { service, prisma, tx } = createHarness()
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' })

    await expect(service.register(registration)).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.agent.create).not.toHaveBeenCalled()
    expect(tx.user.create).not.toHaveBeenCalled()
  })

  it('rejects duplicate Agent data before opening the write transaction', async () => {
    const { service, prisma, tx } = createHarness()
    prisma.agent.findFirst.mockResolvedValue({
      code: 'KLA-01',
      phoneNumber: '256772123456',
      email: 'agent@example.com',
    })

    await expect(service.register(registration)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.agent.create).not.toHaveBeenCalled()
  })

  it('restores an existing matching VoucherAgent login for a legacy Agent profile', async () => {
    const { service, prisma } = createHarness()
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      tenantId: tenant.id,
      name: 'Kampala Agent',
      email: 'agent@example.com',
    })
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      tenantId: tenant.id,
      roleId: 'role-agent',
    })

    const result = await service.provisionLogin('agent-1', tenant.id, 'replacement-123')

    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'VoucherAgent' },
      select: { id: true },
    })
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: tenant.id, roleId: 'role-agent' },
      data: expect.objectContaining({ isActive: true }),
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ loginReady: true, restored: true }))
  })

  it('does not overwrite a login that changes tenant or role during restoration', async () => {
    const { service, prisma } = createHarness()
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      tenantId: tenant.id,
      name: 'Kampala Agent',
      email: 'agent@example.com',
    })
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      tenantId: tenant.id,
      roleId: 'role-agent',
    })
    prisma.user.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      service.provisionLogin('agent-1', tenant.id, 'replacement-123'),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: tenant.id, roleId: 'role-agent' },
      data: expect.objectContaining({ isActive: true }),
    })
  })

  it('rejects a weak provision password before role or Agent lookups', async () => {
    const { service, prisma, roleCatalog } = createHarness()

    await expect(service.provisionLogin('agent-1', tenant.id, '    x    ')).rejects.toBeInstanceOf(
      BadRequestException,
    )

    expect(roleCatalog.ensureStandardRoles).not.toHaveBeenCalled()
    expect(prisma.agent.findFirst).not.toHaveBeenCalled()
    expect(prisma.role.findUnique).not.toHaveBeenCalled()
  })
})
