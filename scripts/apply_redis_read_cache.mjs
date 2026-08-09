import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content)
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`)
  }
  return source.replace(before, after)
}

function patchPaymentsService() {
  const relativePath = 'apps/api/src/modules/payments/payments.service.ts'
  let source = read(relativePath)

  if (!source.includes("../../common/cache/redis-cache.service")) {
    source = replaceOnce(
      source,
      "import { PrismaService } from '../../prisma.service'\n",
      "import { PrismaService } from '../../prisma.service'\nimport { RedisCacheService } from '../../common/cache/redis-cache.service'\n",
      'payments RedisCacheService import',
    )
  }

  if (!source.includes('private readonly redisCache: RedisCacheService')) {
    source = replaceOnce(
      source,
      '    private readonly packageActivationService: PackageActivationService,\n    private readonly mailService: MailService,',
      '    private readonly packageActivationService: PackageActivationService,\n    private readonly redisCache: RedisCacheService,\n    private readonly mailService: MailService,',
      'payments RedisCacheService injection',
    )
  }

  if (!source.includes("buildKey('portal:catalog'")) {
    const startMarker = '  async getPortalContext('
    const endMarker = '\n  private resolveAvailablePaymentNetworks('
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    if (start < 0 || end < 0) {
      throw new Error('payments portal context method anchors not found')
    }

    const replacement = `  async getPortalContext(tenantDomain?: string, phoneNumber?: string, tenantId?: string) {
    const tenant = await this.resolvePortalTenant(tenantDomain, tenantId)
    const normalizedPhone = phoneNumber ? this.normalizePhoneNumber(phoneNumber) : null
    const phoneVariants = normalizedPhone
      ? Array.from(new Set([normalizedPhone, \`+\${normalizedPhone}\`, \`0\${normalizedPhone.slice(3)}\`]))
      : []

    const staticContextPromise = this.redisCache.remember(
      this.redisCache.buildKey('portal:catalog', { tenantId: tenant.id }),
      120,
      async () => {
        const [packages, platformSettings] = await Promise.all([
          this.prisma.package.findMany({
            where: {
              tenantId: tenant.id,
              status: PackageStatus.ACTIVE,
            },
            include: {
              prices: {
                orderBy: { startsAt: 'desc' },
              },
            },
            orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
          }),
          this.prisma.platformSetting.upsert({
            where: { id: 'global' },
            update: {},
            create: { id: 'global' },
          }),
        ])
        const readiness = this.paymentRouterService.getProviderReadiness()
        const availablePaymentNetworks = this.resolveAvailablePaymentNetworks(
          platformSettings.allowedPaymentNetworks,
          readiness,
        )

        return {
          tenant: {
            id: tenant.id,
            name: tenant.name,
            domain: tenant.domain,
            logoUrl: tenant.logoUrl,
            brandColor: tenant.brandColor,
            portalTemplate: tenant.portalTemplate,
            supportPhone: tenant.supportPhone,
            supportEmail: tenant.supportEmail,
            platformSupportPhone: tenant.supportPhone ? null : (platformSettings.supportPhone ?? null),
            platformSupportEmail: tenant.supportEmail ? null : (platformSettings.supportEmail ?? null),
          },
          packages: packages
            .map((pkg) => {
              const activePrice = pkg.prices.find((price) => price.endsAt === null) ?? pkg.prices[0]
              return {
                id: pkg.id,
                name: pkg.name,
                code: pkg.code,
                description: pkg.description,
                durationMinutes: pkg.durationMinutes,
                dataLimitMb: pkg.dataLimitMb,
                deviceLimit: pkg.deviceLimit,
                downloadSpeedKbps: pkg.downloadSpeedKbps,
                uploadSpeedKbps: pkg.uploadSpeedKbps,
                isFeatured: pkg.isFeatured,
                amountUgx: activePrice?.amountUgx ?? 0,
              }
            })
            .sort((a, b) => {
              if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
              return a.amountUgx - b.amountUgx
            }),
          paymentNetworks: availablePaymentNetworks,
        }
      },
    )

    const [staticContext, activeActivation, latestPayment] = await Promise.all([
      staticContextPromise,
      normalizedPhone
        ? this.prisma.packageActivation.findFirst({
            where: {
              tenantId: tenant.id,
              OR: [
                { accessPhoneNumber: { in: phoneVariants } },
                { customerReference: { in: phoneVariants } },
              ],
              status: PackageActivationStatus.ACTIVE,
              endsAt: { gt: new Date() },
            },
            include: {
              package: {
                select: { id: true, name: true, code: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : null,
      normalizedPhone
        ? this.prisma.payment.findFirst({
            where: {
              tenantId: tenant.id,
              phoneNumber: normalizedPhone,
            },
            include: this.paymentInclude,
            orderBy: { createdAt: 'desc' },
          })
        : null,
    ])

    return {
      ...staticContext,
      activeActivation,
      latestPayment,
    }
  }
`

    source = source.slice(0, start) + replacement + source.slice(end)
  }

  write(relativePath, source)
}

function patchReportsService() {
  const relativePath = 'apps/api/src/modules/reports/reports.service.ts'
  let source = read(relativePath)

  if (!source.includes('this.fetchRows(type, filters, tenantId, 50)')) {
    source = replaceOnce(
      source,
      '    const rows = await this.fetchRows(type, filters, tenantId)\n    return {\n      type,\n      total: rows.length,\n      rows: rows.slice(0, 50),\n    }',
      '    const rows = await this.fetchRows(type, filters, tenantId, 50)\n    return {\n      type,\n      total: rows.length,\n      rows,\n    }',
      'report preview row limit',
    )

    source = replaceOnce(
      source,
      '  private async fetchRows(type: ReportType, filters: ReportFilters, tenantId?: string) {',
      '  private async fetchRows(type: ReportType, filters: ReportFilters, tenantId?: string, limit = 20_000) {',
      'report fetchRows limit parameter',
    )
    source = source
      .replace('return this.fetchSalesRows(filters, tenantId)', 'return this.fetchSalesRows(filters, tenantId, limit)')
      .replace('return this.fetchDisbursementRows(filters, tenantId)', 'return this.fetchDisbursementRows(filters, tenantId, limit)')
      .replace('return this.fetchVoucherRows(filters, tenantId)', 'return this.fetchVoucherRows(filters, tenantId, limit)')
      .replace(
        '  private async fetchSalesRows(filters: ReportFilters, tenantId?: string) {',
        '  private async fetchSalesRows(filters: ReportFilters, tenantId: string | undefined, limit: number) {',
      )
      .replace(
        '  private async fetchDisbursementRows(filters: ReportFilters, tenantId?: string) {',
        '  private async fetchDisbursementRows(filters: ReportFilters, tenantId: string | undefined, limit: number) {',
      )
      .replace(
        '  private async fetchVoucherRows(filters: ReportFilters, tenantId?: string) {',
        '  private async fetchVoucherRows(filters: ReportFilters, tenantId: string | undefined, limit: number) {',
      )

    const takeCount = source.split('take: 20_000').length - 1
    if (takeCount !== 3) {
      throw new Error(`report query limits: expected 3 take clauses, found ${takeCount}`)
    }
    source = source.replaceAll('take: 20_000', 'take: limit')
  }

  write(relativePath, source)
}

patchPaymentsService()
patchReportsService()
console.log('Redis read-cache source optimizations applied')
