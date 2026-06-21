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
    const service = new RoutersService(prisma as never, {} as never, credentials as never, {} as never, {} as never)
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
      routerHealthCheck: {
        create: jest.fn().mockResolvedValue({}),
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
      routerHealthCheck: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    }
    const credentials = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn(() => 'plain-radius-secret'),
      mask: jest.fn((value: string) => `${value.slice(0, 3)}***`),
      maskCiphertext: jest.fn(() => '********'),
    }
    const service = new RoutersService(prisma as never, {} as never, credentials as never, {} as never, {} as never)
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

  it('marks provisioning callback as config error when router self-test reports failure', async () => {
    const { service, tx } = buildCallbackHarness()

    const result = await service.markRouterProvisionedByKey('registration-key', '102.209.111.77', {
      status: 'failed',
      checks: 'hotspot=fail,bridge=ok,dhcp=ok,nat=ok,radius=fail,scheduler=ok,wireless=fail,files=ok',
      errors: 'hotspot_missing,radius_unreachable,no_wireless_or_ethernet_attached',
    })

    expect(result).toMatchObject({
      ok: false,
      callbackReceived: true,
      provisioningVerified: false,
      status: 'failed',
      errors: expect.arrayContaining([
        'hotspot_missing',
        'radius_unreachable',
        'no_wireless_or_ethernet_attached',
      ]),
    })
    expect(tx.router.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingStatus: 'CONFIG_ERROR',
          verificationStatus: 'FAILED',
          healthMessage: expect.stringContaining('Router self-test failed'),
        }),
      }),
    )
    expect(tx.routerHealthCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawPayload: expect.objectContaining({
            kind: 'mikrotik-provisioned-callback',
            reportStatus: 'failed',
            checks: expect.objectContaining({
              hotspot: 'fail',
              radius: 'fail',
              wireless: 'fail',
            }),
          }),
        }),
      }),
    )
  })

  it('records standalone MikroTik self-test reports', async () => {
    const { service, prisma, tx } = buildCallbackHarness()

    const result = await service.recordProvisioningSelfTestByKey('registration-key', '102.209.111.77', {
      status: 'ok',
      checks: 'hotspot=ok,bridge=ok,dhcp=ok,nat=ok,radius=ok,radius_config=ok,scheduler=ok,wireless=ethernet,files=ok',
      notes: 'ethernet_fallback',
    })

    expect(result).toMatchObject({
      ok: true,
      routerId: 'router-1',
      status: 'ok',
      notes: ['ethernet_fallback'],
    })
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(tx.router.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingStatus: 'WAITING_FOR_RADIUS',
          verificationStatus: 'OPERATOR_APPLIED',
          lastSeenAt: expect.any(Date),
        }),
      }),
    )
    expect(tx.routerHealthCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawPayload: expect.objectContaining({
            kind: 'mikrotik-self-test',
            reportStatus: 'ok',
          }),
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

  describe('runDeploymentTest', () => {
    function buildHarness() {
      const tx = {
        packageActivation: {
          create: jest.fn().mockResolvedValue({ id: 'activation-1' }),
          delete: jest.fn().mockResolvedValue({}),
        },
      }
      const prisma = {
        router: {
          findUnique: jest.fn().mockResolvedValue({ id: 'router-1', tenantId: 'tenant-1', name: 'Shop Router' }),
        },
        package: {
          findFirst: jest.fn().mockResolvedValue({ id: 'package-1' }),
        },
        $transaction: jest.fn((callback: any) => callback(tx)),
      }
      const credentials = { encrypt: jest.fn(), decrypt: jest.fn(), mask: jest.fn() }
      const mikrotik = {
        getRadiusServerConfig: jest.fn().mockReturnValue({
          host: 'radius.example.com',
          authPort: 1812,
          accountingPort: 1813,
          sharedSecret: 'platform-secret',
        }),
      }
      const radiusCredentials = {
        provisionForActivation: jest.fn().mockResolvedValue({
          username: 'arofi-voucher-test123',
          password: 'generated-password',
          status: 'ACTIVE',
        }),
        disableForActivation: jest.fn().mockResolvedValue({}),
      }
      const radiusProbe = { sendAccessRequest: jest.fn() }

      const service = new RoutersService(
        prisma as never,
        mikrotik as never,
        credentials as never,
        radiusCredentials as never,
        radiusProbe as never,
      )

      return { service, prisma, tx, radiusCredentials, radiusProbe }
    }

    it('reports overallOk=true and cleans up the synthetic credential on Access-Accept', async () => {
      const { service, tx, radiusCredentials, radiusProbe } = buildHarness()
      radiusProbe.sendAccessRequest.mockResolvedValue({ accepted: true, code: 2, latencyMs: 42 })

      const result = await service.runDeploymentTest('router-1', 'tenant-1')

      expect(result.overallOk).toBe(true)
      expect(result.steps).toEqual([
        expect.objectContaining({ name: 'voucher_provisioned', ok: true }),
        expect.objectContaining({ name: 'radius_access_request', ok: true }),
      ])
      expect(radiusProbe.sendAccessRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'arofi-voucher-test123',
          password: 'generated-password',
          nasIp: '203.0.113.1',
        }),
      )
      // Cleanup must always run so the synthetic test never leaves a real,
      // billable-looking credential or activation behind.
      expect(radiusCredentials.disableForActivation).toHaveBeenCalledWith(tx, 'activation-1', 'DISABLED')
      expect(tx.packageActivation.delete).toHaveBeenCalledWith({ where: { id: 'activation-1' } })
    })

    it('reports overallOk=false on Access-Reject but still cleans up', async () => {
      const { service, radiusCredentials, radiusProbe } = buildHarness()
      radiusProbe.sendAccessRequest.mockResolvedValue({ accepted: false, code: 3, latencyMs: 30 })

      const result = await service.runDeploymentTest('router-1', 'tenant-1')

      expect(result.overallOk).toBe(false)
      expect(result.steps[1]).toMatchObject({ name: 'radius_access_request', ok: false })
      expect(radiusCredentials.disableForActivation).toHaveBeenCalled()
    })

    it('fails closed with a clear message and no RADIUS attempt when no active package exists', async () => {
      const { service, prisma, radiusProbe } = buildHarness()
      prisma.package.findFirst.mockResolvedValue(null)

      const result = await service.runDeploymentTest('router-1', 'tenant-1')

      expect(result.overallOk).toBe(false)
      expect(result.steps).toEqual([
        expect.objectContaining({ name: 'voucher_provisioned', ok: false }),
      ])
      expect(radiusProbe.sendAccessRequest).not.toHaveBeenCalled()
    })

    it('still cleans up when the RADIUS server is unreachable', async () => {
      const { service, radiusCredentials, radiusProbe } = buildHarness()
      radiusProbe.sendAccessRequest.mockRejectedValue(new Error('did not respond within 5000ms'))

      const result = await service.runDeploymentTest('router-1', 'tenant-1')

      expect(result.overallOk).toBe(false)
      expect(result.steps[1]).toMatchObject({ name: 'radius_access_request', ok: false })
      expect(result.steps[1].detail).toContain('did not respond within 5000ms')
      expect(radiusCredentials.disableForActivation).toHaveBeenCalled()
    })

    it('throws NotFoundException for a router outside the caller tenant scope', async () => {
      const { service, prisma } = buildHarness()
      prisma.router.findUnique.mockResolvedValue({ id: 'router-1', tenantId: 'tenant-other', name: 'Other' })

      await expect(service.runDeploymentTest('router-1', 'tenant-1')).rejects.toThrow('Router not found')
    })
  })

  describe('computeHealthScore', () => {
    const service = new RoutersService({} as never, {} as never, {} as never, {} as never, {} as never)
    const compute = (router: Record<string, unknown>) => (service as any).computeHealthScore(router)

    function withChecks(checks: Record<string, string>, overrides: Record<string, unknown> = {}) {
      return {
        healthChecks: [{ rawPayload: { checks } }],
        lastAuthSignalAt: null,
        lastAccountingSignalAt: null,
        ...overrides,
      }
    }

    it('scores 0 and is not production-ready with no report at all', () => {
      const result = compute({ healthChecks: [], lastAuthSignalAt: null, lastAccountingSignalAt: null })
      expect(result.score).toBe(0)
      expect(result.criticalOk).toBe(false)
      expect(result.productionReady).toBe(false)
    })

    it('caps below productionReady when scripts pass but no real client has ever authenticated', () => {
      const allOk = {
        nat: 'ok', dhcp: 'ok', hotspot: 'ok', radius: 'ok', radius_config: 'ok',
        bridge: 'ok', bridge_port: 'ok', files: 'ok', scheduler: 'ok', wireless: 'ok',
      }
      const result = compute(withChecks(allOk))
      // Script-only checks max out at 60/100 — Failure #9: script success != deployment success.
      expect(result.score).toBe(60)
      expect(result.criticalOk).toBe(true)
      expect(result.productionReady).toBe(false)
    })

    it('is productionReady only once critical checks AND real auth AND real accounting all hold', () => {
      const allOk = {
        nat: 'ok', dhcp: 'ok', hotspot: 'ok', radius: 'ok', radius_config: 'ok',
        bridge: 'ok', bridge_port: 'ok', files: 'ok', scheduler: 'ok', wireless: 'ok',
      }
      const result = compute(
        withChecks(allOk, { lastAuthSignalAt: new Date(), lastAccountingSignalAt: new Date() }),
      )
      expect(result.score).toBe(100)
      expect(result.productionReady).toBe(true)
    })

    it('marks criticalOk=false when NAT is missing even if other checks pass (Failure #1)', () => {
      const result = compute(withChecks({ nat: 'fail', dhcp: 'ok', hotspot: 'ok', radius: 'ok', radius_config: 'ok' }))
      expect(result.criticalOk).toBe(false)
    })
  })

  describe('computeDriftScore', () => {
    const service = new RoutersService({} as never, {} as never, {} as never, {} as never, {} as never)
    const compute = (reports: Array<{ reportStatus: string; checks: Record<string, string> }>) =>
      (service as any).computeDriftScore(reports)

    it('returns null when there is no report yet', () => {
      expect(compute([])).toBeNull()
    })

    it('returns null when nothing has ever fully passed', () => {
      expect(compute([{ reportStatus: 'failed', checks: { nat: 'fail' } }])).toBeNull()
    })

    it('returns 100 when nothing has drifted since the last passing baseline', () => {
      const reports = [
        { reportStatus: 'ok', checks: { nat: 'ok', dhcp: 'ok', hotspot: 'ok' } }, // latest (index 0)
        { reportStatus: 'ok', checks: { nat: 'ok', dhcp: 'ok', hotspot: 'ok' } }, // baseline (oldest)
      ]
      expect(compute(reports)).toBe(100)
    })

    it('drops proportionally when a previously-passing check regresses', () => {
      const reports = [
        { reportStatus: 'failed', checks: { nat: 'fail', dhcp: 'ok', hotspot: 'ok' } }, // latest
        { reportStatus: 'ok', checks: { nat: 'ok', dhcp: 'ok', hotspot: 'ok' } }, // baseline
      ]
      expect(compute(reports)).toBe(67) // 2 of 3 baseline-ok checks still ok
    })
  })
})
