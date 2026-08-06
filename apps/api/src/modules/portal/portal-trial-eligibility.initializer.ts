import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { PortalService } from './portal.service'

type MutablePortalService = PortalService & {
  getContext: (...args: any[]) => Promise<any>
}

/**
 * Adds device-scoped trial eligibility to the portal context and removes free
 * trial packages after the current MAC address or client IP has used one.
 * This mirrors the server-side protection in startTrial, so the UI and the
 * activation rule cannot disagree.
 */
@Injectable()
export class PortalTrialEligibilityInitializer implements OnModuleInit {
  constructor(
    private readonly portalService: PortalService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const service = this.portalService as MutablePortalService
    const original = service.getContext.bind(service)

    service.getContext = async (...args: any[]) => {
      const result = await original(...args)
      const hotspot = (args[3] ?? {}) as {
        macAddress?: string
        ipAddress?: string
      }
      const tenantId = result?.tenant?.id as string | undefined
      const macAddress = this.normalizeMac(hotspot.macAddress)
      const ipAddress = hotspot.ipAddress?.trim() || undefined
      const identityFilters: Array<Record<string, string>> = []

      if (macAddress) identityFilters.push({ boundMacAddress: macAddress })
      if (ipAddress) identityFilters.push({ firstSeenIp: ipAddress })

      let previousTrial: { id: string; status: string; endsAt: Date } | null = null
      if (tenantId && identityFilters.length > 0) {
        previousTrial = await this.prisma.packageActivation.findFirst({
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
      }

      const eligible = identityFilters.length > 0 && !previousTrial
      const packages = Array.isArray(result?.packages)
        ? result.packages.filter((pkg: any) => eligible || !this.isTrialPackage(pkg))
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
                ? 'This device has already used its free trial.'
                : null,
        },
      }
    }
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
