import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { AccountType, FeatureLimitCategory, ReferralRelationshipStatus, WalletOwnerType } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { AuthService } from '../auth/auth.module'
import { RoleCatalogService } from '../auth/role-catalog.service'
import { MailService } from '../mail/mail.service'
import { SmsService } from '../sms/sms.service'
import { RegisterTenantDto } from './dto/register-tenant.dto'

const DEFAULT_FEATURE_LIMITS = [
  {
    code: 'packages',
    name: 'Package Catalog',
    category: FeatureLimitCategory.CATALOG,
    description: 'Maximum number of package SKUs available to the business.',
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
    description: 'Monitoring target for onboarded MikroTik devices. Routers are unlimited.',
    unit: 'routers',
    isEnabled: true,
    limitValue: 9999,
    warningThresholdPct: 80,
    hardLimit: false,
  },
  {
    code: 'hotspots',
    name: 'Hotspot Sites',
    category: FeatureLimitCategory.NETWORK,
    description: 'Monitoring target for hotspot sites. Sites are unlimited.',
    unit: 'sites',
    isEnabled: true,
    limitValue: 9999,
    warningThresholdPct: 80,
    hardLimit: false,
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
    description: 'Target open support queue size for the business.',
    unit: 'tickets',
    isEnabled: true,
    limitValue: 15,
    warningThresholdPct: 80,
    hardLimit: false,
  },
] as const

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly roleCatalogService: RoleCatalogService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  async completeOnboarding(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        tenantSettings: { select: { routerOnboardingPreferences: true } },
        users: { orderBy: { createdAt: 'asc' }, take: 1, select: { email: true, firstName: true, lastName: true } },
      },
    })

    if (!tenant) {
      throw new BadRequestException('Business not found')
    }

    const prefs = (tenant.tenantSettings?.routerOnboardingPreferences as Record<string, unknown> | null) ?? {}
    const alreadySent = Boolean(prefs.onboardingCompletedAt)
    const recipientEmail = tenant.supportEmail ?? tenant.users[0]?.email

    if (!alreadySent && recipientEmail) {
      const recipientName = tenant.users[0] ? `${tenant.users[0].firstName} ${tenant.users[0].lastName}`.trim() : tenant.name
      await this.mailService.sendOnboardingCompleteEmail({
        to: recipientEmail,
        tenantName: tenant.name,
        recipientName: recipientName || tenant.name,
      })

      await this.prisma.tenantSetting.upsert({
        where: { tenantId },
        update: { routerOnboardingPreferences: { ...prefs, onboardingCompletedAt: new Date().toISOString() } as Prisma.InputJsonValue },
        create: { tenantId, routerOnboardingPreferences: { ...prefs, onboardingCompletedAt: new Date().toISOString() } as Prisma.InputJsonValue },
      })
    }

    return { ok: true, emailSent: !alreadySent && Boolean(recipientEmail) }
  }

  async registerTenant(dto: RegisterTenantDto) {
    try {
      return await this._registerTenant(dto)
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      this.logger.error('registerTenant failed', error instanceof Error ? error.stack : String(error))
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Workspace creation failed — check server logs',
      )
    }
  }

  private async _registerTenant(dto: RegisterTenantDto) {
    // Ensure standard roles exist before every registration attempt
    await this.roleCatalogService.ensureStandardRoles()

    const tenantName = dto.tenantName.trim()
    const email = dto.email.trim().toLowerCase()
    const firstName = dto.firstName.trim()
    const lastName = dto.lastName.trim()
    const supportPhone = (dto.supportPhone ?? dto.phoneNumber).trim()
    const supportEmail = dto.supportEmail?.trim().toLowerCase() ?? email
    const brandColor = this.resolveBrandColor(dto.brandColor, tenantName)
    const domain = await this.resolveTenantDomain(dto.desiredDomain, tenantName)
    const accountType = dto.accountType ?? 'WIFI_VENDOR'
    const referralCode = dto.referralCode?.trim().toUpperCase() || null

    const [existingUser, role, platformSettings, referrerProfile] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      this.prisma.role.findUnique({
        where: { name: accountType === 'RESELLER' ? 'ResellerPartner' : 'VendorAdmin' },
        select: { id: true, name: true },
      }),
      this.prisma.platformSetting.upsert({
        where: { id: 'global' },
        update: {},
        create: { id: 'global' },
        select: { referralProgramEnabled: true, resellerRegistrationEnabled: true },
      }),
      referralCode
        ? this.prisma.referralProfile.findUnique({
            where: { code: referralCode },
            include: { user: { select: { email: true, tenantId: true } } },
          })
        : null,
    ])

    if (existingUser) {
      throw new BadRequestException('An account with that email already exists')
    }

    if (!role) {
      throw new BadRequestException('Business admin role is not configured yet')
    }
    if (accountType === 'RESELLER' && !platformSettings.resellerRegistrationEnabled) {
      throw new BadRequestException('Reseller registration is currently disabled')
    }
    if (referralCode && (!platformSettings.referralProgramEnabled || !referrerProfile)) {
      throw new BadRequestException('Referral code is invalid or inactive')
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const primaryHotspotSecret = `HS-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
    const ownReferralCode = await this.generateReferralCode(tenantName)

    const workspace = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          domain,
          brandColor,
          portalTemplate: dto.portalTemplate ?? 'classic',
          supportPhone,
          supportEmail,
        },
      })

      const wallet = accountType === 'WIFI_VENDOR'
        ? await tx.wallet.create({
            data: {
              tenantId: tenant.id,
              ownerType: WalletOwnerType.TENANT,
              ownerReference: tenant.id,
            },
          })
        : null

      const routerGroup = accountType === 'WIFI_VENDOR'
        ? await tx.routerGroup.create({
            data: {
              tenantId: tenant.id,
              name: 'Primary Site',
              code: 'PRIMARY',
              description: 'Automatically provisioned during business onboarding.',
              region: 'Main location',
            },
          })
        : null

      const hotspot = accountType === 'WIFI_VENDOR'
        ? await tx.hotspot.create({
            data: {
              tenantId: tenant.id,
              name: `${tenantName} Main Hotspot`,
              secret: primaryHotspotSecret,
            },
          })
        : null

      await tx.tenantSetting.create({
        data: {
          tenantId: tenant.id,
          subscriptionPlan: 'FREE',
          routerOnboardingPreferences: {
            selectedPlan: 'FREE',
            subscriptionStatus: 'ACTIVE',
            selfServiceOnboarding: true,
            onboardingStartedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      })

      if (accountType === 'WIFI_VENDOR') {
        await tx.featureLimit.createMany({
          data: DEFAULT_FEATURE_LIMITS.map((limit) => ({
            tenantId: tenant.id,
            ...limit,
          })),
        })
      }

      const user = await tx.user.create({
        data: {
          email,
          password: passwordHash,
          firstName,
          lastName,
          roleId: role.id,
          tenantId: tenant.id,
          accountType: accountType as AccountType,
        },
      })

      const referralProfile = await tx.referralProfile.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          code: ownReferralCode,
        },
      })

      if (referrerProfile) {
        const isSelfReferralSignal =
          referrerProfile.user.email.toLowerCase() === email ||
          Boolean(referrerProfile.user.tenantId && referrerProfile.user.tenantId === tenant.id)
        await tx.referralRelationship.create({
          data: {
            referrerProfileId: referrerProfile.id,
            referredTenantId: tenant.id,
            referredUserId: user.id,
            referralCode,
            status: isSelfReferralSignal ? ReferralRelationshipStatus.SUSPICIOUS : ReferralRelationshipStatus.PENDING,
            suspiciousReason: isSelfReferralSignal ? 'Self-referral signal matched at registration' : null,
            source: 'self-service-registration',
          },
        })
      }

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
              accountType,
            },
          },
          {
            tenantId: tenant.id,
            userId: user.id,
            actorName: `${firstName} ${lastName}`,
            actorEmail: email,
            action: 'referral.profile_created',
            entity: 'ReferralProfile',
            entityId: referralProfile.id,
            details: {
              code: ownReferralCode,
              accountType,
              referredBy: referralCode,
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

    // Notify the platform team about every new business, and welcome the
    // owner — fire-and-forget so a mail hiccup never fails a registration.
    void this.mailService.sendMail({
      to: process.env.SUPPORT_EMAIL || 'support@arofi.net',
      subject: `New business onboarded: ${tenantName}`,
      html: `<p>A new business just registered on AROFi.</p>
        <p><strong>Business:</strong> ${tenantName} (${domain})<br/>
        <strong>Owner:</strong> ${firstName} ${lastName} · ${email} · ${supportPhone}</p>
        <p>Their compliance submission will appear under Compliance Reviews once they complete it.</p>`,
    })
    void this.mailService.sendMail({
      to: email,
      subject: 'Welcome to AROFi — your business workspace is ready',
      html: `<p>Hello ${firstName},</p>
        <p>Your AROFi workspace for <strong>${tenantName}</strong> is ready. Next steps:</p>
        <ol>
          <li>Add your MikroTik router from the dashboard (one paste-in command).</li>
          <li>Create your WiFi packages and voucher batches.</li>
          <li>Complete the Compliance section so our team can verify your business — AROFi is built for authorised, compliant operators.</li>
        </ol>
        <p>Need help? Reply to this email, message us on WhatsApp (+256 787 726 388), or ask Aria — the assistant in the corner of your dashboard.</p>`,
    })

    // Immediate SMS alert to platform admin (0787726388) on new signup
    const adminNotifyPhone = process.env.ADMIN_NOTIFY_PHONE || '0787726388'
    const registrationSms = `AROFi New Registration!\nBusiness: ${tenantName}\nOwner: ${firstName} ${lastName}\nPhone: ${supportPhone}\nEmail: ${email}\nDomain: ${domain}\nType: ${accountType}`.slice(0, 480)
    void this.smsService.sendText({
      to: adminNotifyPhone,
      body: registrationSms,
      requirePaidPlan: false,
      templateKey: 'admin_signup_alert',
    })

    // Welcome SMS to business owner's support phone
    const welcomeSms = `Welcome to AROFi, ${firstName}! Your business workspace '${tenantName}' is ready. Log in at https://arofi.net to set up your router.`
    void this.smsService.sendText({
      to: supportPhone,
      body: welcomeSms,
      requirePaidPlan: false,
      templateKey: 'welcome_tenant',
    })

    return {
      ...session,
      tenant: {
        id: workspace.tenant.id,
        name: workspace.tenant.name,
        domain: workspace.tenant.domain,
        brandColor: workspace.tenant.brandColor,
        portalTemplate: workspace.tenant.portalTemplate,
        supportPhone: workspace.tenant.supportPhone,
        supportEmail: workspace.tenant.supportEmail,
      },
      starterWorkspace: {
        wallet: workspace.wallet ? {
          id: workspace.wallet.id,
          balanceUgx: workspace.wallet.balanceUgx,
          currency: workspace.wallet.currency,
        } : null,
        primaryRouterGroup: workspace.routerGroup ? {
          id: workspace.routerGroup.id,
          name: workspace.routerGroup.name,
          code: workspace.routerGroup.code,
        } : null,
        primaryHotspot: workspace.hotspot ? {
          id: workspace.hotspot.id,
          name: workspace.hotspot.name,
          secret: workspace.hotspot.secret,
        } : null,
        referralCode: ownReferralCode,
      },
      onboarding: {
        checklist: accountType === 'RESELLER' ? [
          {
            title: 'Open your reseller dashboard',
            description: 'Your referral partner workspace is ready.',
            path: '/dashboard',
          },
          {
            title: 'Share your referral link',
            description: 'Invite WiFi businesses and track qualified referrals.',
            path: '/referrals',
          },
        ] : [
          {
            title: 'Open the business console',
            description: 'Your workspace is ready immediately with your business admin account.',
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
      throw new BadRequestException('A valid business domain could not be generated')
    }

    const baseDomain = normalizedBase.includes('.')
      ? normalizedBase
      : `${normalizedBase}.wifi.arofi`

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

  private async generateReferralCode(seed: string) {
    const prefix = this.slugify(seed).replace(/-/g, '').slice(0, 6).toUpperCase() || 'AROFI'

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `${prefix}${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`
      const existing = await this.prisma.referralProfile.findUnique({
        where: { code },
        select: { id: true },
      })
      if (!existing) {
        return code
      }
    }

    return `AROFI${Date.now().toString(36).toUpperCase()}`
  }
}
