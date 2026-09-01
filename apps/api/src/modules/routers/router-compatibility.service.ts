import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  RadiusEventType,
  RouterOnboardingStatus,
  RouterStatus,
  RouterVerificationStatus,
} from '@prisma/client'
import { randomBytes } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { MikrotikService } from './mikrotik.service'
import { RouterCredentialsService } from './router-credentials.service'
import { RoutersService } from './routers.service'
import type { RegisterCompatibleRouterDto, RouterCompatibilityVendor } from './dto/router-compatibility.dto'

type CompatibilityCapability = {
  key: string
  label: string
  support: 'FULL' | 'STANDARD' | 'MODEL_DEPENDENT'
}

type CompatibilityProfile = {
  vendor: RouterCompatibilityVendor
  label: string
  family: string
  integration: 'FIRST_CLASS' | 'RADIUS_PORTAL' | 'STANDARD_RADIUS'
  description: string
  nasType: string
  capabilities: CompatibilityCapability[]
  notes: string[]
}

const PROFILES: CompatibilityProfile[] = [
  {
    vendor: 'MIKROTIK',
    label: 'MikroTik',
    family: 'RouterOS',
    integration: 'FIRST_CLASS',
    description: 'Full AROFi RouterOS onboarding plus cloud RADIUS authentication and accounting.',
    nasType: 'mikrotik',
    capabilities: [
      { key: 'routeros_api', label: 'RouterOS API automation', support: 'FULL' },
      { key: 'radius', label: 'RADIUS authentication', support: 'FULL' },
      { key: 'accounting', label: 'RADIUS accounting', support: 'FULL' },
      { key: 'pppoe', label: 'PPPoE / bandwidth profiles', support: 'FULL' },
      { key: 'portal', label: 'Captive portal + vouchers', support: 'FULL' },
      { key: 'coa', label: 'Disconnect / CoA', support: 'FULL' },
    ],
    notes: ['Use the existing MikroTik onboarding screen when you want automatic RouterOS configuration and remote management.'],
  },
  {
    vendor: 'RUIJIE_REYEE',
    label: 'Ruijie Reyee',
    family: 'Reyee / Ruijie Cloud-managed Wi-Fi',
    integration: 'RADIUS_PORTAL',
    description: 'AROFi RADIUS, vouchers, payments and usage accounting behind a supported Reyee/Ruijie external authentication or portal flow.',
    nasType: 'other',
    capabilities: [
      { key: 'radius', label: 'RADIUS authentication', support: 'MODEL_DEPENDENT' },
      { key: 'accounting', label: 'RADIUS accounting', support: 'MODEL_DEPENDENT' },
      { key: 'portal', label: 'External captive portal', support: 'MODEL_DEPENDENT' },
      { key: 'vouchers', label: 'AROFi voucher management', support: 'FULL' },
      { key: 'analytics', label: 'Usage analytics from RADIUS', support: 'STANDARD' },
    ],
    notes: ['Reyee/Ruijie feature names and availability vary by gateway, AP, controller and firmware. Confirm that the deployed model exposes external RADIUS and/or external portal settings.'],
  },
  {
    vendor: 'TP_LINK_OMADA',
    label: 'TP-Link Omada',
    family: 'Omada SDN',
    integration: 'RADIUS_PORTAL',
    description: 'Omada RADIUS profile and accounting connected to AROFi, with AROFi handling paid access, vouchers and customer records.',
    nasType: 'other',
    capabilities: [
      { key: 'radius', label: 'RADIUS authentication', support: 'STANDARD' },
      { key: 'accounting', label: 'RADIUS accounting', support: 'STANDARD' },
      { key: 'portal', label: 'External portal', support: 'MODEL_DEPENDENT' },
      { key: 'payments', label: 'AROFi payment gateway', support: 'FULL' },
      { key: 'users', label: 'AROFi user/session management', support: 'FULL' },
    ],
    notes: ['Apply the AROFi RADIUS profile to the target Omada portal/SSID. External portal options depend on controller and device capability.'],
  },
  {
    vendor: 'UBIQUITI_UNIFI',
    label: 'Ubiquiti UniFi',
    family: 'UniFi Network',
    integration: 'RADIUS_PORTAL',
    description: 'UniFi authentication/accounting connected to AROFi for hotspot billing, Mobile Money, vouchers and client tracking.',
    nasType: 'other',
    capabilities: [
      { key: 'radius', label: 'RADIUS authentication', support: 'STANDARD' },
      { key: 'accounting', label: 'RADIUS accounting', support: 'STANDARD' },
      { key: 'portal', label: 'Hotspot / external portal', support: 'MODEL_DEPENDENT' },
      { key: 'payments', label: 'AROFi Mobile Money billing', support: 'FULL' },
      { key: 'tracking', label: 'RADIUS client tracking', support: 'STANDARD' },
    ],
    notes: ['UniFi Network versions differ in hotspot and external portal controls. RADIUS authentication/accounting remains the portable AROFi integration boundary.'],
  },
  {
    vendor: 'CISCO',
    label: 'Cisco',
    family: 'Standard AAA / RADIUS',
    integration: 'STANDARD_RADIUS',
    description: 'Standards-based AAA connection to AROFi FreeRADIUS.',
    nasType: 'cisco',
    capabilities: standardRadiusCapabilities(),
    notes: ['Exact AAA, portal and CoA commands depend on the Cisco product family and software release.'],
  },
  {
    vendor: 'HUAWEI',
    label: 'Huawei',
    family: 'Standard AAA / RADIUS',
    integration: 'STANDARD_RADIUS',
    description: 'Standards-based AAA connection to AROFi FreeRADIUS.',
    nasType: 'other',
    capabilities: standardRadiusCapabilities(),
    notes: ['Exact AAA, portal and CoA commands depend on the Huawei product family and software release.'],
  },
  {
    vendor: 'D_LINK',
    label: 'D-Link',
    family: 'Standard AAA / RADIUS',
    integration: 'STANDARD_RADIUS',
    description: 'Standards-based RADIUS connection where the deployed D-Link gateway/AP supports external AAA.',
    nasType: 'other',
    capabilities: standardRadiusCapabilities(true),
    notes: ['Confirm external RADIUS support on the exact model and firmware.'],
  },
  {
    vendor: 'CAMBIUM',
    label: 'Cambium Networks',
    family: 'Standard AAA / RADIUS',
    integration: 'STANDARD_RADIUS',
    description: 'Standards-based RADIUS authentication/accounting for supported Cambium gateways and WLAN platforms.',
    nasType: 'other',
    capabilities: standardRadiusCapabilities(),
    notes: ['Portal and CoA support depend on the Cambium product family and controller configuration.'],
  },
  {
    vendor: 'GENERIC_RADIUS',
    label: 'Other RADIUS Device',
    family: 'RFC-compatible AAA / RADIUS',
    integration: 'STANDARD_RADIUS',
    description: 'Connect any supported NAS/controller that can send RADIUS authentication and accounting to AROFi.',
    nasType: 'other',
    capabilities: standardRadiusCapabilities(true),
    notes: ['The device must support external RADIUS. Accounting and Disconnect/CoA are optional device capabilities, not assumptions made by AROFi.'],
  },
]

