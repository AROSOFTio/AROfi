import { PackageActivationStatus, RouterCompensationMode, RouterConnectionMode, RouterOutageStatus, RouterScriptMode } from '@prisma/client'
import { RoutersService } from './routers.service'

describe('RoutersService', () => {
  beforeAll(() => {
    process.env.RADIUS_SHARED_SECRET = 'bootstrap-only-use-router-specific-secrets'
  })

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
      platformSetting: {
        upsert: jest.fn().mockResolvedValue({
          freeRouterLimit: null,
          proRouterLimit: null,
          enterpriseRouterLimit: null,
        }),
      },
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      router: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'router-1' }),
      },
    }
    const credentials = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      mask: jest.fn((value: string) => `${value.slice(0, 3)}***`),
    }
    const service = new RoutersService(prisma as never, {} as never, credentials as never, {} as never, { publish: jest.fn() } as never, { sendMail: jest.fn(), sendOperationalAlertEmail: jest.fn() } as never, { provisionForActivation: jest.fn() } as never, { sendText: jest.fn() } as never)
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
      secret: 'bootstrap-only-use-router-specific-secrets',
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
      siteLabel: 'Kampala Shop',
      locationText: 'Kampala Road',
      lastScriptMode: RouterScriptMode.FRESH_FULL_CAPTIVE_WIFI,
      activeSessionCount: 0,
      tenant: {
        id: 'tenant-1',
        name: 'Shop WiFi',
        domain: 'shop.wifi.arofi',
      },
      group: {
        id: 'group-1',
        name: 'Main Site',
        code: 'MAIN',
      },
      hotspot: {
        id: 'hotspot-1',
        name: 'Shop Hotspot',
        nasIpAddress: null,
      },
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      hotspot: {
        create: jest.fn().mockResolvedValue({ id: 'access-point-1' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      networkSession: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      platformSetting: {
        upsert: jest.fn().mockResolvedValue({ smsNotificationTemplates: null }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    }
    const credentials = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn(() => 'plain-radius-secret'),
      mask: jest.fn((value: string) => `${value.slice(0, 3)}***`),
      maskCiphertext: jest.fn(() => '********'),
    }
    const sms = { sendText: jest.fn().mockResolvedValue(true) }
    const service = new RoutersService(prisma as never, {} as never, credentials as never, {} as never, { publish: jest.fn() } as never, { sendMail: jest.fn(), sendOperationalAlertEmail: jest.fn() } as never, { provisionForActivation: jest.fn() } as never, sms as never)
    jest.spyOn(service as any, 'reloadFreeradiusNasClients').mockImplementation(() => undefined)

    return { service, prisma, tx, credentials, sms }
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

  it('sends an admin SMS when a MikroTik provisioning script completes', async () => {
    const { service, sms } = buildCallbackHarness()

    await service.markRouterProvisionedByKey('registration-key', '102.209.111.77')

    expect(sms.sendText).toHaveBeenCalledWith(expect.objectContaining({
      to: '0787726388',
      requirePaidPlan: false,
      templateKey: 'admin_router_onboarding_success',
      body: expect.stringContaining('AROFi router script OK'),
    }))
    expect(sms.sendText.mock.calls[0][0].body).toContain('Business: Shop WiFi')
    expect(sms.sendText.mock.calls[0][0].body).toContain('Router: Shop Router')
    expect(sms.sendText.mock.calls[0][0].body).toContain('Location: Kampala Road')
    expect(sms.sendText.mock.calls[0][0].body).toContain('/api/mikrotik/script/registration-key')
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
          secret: 'bootstrap-only-use-router-specific-secrets',
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

  describe('remote access allocation', () => {
    it('allocates the lowest free deterministic 10.8.0.x endpoint', async () => {
      const prisma = {
        router: {
          findMany: jest.fn().mockResolvedValue([
            { remotePort: 31000, remoteSstpIp: '10.8.0.2' },
            { remotePort: 31002, remoteSstpIp: '10.8.0.4' },
          ]),
        },
      }
      const service = new RoutersService(prisma as never, {} as never, {} as never, {} as never, { publish: jest.fn() } as never, { sendMail: jest.fn(), sendOperationalAlertEmail: jest.fn() } as never, { provisionForActivation: jest.fn() } as never, { sendText: jest.fn() } as never)

      await expect((service as any).allocateRemoteAccessEndpoint()).resolves.toEqual({
        remotePort: 31001,
        remoteSstpIp: '10.8.0.3',
      })
    })

    it('generates a RouterOS 6-compatible SSTP client script that cannot become a default route', async () => {
      const prisma = {
        router: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'router-1',
            name: 'Shop Router',
            remoteClientName: 'AROFI_REMOTE',
          }),
        },
      }
      const service = new RoutersService(prisma as never, {} as never, {} as never, {} as never, { publish: jest.fn() } as never, { sendMail: jest.fn(), sendOperationalAlertEmail: jest.fn() } as never, { provisionForActivation: jest.fn() } as never, { sendText: jest.fn() } as never)

      const script = await service.getRemoteAccessInstallScript('token-1')

      expect(script).toContain('add-default-route=no')
      expect(script).toContain(':local sstpTarget "95.111.234.34"')
      expect(script).toContain(':local sstpPort "4443"')
      expect(script).toContain('connect-to=\\"" . $sstpTarget . "\\" port=" . $sstpPort')
      expect(script).toContain('connect-to=\\"" . $sstpTarget . ":" . $sstpPort')
      expect(script).toContain('chain=input in-interface="AROFI_REMOTE" protocol=tcp dst-port=8291,8728,8729 action=accept')
      expect(script).not.toContain('use-peer-dns=')
      expect(script).not.toContain('/system script add')
    })
  })
  describe('recordRouterHeartbeatByKey', () => {
    it('records heartbeat without updating database clients when IP has not changed', async () => {
      const router = buildCallbackRouter({ radiusNasIpAddress: '102.209.111.77' })
      const { service, prisma, tx } = buildCallbackHarness(router)

      const result = await service.recordRouterHeartbeatByKey('registration-key', '102.209.111.77', '0')

      expect(result).toEqual({ ok: true, activeUsers: 0 })
      expect(prisma.router.update).toHaveBeenCalled()
      expect(tx.radiusClient.update).not.toHaveBeenCalled()
      expect(tx.nasClient.update).not.toHaveBeenCalled()
      expect(service.reloadFreeradiusNasClients).not.toHaveBeenCalled()
    })

    it('records heartbeat without updating database clients even if IP changes', async () => {
      const router = buildCallbackRouter({ radiusNasIpAddress: '102.209.111.77' })
      const { service, prisma, tx } = buildCallbackHarness(router)

      const result = await service.recordRouterHeartbeatByKey('registration-key', '102.209.111.88', '0')

      expect(result).toEqual({ ok: true, activeUsers: 0 })
      expect(prisma.router.update).toHaveBeenCalled()
      expect(tx.radiusClient.update).not.toHaveBeenCalled()
      expect(tx.nasClient.update).not.toHaveBeenCalled()
      expect(service.reloadFreeradiusNasClients).not.toHaveBeenCalled()
    })

    it('marks active sessions stale when router heartbeat reports zero active users', async () => {
      const router = buildCallbackRouter({ activeSessionCount: 1, radiusNasIpAddress: '102.209.111.77' })
      const { service, prisma } = buildCallbackHarness(router)
      const realtimeEvents = (service as any).realtimeEvents as { publish: jest.Mock }
      prisma.networkSession.findMany.mockResolvedValue([
        {
          id: 'session-1',
          tenantId: 'tenant-1',
          routerId: 'router-1',
          radiusSessionId: 'radius-session-1',
          username: 'arofi-user',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          lastAccountingAt: new Date(),
        },
      ])

      const result = await service.recordRouterHeartbeatByKey('registration-key', '102.209.111.77', '0')

      expect(result).toEqual({ ok: true, activeUsers: 0 })
      expect(prisma.router.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activeSessionCount: 0 }),
        }),
      )
      expect(prisma.networkSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'STALE', endedAt: expect.any(Date) }),
        }),
      )
      expect(realtimeEvents.publish).toHaveBeenCalledWith(
        'session.stopped',
        expect.objectContaining({
          tenantId: 'tenant-1',
          routerId: 'router-1',
          data: expect.objectContaining({ source: 'router-heartbeat' }),
        }),
      )
    })

    it('automatically creates and links an access point on the first router heartbeat', async () => {
      const router = buildCallbackRouter({
        hotspotId: null,
        identity: 'shop-gateway',
        siteLabel: null,
        radiusNasIpAddress: null,
      })
      const { service, prisma } = buildCallbackHarness(router)

      await service.recordRouterHeartbeatByKey('registration-key', '102.209.111.77', '0')

      expect(prisma.hotspot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          name: 'shop-gateway Access Point',
          nasIpAddress: '102.209.111.77',
        }),
        select: { id: true },
      })
      expect(prisma.router.updateMany).toHaveBeenCalledWith({
        where: { id: 'router-1', hotspotId: null },
        data: { hotspotId: 'access-point-1' },
      })
    })
  })

  describe('sendRouterAlert email notifications', () => {
    function buildAlertHarness() {
      const mailService = {
        sendMail: jest.fn().mockResolvedValue(true),
        sendOperationalAlertEmail: jest.fn().mockResolvedValue(true),
      }
      const service = new RoutersService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { publish: jest.fn() } as never,
        mailService as never,
        { provisionForActivation: jest.fn() } as never,
        { sendText: jest.fn() } as never,
      )
      return { service, mailService }
    }

    it('emails the platform operator and the tenant support address on router offline', async () => {
      const { service, mailService } = buildAlertHarness()
      const router = {
        name: 'Shop Router',
        tenant: { name: 'Kampala Cafe', supportEmail: 'support@kampalacafe.example' },
        lastSeenAt: new Date('2026-01-01T00:00:00Z'),
      }

      await (service as any).sendRouterAlert(router, 'OFFLINE', 90)

      expect(mailService.sendOperationalAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('Router offline') }),
      )
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'support@kampalacafe.example',
          subject: expect.stringContaining('gone offline'),
        }),
      )
    })

    it('skips the tenant email when no support address is configured, but still alerts the operator', async () => {
      const { service, mailService } = buildAlertHarness()
      const router = { name: 'Shop Router', tenant: { name: 'Kampala Cafe' }, lastSeenAt: null }

      await (service as any).sendRouterAlert(router, 'ONLINE', 0)

      expect(mailService.sendOperationalAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('back online') }),
      )
      expect(mailService.sendMail).not.toHaveBeenCalled()
    })
  })

  it('extends packages by the outage overlap from router recovery time', async () => {
    const outage = {
      id: 'outage-1',
      tenantId: 'tenant-1',
      routerId: 'router-1',
      offlineAt: new Date('2026-07-31T10:00:00Z'),
      restoredAt: new Date('2026-07-31T11:00:00Z'),
      autoCompensate: true,
      affectedActivations: 0,
      totalSecondsCredited: 0,
      router: { id: 'router-1', tenantId: 'tenant-1', name: 'Main Router', hotspotId: 'hotspot-1' },
      compensations: [],
    }
    const activation = {
      id: 'activation-1',
      tenantId: 'tenant-1',
      status: PackageActivationStatus.EXPIRED,
      startedAt: new Date('2026-07-31T09:30:00Z'),
      endsAt: new Date('2026-07-31T10:30:00Z'),
      customerReference: 'customer-1',
      accessPhoneNumber: null,
      metadata: null,
      radiusCredential: { id: 'credential-1' },
      package: { name: '1 Hour' },
    }
    const tx = {
      packageActivation: {
        findUnique: jest.fn().mockResolvedValue(activation),
        update: jest.fn().mockResolvedValue({}),
      },
      radiusCredential: {
        update: jest.fn().mockResolvedValue({}),
      },
      routerCompensation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'comp-1', ...data })),
      },
    }
    const prisma = {
      routerOutage: {
        findUnique: jest.fn().mockResolvedValue(outage),
        update: jest.fn().mockResolvedValue({}),
      },
      packageActivation: {
        findMany: jest.fn().mockResolvedValue([activation]),
      },
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
      routerCompensation: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    }
    const realtime = { publish: jest.fn() }
    const mail = { sendMail: jest.fn().mockResolvedValue(false), sendOperationalAlertEmail: jest.fn() }
    const radiusCredentialService = { provisionForActivation: jest.fn().mockResolvedValue({}) }
    const service = new RoutersService(prisma as never, {} as never, {} as never, {} as never, realtime as never, mail as never, radiusCredentialService as never, { sendText: jest.fn().mockResolvedValue(false) } as never)

    await expect((service as any).processOutageCompensation('outage-1', RouterCompensationMode.AUTO)).resolves.toMatchObject({
      affectedActivations: 1,
      totalSecondsCredited: 1800,
    })

    expect(tx.packageActivation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'activation-1' },
        data: expect.objectContaining({
          status: PackageActivationStatus.ACTIVE,
          endsAt: new Date('2026-07-31T11:30:00Z'),
        }),
      }),
    )
    expect(radiusCredentialService.provisionForActivation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: 'tenant-1',
        activationId: 'activation-1',
        routerId: 'router-1',
      }),
    )
    expect(prisma.routerOutage.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'outage-1' },
        data: expect.objectContaining({
          status: RouterOutageStatus.COMPENSATED,
          affectedActivations: 1,
          totalSecondsCredited: 1800,
        }),
      }),
    )
  })
})
