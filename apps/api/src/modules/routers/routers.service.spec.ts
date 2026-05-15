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
      secret: 'per-router-secret',
      type: 'mikrotik',
      enabled: true,
    })
    expect(createArgs.data.nasClient.create.shortname).toBe(createArgs.data.radiusClient.create.shortName)
  })
})
