import { BadRequestException, Injectable } from '@nestjs/common'
import { FeatureLimitCategory, WalletOwnerType } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { AuthService } from '../auth/auth.module'
import { RoleCatalogService } from '../auth/role-catalog.service'
import { RegisterTenantDto } from './dto/register-tenant.dto'

const DEFAULT_FEATURE_LIMITS = [
  {
    code: 'packages',
    name: 'Package Catalog',
    category: FeatureLimitCategory.CATALOG,
    description: 'Maximum number of package SKUs available to the tenant.',
    unit: 'packages',
    isEnabled: true,
    limitValue: 50,
    warningThresholdPct: 80,
    hardLimit: true,
  },
  {
    code: 'routers',
    name: 'Managed Routers',
    category: FeatureLimitCategory.NETWORK,
    description: 'Maximum number of onboarded MikroTik devices.',
    unit: 'routers',
    isEnabled: true,
    limitValue: 20,
    warningThresholdPct: 80,
    hardLimit: true,
  },
  {
    code: 'hotspots',
    name: 'Hotspot Sites',
    category: FeatureLimitCategory.NETWORK,
    description: 'Maximum number of hotspot sites under management.',
    unit: 'sites',
    isEnabled: true,
    limitValue: 25,
    warningThresholdPct: 80,
    hardLimit: true,
  },
  {
    code: 'agents',
    name: 'Agents and Resellers',
    category: FeatureLimitCategory.SALES,
    description: 'Maximum number of agents and resellers onboarded.',
    unit: 'agents',
    isEnabled: true,
    limitValue: 30,
    warningThresholdPct: 75,
    hardLimit: false,
  },
  {
    code: 'voucher_batches',
    name: 'Voucher Batches',
    category: FeatureLimitCategory.SALES,
    description: 'Total voucher batches that can remain active.',
    unit: 'batches',
    isEnabled: true,
    limitValue: 200,
    warningThresholdPct: 85,
    hardLimit: false,
  },
  {
    code: 'active_sessions',
    name: 'Concurrent Sessions',
    category: FeatureLimitCategory.OPERATIONS,
    description: 'Soft ceiling for concurrently tracked online sessions.',
    unit: 'sessions',
    isEnabled: true,
    limitValue: 5000,
    warningThresholdPct: 70,
    hardLimit: false,
  },
  {
    code: 'open_support_tickets',
    name: 'Open Support Tickets',
    category: FeatureLimitCategory.SUPPORT,
    description: 'Target open support queue size for the tenant.',
    unit: 'tickets',
    isEnabled: true,
    limitValue: 15,
    warningThresholdPct: 80,
    hardLimit: false,
  },
] as const

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly roleCatalogService: RoleCatalogService,
  ) {}

  async registerTenant(dto: RegisterTenantDto) {
    await this.roleCatalogService.ensureStandardRoles()

    const tenantName = dto.tenantName.trim()
    const email = dto.email.trim().toLowerCase()
    const firstName = dto.firstName.trim()
    const lastName = dto.lastName.trim()
    const supportPhone = (dto.supportPhone ?? dto.phoneNumber).trim()
    const supportEmail = dto.supportEmail?.trim().toLowerCase() ?? email
    const brandColor = this.resolveBrandColor(dto.brandColor, tenantName)
    const domain = await this.resolveTenantDomain(dto.desiredDomain, tenantName)

    const [existingUser, role] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      this.prisma.role.findUnique({
        where: { name: 'VendorAdmin' },
        select: { id: true, name: true },
      }),
    ])

    if (existingUser) {
      throw new BadRequestException('An account with that email already exists')
    }

    if (!role) {
      throw new BadRequestException('Vendor admin role is not configured yet')
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const primaryHotspotSecret = `HS-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`

    const workspace = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          domain,
          brandColor,
          supportPhone,
          supportEmail,
        },
      })

      const wallet = await tx.wallet.create({
        data: {
          tenantId: tenant.id,
          ownerType: WalletOwnerType.TENANT,
          ownerReference: tenant.id,
        },
      })

      const routerGroup = await tx.routerGroup.create({
        data: {
          tenantId: tenant.id,
          name: 'Primary Site',
          code: 'PRIMARY',
          description: 'Automatically provisioned during tenant onboarding.',
          region: 'Main location',
        },
      })

      const hotspot = await tx.hotspot.create({
        data: {
          tenantId: tenant.id,
          name: `${tenantName} Main Hotspot`,
          secret: primaryHotspotSecret,
        },
      })

      await tx.featureLimit.createMany({
        data: DEFAULT_FEATURE_LIMITS.map((limit) => ({
          tenantId: tenant.id,
          ...limit,
        })),
      })

      const user = await tx.user.create({
        data: {
          email,
          password: passwordHash,
          firstName,
          lastName,
          roleId: role.id,
          tenantId: tenant.id,
        },
      })

      await tx.auditLog.createMany({
        data: [
          {
            tenantId: tenant.id,
            userId: user.id,
            actorName: `${firstName} ${lastName}`,
            actorEmail: email,
            action: 'TENANT_SELF_REGISTERED',
            entity: 'Tenant',
            entityId: tenant.id,
            details: {
              domain,
              autoApproved: true,
              source: 'self-service',
            },
          },
          {
            tenantId: tenant.id,
            userId: user.id,
            actorName: `${firstName} ${lastName}`,
            actorEmail: email,
            action: 'TENANT_ADMIN_PROVISIONED',
            entity: 'User',
            entityId: user.id,
            details: {
              role: role.name,
              supportPhone,
              supportEmail,
            },
          },
        ],
      })

      return {
        tenant,
        wallet,
        routerGroup,
        hotspot,
        user,
      }
    })

    const session = await this.authService.issueSessionForUserId(workspace.user.id)

    return {
      ...session,
      tenant: {
        id: workspace.tenant.id,
        name: workspace.tenant.name,
        domain: workspace.tenant.domain,
        brandColor: workspace.tenant.brandColor,
        supportPhone: workspace.tenant.supportPhone,
        supportEmail: workspace.tenant.supportEmail,
      },
      starterWorkspace: {
        wallet: {
          id: workspace.wallet.id,
          balanceUgx: workspace.wallet.balanceUgx,
          currency: workspace.wallet.currency,
        },
        primaryRouterGroup: {
          id: workspace.routerGroup.id,
          name: workspace.routerGroup.name,
          code: workspace.routerGroup.code,
        },
        primaryHotspot: {
          id: workspace.hotspot.id,
          name: workspace.hotspot.name,
          secret: workspace.hotspot.secret,
        },
      },
      onboarding: {
        checklist: [
          {
            title: 'Open the tenant console',
            description: 'Your workspace is ready immediately with your vendor admin account.',
            path: '/dashboard',
          },
          {
            title: 'Connect your first MikroTik router',
            description: 'Use the Routers workspace to register the device and copy the generated provisioning script.',
            path: '/routers',
          },
          {
            title: 'Review your hotspot site',
            description: 'Your first hotspot placeholder was created automatically and can be updated before launch.',
            path: '/hotspots',
          },
          {
            title: 'Publish packages and vouchers',
            description: 'Create commercial packages, pricing, and voucher templates before going live.',
            path: '/packages',
          },
        ],
      },
    }
  }

  private async resolveTenantDomain(preferredDomain: string | undefined, tenantName: string) {
    const requested = preferredDomain?.trim().toLowerCase()
    const normalizedBase = requested
      ? requested.replace(/\s+/g, '-')
      : this.slugify(tenantName)

    if (!normalizedBase) {
      throw new BadRequestException('A valid tenant domain could not be generated')
    }

    const baseDomain = normalizedBase.includes('.')
      ? normalizedBase
      : `${normalizedBase}.tenant.arofi`

    let candidate = baseDomain
    let suffix = 2

    while (true) {
      const existing = await this.prisma.tenant.findUnique({
        where: { domain: candidate },
        select: { id: true },
      })

      if (!existing) {
        return candidate
      }

      const stem = baseDomain.includes('.')
        ? `${baseDomain.split('.').slice(0, -1).join('.')}-${suffix}.${baseDomain.split('.').slice(-1)[0]}`
        : `${baseDomain}-${suffix}`

      candidate = stem
      suffix += 1
    }
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
  }

  private resolveBrandColor(brandColor: string | undefined, tenantName: string) {
    if (brandColor?.trim()) {
      const normalized = brandColor.trim().toUpperCase()
      return normalized.startsWith('#') ? normalized : `#${normalized}`
    }

    const palette = ['#0EA5E9', '#10B981', '#F97316', '#E11D48', '#0F766E', '#2563EB']
    const seed = tenantName
      .split('')
      .reduce((total, character) => total + character.charCodeAt(0), 0)

    return palette[seed % palette.length]
  }
}