function standardRadiusCapabilities(modelDependent = false): CompatibilityCapability[] {
  return [
    { key: 'radius', label: 'RADIUS authentication', support: modelDependent ? 'MODEL_DEPENDENT' : 'STANDARD' },
    { key: 'accounting', label: 'RADIUS accounting', support: modelDependent ? 'MODEL_DEPENDENT' : 'STANDARD' },
    { key: 'vouchers', label: 'AROFi vouchers / credentials', support: 'FULL' },
    { key: 'analytics', label: 'Usage analytics from accounting', support: 'STANDARD' },
    { key: 'coa', label: 'Disconnect / CoA', support: 'MODEL_DEPENDENT' },
  ]
}

@Injectable()
export class RouterCompatibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: RouterCredentialsService,
    private readonly mikrotik: MikrotikService,
    private readonly routers: RoutersService,
  ) {}

  getProfiles() {
    const radius = this.mikrotik.getRadiusServerConfig?.()
    return {
      radius: {
        host: radius?.host ?? process.env.RADIUS_SERVER_HOST ?? null,
        authPort: radius?.authPort ?? 1812,
        accountingPort: radius?.accountingPort ?? 1813,
        coaPort: 3799,
      },
      profiles: PROFILES,
      guarantee: 'AROFi guarantees its own RADIUS, voucher, payment, accounting and session workflow. A specific router/controller must expose the corresponding RADIUS or external-portal capability in its model and firmware.',
    }
  }

  async register(tenantId: string, dto: RegisterCompatibleRouterDto) {
    const profile = this.requireProfile(dto.vendor)
    if (dto.vendor === 'MIKROTIK') {
      throw new BadRequestException('Use the first-class MikroTik onboarding screen for RouterOS automation. Use this compatibility registration only when intentionally connecting MikroTik as RADIUS-only.')
    }

    const name = dto.name.trim()
    const nasAddress = this.normalizeNasAddress(dto.nasAddress)
    const existing = await this.prisma.router.findFirst({
      where: { tenantId, OR: [{ name }, { host: nasAddress }] },
      select: { id: true, name: true, host: true },
    })
    if (existing) {
      throw new BadRequestException(`A router named ${existing.name} or NAS address ${existing.host} is already registered in this business.`)
    }

    const conflictingNas = await this.prisma.nasClient.findFirst({
      where: { nasname: nasAddress, enabled: true },
      select: { id: true, shortname: true },
    })
    if (conflictingNas) {
      throw new BadRequestException(`NAS source ${nasAddress} is already registered as ${conflictingNas.shortname}. Use the source IP/hostname that AROFi FreeRADIUS will actually see from this device.`)
    }

    const sharedSecret = this.normalizeSecret(dto.sharedSecret) || randomBytes(24).toString('base64url')
    const encryptedSecret = this.credentials.encrypt(sharedSecret)
    const shortName = this.buildShortName(name)
    const tags = [
      `integration-vendor:${dto.vendor}`,
      'integration-mode:RADIUS_STANDARD',
      `radius-auth-port:${dto.authPort ?? 1812}`,
      `radius-accounting-port:${dto.accountingPort ?? 1813}`,
      `radius-coa-port:${dto.coaPort ?? 3799}`,
    ]

    const router = await this.prisma.$transaction(async (tx) => {
      return tx.router.create({
        data: {
          tenantId,
          name,
          identity: name,
          host: nasAddress,
          apiPort: dto.authPort ?? 1812,
          username: 'radius-only',
          passwordCiphertext: this.credentials.encrypt(''),
          sharedSecretCiphertext: encryptedSecret,
          model: dto.model?.trim() || profile.family,
          siteLabel: dto.siteLabel?.trim() || null,
          status: RouterStatus.PENDING,
          verificationStatus: RouterVerificationStatus.OPERATOR_APPLIED,
          onboardingStatus: RouterOnboardingStatus.WAITING_FOR_RADIUS,
          radiusNasIpAddress: nasAddress,
          portalWalledGardenHosts: [],
          tags,
          remoteAccessEnabled: false,
          radiusClient: {
            create: {
              tenantId,
              shortName,
              ipAddress: nasAddress,
              secretCiphertext: encryptedSecret,
            },
          },
          nasClient: {
            create: {
              tenantId,
              nasname: nasAddress,
              shortname: shortName,
              type: profile.nasType,
              secret: sharedSecret,
              description: `AROFi ${profile.label} RADIUS client for ${name}`,
              enabled: true,
            },
          },
        },
        include: { tenant: { select: { name: true, domain: true } }, radiusClient: true, nasClient: true },
      })
    })

    this.routers.reloadFreeradiusNasClients()
    return this.buildSetup(router, profile, sharedSecret, dto.authPort ?? 1812, dto.accountingPort ?? 1813, dto.coaPort ?? 3799)
  }

  async getSetup(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findFirst({
      where: { id: routerId, ...(tenantId ? { tenantId } : {}) },
      include: { tenant: { select: { name: true, domain: true } }, radiusClient: true, nasClient: true },
    })
    if (!router) throw new NotFoundException('Router not found')

    const vendor = this.readVendor(router.tags)
    const profile = this.requireProfile(vendor)
    const sharedSecret = this.credentials.decrypt(router.sharedSecretCiphertext)
    const ports = this.readPorts(router.tags)
    return this.buildSetup(router, profile, sharedSecret, ports.authPort, ports.accountingPort, ports.coaPort)
  }

  async verify(routerId: string, tenantId?: string) {
    const router = await this.prisma.router.findFirst({
      where: { id: routerId, ...(tenantId ? { tenantId } : {}) },
      select: {
        id: true,
        tenantId: true,
        host: true,
        radiusNasIpAddress: true,
        tags: true,
        lastRadiusSignalAt: true,
        lastAccountingSignalAt: true,
      },
    })
    if (!router) throw new NotFoundException('Router not found')

    const nasCandidates = Array.from(new Set([router.radiusNasIpAddress, router.host].filter((value): value is string => Boolean(value))))
    const [authEvent, accountingEvent, radAcct] = await Promise.all([
      this.prisma.radiusEvent.findFirst({
        where: {
          routerId,
          eventType: { in: [RadiusEventType.ACCESS_REQUEST, RadiusEventType.ACCESS_ACCEPT, RadiusEventType.ACCESS_REJECT] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.radiusEvent.findFirst({
        where: {
          routerId,
          eventType: { in: [RadiusEventType.ACCOUNTING_START, RadiusEventType.ACCOUNTING_INTERIM, RadiusEventType.ACCOUNTING_STOP] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      nasCandidates.length
        ? this.prisma.radAcct.findFirst({
            where: { nasipaddress: { in: nasCandidates } },
            orderBy: { radacctid: 'desc' },
          })
        : Promise.resolve(null),
    ])

    const radiusSeen = Boolean(authEvent || router.lastRadiusSignalAt)
    const accountingSeen = Boolean(accountingEvent || radAcct || router.lastAccountingSignalAt)
    const verified = radiusSeen && accountingSeen

    await this.prisma.router.update({
      where: { id: router.id },
      data: verified
        ? {
            status: RouterStatus.HEALTHY,
            onboardingStatus: RouterOnboardingStatus.VERIFIED_ONLINE,
            verificationStatus: RouterVerificationStatus.VERIFIED,
            verifiedAt: new Date(),
          }
        : accountingSeen
          ? { onboardingStatus: RouterOnboardingStatus.ACCOUNTING_SEEN }
          : radiusSeen
            ? { onboardingStatus: RouterOnboardingStatus.RADIUS_SEEN }
            : { onboardingStatus: RouterOnboardingStatus.WAITING_FOR_RADIUS },
    })

    return {
      routerId,
      vendor: this.readVendor(router.tags),
      status: verified ? 'VERIFIED' : radiusSeen || accountingSeen ? 'PARTIAL' : 'WAITING_FOR_RADIUS',
      checks: {
        radiusAuthenticationSeen: radiusSeen,
        accountingSeen,
      },
      lastAuthAt: authEvent?.createdAt ?? router.lastRadiusSignalAt ?? null,
      lastAccountingAt: accountingEvent?.createdAt ?? radAcct?.acctupdatetime ?? radAcct?.acctstarttime ?? router.lastAccountingSignalAt ?? null,
      next: verified
        ? 'This device is exchanging authentication and accounting data with AROFi.'
        : 'Send a test login and accounting update from the router/controller, then verify again.',
    }
  }

  private buildSetup(
    router: {
      id: string
      name: string
      host: string
      model: string | null
      siteLabel: string | null
      tags: string[]
      tenant: { name: string; domain: string | null }
      radiusClient: { shortName: string; ipAddress: string } | null
      nasClient: { nasname: string; shortname: string; type: string; enabled: boolean } | null
    },
    profile: CompatibilityProfile,
    sharedSecret: string,
    authPort: number,
    accountingPort: number,
    coaPort: number,
  ) {
    const radius = this.mikrotik.getRadiusServerConfig?.(sharedSecret)
    const radiusHost = radius?.host ?? process.env.RADIUS_SERVER_HOST ?? ''
    const portalUrl = process.env.PORTAL_PUBLIC_URL ?? process.env.NEXT_PUBLIC_PORTAL_URL ?? null

    return {
      router: {
        id: router.id,
        name: router.name,
        model: router.model,
        siteLabel: router.siteLabel,
        nasAddress: router.host,
        vendor: profile.vendor,
        vendorLabel: profile.label,
      },
      integration: profile.integration,
      radius: {
        server: radiusHost,
        authenticationPort: authPort,
        accountingPort,
        coaPort,
        sharedSecret,
        nasIdentifier: router.radiusClient?.shortName ?? router.nasClient?.shortname ?? this.buildShortName(router.name),
      },
      portal: {
        url: portalUrl,
        required: profile.integration === 'RADIUS_PORTAL',
        note: portalUrl
          ? 'Use this as the external portal URL where the controller supports an external captive portal.'
          : 'Set PORTAL_PUBLIC_URL on the AROFi server before using a controller external-portal redirect.',
      },
      capabilities: profile.capabilities,
      instructions: this.instructions(profile.vendor, radiusHost, authPort, accountingPort, coaPort, portalUrl),
      notes: profile.notes,
      verifyEndpoint: `/router-compatibility/${router.id}/verify`,
    }
  }

  private instructions(
    vendor: RouterCompatibilityVendor,
    radiusHost: string,
    authPort: number,
    accountingPort: number,
    coaPort: number,
    portalUrl: string | null,
  ) {
    const common = [
      `RADIUS server: ${radiusHost || 'configure RADIUS_SERVER_HOST on AROFi'}`,
      `Authentication UDP port: ${authPort}`,
      `Accounting UDP port: ${accountingPort}`,
      'Enable accounting start, interim updates and stop messages when the device exposes those options.',
    ]

    if (vendor === 'TP_LINK_OMADA') {
      return [
        'In Omada Controller, create a RADIUS profile using the AROFi server, ports and shared secret shown above.',
        'Enable RADIUS Accounting on that profile and use the accounting port shown above.',
        'Apply the RADIUS profile to the target portal/SSID authentication policy.',
        ...(portalUrl ? [`If the selected Omada portal mode supports an External Portal Server, point it to ${portalUrl}.`] : []),
        ...common,
      ]
    }
    if (vendor === 'UBIQUITI_UNIFI') {
      return [
        'In UniFi Network, create/select a RADIUS profile using the AROFi authentication server and shared secret.',
        'Enable RADIUS accounting and apply the profile to the hotspot/guest network that AROFi will bill.',
        ...(portalUrl ? [`Where the installed UniFi Network version supports an external hotspot portal, use ${portalUrl}.`] : []),
        `If Disconnect/CoA is enabled on the UniFi deployment, use UDP ${coaPort}.`,
        ...common,
      ]
    }
    if (vendor === 'RUIJIE_REYEE') {
      return [
        'In the Reyee/Ruijie controller or gateway, open the authentication/portal settings for the target SSID or gateway.',
        'Select external RADIUS where the deployed model exposes it, then enter the AROFi server, authentication port and shared secret.',
        'Enable accounting if the controller/model exposes RADIUS accounting.',
        ...(portalUrl ? [`If an External Portal URL option is available, point it to ${portalUrl}.`] : []),
        ...common,
      ]
    }

    return [
      'Open the device AAA / RADIUS client configuration.',
      'Add AROFi as the authentication server using the server, authentication port and shared secret shown above.',
      'Add the same AROFi host as the accounting server and enable session accounting/interim updates if supported.',
      `If the device supports RADIUS Disconnect/CoA, configure AROFi on UDP ${coaPort}.`,
      ...(portalUrl ? [`If the device supports an external captive portal, use ${portalUrl}.`] : []),
      ...common,
    ]
  }

  private requireProfile(vendor: RouterCompatibilityVendor) {
    const profile = PROFILES.find((item) => item.vendor === vendor)
    if (!profile) throw new BadRequestException('Unsupported router compatibility profile')
    return profile
  }

  private readVendor(tags: string[]): RouterCompatibilityVendor {
    const value = tags.find((tag) => tag.startsWith('integration-vendor:'))?.split(':')[1]
    return (PROFILES.some((profile) => profile.vendor === value) ? value : 'GENERIC_RADIUS') as RouterCompatibilityVendor
  }

  private readPorts(tags: string[]) {
    const read = (prefix: string, fallback: number) => {
      const raw = tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length)
      const parsed = Number.parseInt(raw ?? '', 10)
      return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback
    }
    return {
      authPort: read('radius-auth-port:', 1812),
      accountingPort: read('radius-accounting-port:', 1813),
      coaPort: read('radius-coa-port:', 3799),
    }
  }

  private normalizeNasAddress(value: string) {
    const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!normalized || normalized.length > 128 || /\s/.test(normalized)) {
      throw new BadRequestException('Enter a valid NAS source IP address or hostname.')
    }
    return normalized
  }

  private normalizeSecret(value?: string) {
    const normalized = value?.trim() ?? ''
    if (normalized && (normalized.length < 12 || normalized.length > 128)) {
      throw new BadRequestException('RADIUS shared secret must be between 12 and 128 characters.')
    }
    return normalized
  }

  private buildShortName(value: string) {
    const base = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'arofi-nas'
    return `${base}-${randomBytes(3).toString('hex')}`.slice(0, 32)
  }
}
