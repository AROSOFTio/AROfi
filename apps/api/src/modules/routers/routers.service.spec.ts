import { RouterConnectionMode, RouterScriptMode } from '@prisma/client'
import { RoutersService } from './routers.service'

describe('RoutersService', () => {
  it('creates a matching dynamic NAS client when a router is onboarded', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      routerGroup: {
        findUnique: jest.fn(),
      },
      hotspot: {
        findUnique: jest.fn(),
      },
      router: {
        create: jest.fn().mockResolvedValue({ id: 'router-1' }),
      },
    }
    const credentials = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      mask: jest.fn((value: string) => `${value.slice(0, 3)}***`),
    }
    const service = new RoutersService(prisma as never, {} as never, credentials as never)
    jest.spyOn(service as any, 'reloadFreeradiusNasClients').mockImplementation(() => undefined)
    jest.spyOn(service, 'getRouterSetup').mockResolvedValue({ id: 'router-1' } as never)

    await service.createRouter({
      tenantId: 'tenant-1',
      name: 'Main Branch',
      host: '10.10.10.1',
      radiusNasIpAddress: '192.0.2.10',
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      scriptMode: RouterScriptMode.SAFE_EXISTING_ROUTER,
      sharedSecret: 'per-router-secret',
    })

    const createArgs = prisma.router.create.mock.calls[0][0]
    expect(createArgs.data.radiusClient.create).toMatchObject({
      ipAddress: '192.0.2.10',
    })
    expect(createArgs.data.nasClient.create).toMatchObject({
      tenantId: 'tenant-1',
      nasname: '192.0.2.10',
      secret: 'change_me_radius_secret',
      type: 'mikrotik',
      enabled: true,
    })
    expect(createArgs.data.nasClient.create.shortname).toBe(createArgs.data.radiusClient.create.shortName)
  })

  function buildCallbackRouter(overrides: Record<string, unknown> = {}) {
    return {
      id: 'router-1',
      tenantId: 'tenant-1',
      name: 'Shop Router',
      host: 'pending-router.self-service',
      sharedSecretCiphertext: 'encrypted-secret',
      radiusClient: {
        id: 'radius-client-1',
        shortName: 'shop-router',
        secretCiphertext: 'encrypted-secret',
      },
      nasClient: {
        id: 10,
        shortname: 'shop-router',
      },
      ...overrides,
    }
  }

  function buildCallbackHarness(router = buildCallbackRouter()) {
    const tx = {
      router: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({
          id: router.id,
          host: '102.209.111.77',
          tenantId: router.tenantId,
          name: router.name,
        }),
      },
      radiusClient: {
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
      nasClient: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      router: {
        findUnique: jest.fn().mockResolvedValue(router),
        update: jest.fn().mockResolvedValue(router),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    }
    const credentials = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn(() => 'plain-radius-secret'),
      mask: jest.fn((value: string) => `${value.slice(0, 3)}***`),
      maskCiphertext: jest.fn(() => '********'),
    }
    const service = new RoutersService(prisma as never, {} as never, credentials as never)
    jest.spyOn(service as any, 'reloadFreeradiusNasClients').mockImplementation(() => undefined)

    return { service, prisma, tx, credentials }
  }

  it('marks a normal MikroTik provisioning callback without nested update failures', async () => {
    const { service, tx } = buildCallbackHarness()

    const result = await service.markRouterProvisionedByKey('registration-key', '102.209.111.77')

    expect(result).toMatchObject({
      ok: true,
      callbackReceived: true,
      learnedNasIpAddress: '102.209.111.77',
      managementHost: '102.209.111.77',
    })
    expect(tx.router.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          host: '102.209.111.77',
          radiusNasIpAddress: '102.209.111.77',
          lastProvisionedAt: expect.any(Date),
        }),
      }),
    )
    expect(tx.radiusClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'radius-client-1' },
        data: expect.objectContaining({ ipAddress: '102.209.111.77' }),
      }),
    )
    expect(tx.nasClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ nasname: '102.209.111.77', enabled: true }),
      }),
    )
  })

  it('does not replace pending host when another router in the tenant already uses the learned IP', async () => {
    const { service, tx } = buildCallbackHarness()
    tx.router.findFirst.mockResolvedValue({ id: 'router-2', name: 'Existing Router' })
    tx.router.update.mockResolvedValue({
      id: 'router-1',
      host: 'pending-router.self-service',
      tenantId: 'tenant-1',
      name: 'Shop Router',
    })

    const result = await service.markRouterProvisionedByKey('registration-key', '102.209.111.77')

    expect(tx.router.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          host: 'pending-router.self-service',
          radiusNasIpAddress: '102.209.111.77',
        }),
      }),
    )
    expect(result).toMatchObject({
      ok: true,
      callbackReceived: true,
      managementHost: 'pending-router.self-service',
    })
    expect(result?.warning).toContain('already uses that host')
  })

  it('creates a missing radius client during callback', async () => {
    const { service, tx } = buildCallbackHarness(buildCallbackRouter({ radiusClient: null }))

    await service.markRouterProvisionedByKey('registration-key', '102.209.111.77')

    expect(tx.radiusClient.update).not.toHaveBeenCalled()
    expect(tx.radiusClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { routerId: 'router-1' },
        create: expect.objectContaining({
          tenantId: 'tenant-1',
          routerId: 'router-1',
          ipAddress: '102.209.111.77',
          secretCiphertext: 'encrypted-secret',
        }),
      }),
    )
  })

  it('creates a missing NAS client during callback', async () => {
    const { service, tx } = buildCallbackHarness(buildCallbackRouter({ nasClient: null }))

    await service.markRouterProvisionedByKey('registration-key', '102.209.111.77')

    expect(tx.nasClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          routerId: 'router-1',
          nasname: '102.209.111.77',
          shortname: 'shop-router',
          secret: 'change_me_radius_secret',
          enabled: true,
        }),
      }),
    )
  })

  it('returns a controlled callback response when a database conflict is thrown', async () => {
    const { service, tx } = buildCallbackHarness()
    tx.nasClient.update.mockRejectedValueOnce(new Error('unique constraint failed'))
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined)

    const result = await service.markRouterProvisionedByKey('registration-key', '102.209.111.77')

    expect(result).toMatchObject({
      ok: true,
      callbackReceived: true,
      learnedNasIpAddress: '102.209.111.77',
      managementHost: 'pending-router.self-service',
    })
    expect(result?.warning).toContain('could not fully update')
  })

  it('returns null for an unknown registration key so the controller can keep a true 404', async () => {
    const router = buildCallbackRouter()
    const { service, prisma } = buildCallbackHarness(router)
    prisma.router.findUnique.mockResolvedValue(null)

    await expect(service.markRouterProvisionedByKey('missing-key', '102.209.111.77')).resolves.toBeNull()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
