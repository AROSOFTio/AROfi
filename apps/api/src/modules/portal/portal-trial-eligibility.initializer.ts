import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { PortalService } from './portal.service'

type MutablePortalService = PortalService & {
  getContext: (...args: any[]) => Promise<any>
  startTrial: (...args: any[]) => Promise<any>
}

/**
 * Keeps free-trial visibility and activation rules aligned for every tenant.
 * Trial packages are explicitly marked in the portal response, hidden after a
 * device has used a trial in that tenant, and protected again before the core
 * activation method runs.
 */
@Injectable()
export class PortalTrialEligibilityInitializer implements OnModuleInit {
  constructor(
    private readonly portalService: PortalService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const service = this.portalService as MutablePortalService
    const originalGetContext = service.getContext.bind(service)
    const originalStartTrial = service.startTrial.bind(service)

    service.getContext = async (...args: any[]) => {
      const result = await originalGetContext(...args)
      const hotspot = (args[3] ?? {}) as {
        macAddress?: string
        ipAddress?: string
      }
      const tenantId = result?.tenant?.id as string | undefined
      const macAddress = this.normalizeMac(hotspot.macAddress)
      const ipAddress = hotspot.ipAddress?.trim() || undefined
      const identityFilters = this.buildIdentityFilters(macAddress, ipAddress)
      const packageIds = Array.isArray(result?.packages)
        ? result.packages
            .map((pkg: any) => pkg?.id)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        : []

      const [previousTrial, packageFlags] = await Promise.all([
        tenantId && identityFilters.length > 0
          ? this.prisma.packageActivation.findFirst({
              where: {
                tenantId,
                metadata: {
                  path: ['trial'],
                  equals: true,
                } as any,
                OR: identityFilters as any,
              },
              select: {
                id: true,
                status: true,
                endsAt: true,
              },
              orderBy: { createdAt: 'desc' },
            })
          : null,
        tenantId && packageIds.length > 0
          ? this.prisma.package.findMany({
              where: {
                tenantId,
                id: { in: packageIds },
              },
              select: {
                id: true,
                isTrialEnabled: true,
              },
            })
          : [],
      ])

      const trialFlagByPackageId = new Map<string, boolean>(
        packageFlags.map(
          (pkg): [string, boolean] => [pkg.id, Boolean(pkg.isTrialEnabled)],
        ),
      )
      const eligible = identityFilters.length > 0 && !previousTrial
      const packages = Array.isArray(result?.packages)
        ? result.packages
            .map((pkg: any) => ({
              ...pkg,
              isTrialEnabled:
                trialFlagByPackageId.get(pkg?.id) ?? Boolean(pkg?.isTrialEnabled),
            }))
            .filter((pkg: any) => eligible || !this.isTrialPackage(pkg))
        : result?.packages

      return {
        ...result,
        packages,
        trialEligibility: {
          eligible,
          used: Boolean(previousTrial),
          previousTrialStatus: previousTrial?.status ?? null,
          previousTrialEndsAt: previousTrial?.endsAt ?? null,
          reason:
            identityFilters.length === 0
              ? 'A MAC address or client IP is required for the one-time trial.'
              : previousTrial
                ? 'This device has already used its free trial for this business.'
                : null,
        },
      }
    }

    service.startTrial = async (dto: {
      packageId: string
      macAddress?: string
      clientIp?: string
      routerId?: string
      routerKey?: string
      hotspotServerName?: string
      loginUrl?: string
      sessionReference?: string
    }) => {
      const macAddress = this.normalizeMac(dto.macAddress)
      const ipAddress = dto.clientIp?.trim() || undefined
      const identityFilters = this.buildIdentityFilters(macAddress, ipAddress)

      const router = dto.routerKey
        ? await this.prisma.router.findUnique({
            where: { registrationKey: dto.routerKey },
            select: { tenantId: true },
          })
        : dto.routerId
          ? await this.prisma.router.findUnique({
              where: { id: dto.routerId },
              select: { tenantId: true },
            })
          : null

      if (router?.tenantId && identityFilters.length > 0) {
        const previousTrial = await this.prisma.packageActivation.findFirst({
          where: {
            tenantId: router.tenantId,
            metadata: {
              path: ['trial'],
              equals: true,
            } as any,
            OR: identityFilters as any,
          },
          select: { id: true },
        })

        if (previousTrial) {
          throw new BadRequestException(
            'This device already used the free trial for this business. Use a paid package or a different device.',
          )
        }
      }

      // Prefer the stable MAC identity. HotSpot DHCP addresses are recycled;
      // sending both MAC and IP to the legacy check could deny a new customer
      // merely because another device previously held the same local IP.
      return originalStartTrial({
        ...dto,
        clientIp: macAddress ? undefined : dto.clientIp,
      })
    }
  }

  private buildIdentityFilters(macAddress?: string, ipAddress?: string) {
    if (macAddress) {
      return [{ boundMacAddress: macAddress }]
    }
    if (ipAddress) {
      return [{ firstSeenIp: ipAddress }]
    }
    return []
  }

  private isTrialPackage(pkg: any) {
    return Boolean(
      pkg?.isTrialEnabled === true ||
      Number(pkg?.amountUgx ?? 0) <= 0 ||
      /trial/i.test(`${pkg?.name ?? ''} ${pkg?.code ?? ''}`),
    )
  }

  private normalizeMac(value?: string | null) {
    if (!value) return undefined
    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) return undefined
    return compact.match(/.{1,2}/g)?.join(':')
  }
}
