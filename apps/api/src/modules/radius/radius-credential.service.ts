import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import {
  PackageActivationStatus,
  Prisma,
  RadiusCredentialStatus,
} from '@prisma/client'
import { randomBytes } from 'crypto'
import { PrismaService } from '../../prisma.service'

type ProvisionInput = {
  tenantId: string
  activationId: string
  username?: string | null
  password?: string | null
  boundMacAddress?: string | null
  routerId?: string | null
}

@Injectable()
export class RadiusCredentialService implements OnModuleInit {
  private readonly logger = new Logger(RadiusCredentialService.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.repairSmartTvMacLoginCredentials()
    } catch (error) {
      this.logger.warn(
        `Smart TV MAC-login startup repair failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async provisionForActivation(tx: Prisma.TransactionClient, input: ProvisionInput) {
    const activation = await tx.packageActivation.findUnique({
      where: { id: input.activationId },
      include: { package: true },
    })

    if (!activation) {
      throw new Error('Package activation not found for RADIUS provisioning')
    }

    const username =
      input.username ??
      activation.radiusUsername ??
      this.buildUsername(activation.source, activation.id)
    const password =
      input.password ??
      activation.radiusPassword ??
      this.buildPassword()
    const now = new Date()
    const remainingSeconds = Math.max(1, Math.floor((activation.endsAt.getTime() - now.getTime()) / 1000))

    await tx.packageActivation.update({
      where: { id: activation.id },
      data: {
        radiusUsername: username,
        radiusPassword: password,
      },
    })

    // Use a 30-second buffer against clock drift: an activation created
    // mid-millisecond can arrive here with endsAt <= now even though it is
    // genuinely fresh, causing the credential to land as DISABLED and leaving
    // no radCheck/radReply rows → FreeRADIUS rejects the auth → no internet.
    const isActive =
      activation.status === PackageActivationStatus.ACTIVE &&
      activation.endsAt.getTime() > Date.now() - 30_000

    const credential = await tx.radiusCredential.upsert({
      where: { activationId: activation.id },
      update: {
        username,
        password,
        status: isActive ? RadiusCredentialStatus.ACTIVE : RadiusCredentialStatus.DISABLED,
        boundMacAddress: this.normalizeMac(input.boundMacAddress ?? activation.boundMacAddress) ?? null,
        routerId: input.routerId ?? activation.routerId,
        expiresAt: activation.endsAt,
      },
      create: {
        tenantId: input.tenantId,
        activationId: activation.id,
        username,
        password,
        status: isActive ? RadiusCredentialStatus.ACTIVE : RadiusCredentialStatus.DISABLED,
        boundMacAddress: this.normalizeMac(input.boundMacAddress ?? activation.boundMacAddress) ?? null,
        routerId: input.routerId ?? activation.routerId,
        expiresAt: activation.endsAt,
      },
    })

    const boundMac = this.normalizeMac(input.boundMacAddress ?? activation.boundMacAddress)
    const authUsernames = this.radiusAuthUsernames(username, boundMac)

    await tx.radCheck.deleteMany({ where: { username: { in: authUsernames } } })
    await tx.radReply.deleteMany({ where: { username: { in: authUsernames } } })

    if (credential.status === RadiusCredentialStatus.ACTIVE) {
      await tx.radCheck.createMany({
        data: authUsernames.flatMap((authUsername) => [
          {
            username: authUsername,
            attribute: 'Cleartext-Password',
            op: ':=',
            value: this.radiusPasswordForUsername(authUsername, username, password, boundMac),
          },
          {
            username: authUsername,
            attribute: 'Expiration',
            op: ':=',
            value: this.formatRadiusExpiration(activation.endsAt),
          },
        ]),
      })

      const replies: Prisma.RadReplyCreateManyInput[] = authUsernames.flatMap((authUsername) => [
        {
          username: authUsername,
          attribute: 'Session-Timeout',
          op: '=',
          value: remainingSeconds.toString(),
        },
        {
          username: authUsername,
          attribute: 'Idle-Timeout',
          op: '=',
          value: '3600',
        },
        {
          username: authUsername,
          attribute: 'Acct-Interim-Interval',
          op: '=',
          value: '60',
        },
      ])

      if (activation.downloadSpeedKbps || activation.uploadSpeedKbps) {
        const down = activation.downloadSpeedKbps ?? activation.uploadSpeedKbps ?? 0
        const up = activation.uploadSpeedKbps ?? activation.downloadSpeedKbps ?? 0
        for (const authUsername of authUsernames) {
          replies.push({
            username: authUsername,
            attribute: 'Mikrotik-Rate-Limit',
            op: '=',
            value: `${up}k/${down}k`,
          })
        }
      }

      await tx.radReply.createMany({ data: replies })
      this.logger.log(
        `Provisioned username=${username} authUsernames=${authUsernames.join(',')} activationId=${activation.id} expiresAt=${activation.endsAt.toISOString()}`,
      )
    }

    return credential
  }

  async disableForActivation(tx: Prisma.TransactionClient, activationId: string, status: RadiusCredentialStatus) {
    const credential = await tx.radiusCredential.findUnique({ where: { activationId } })
    if (!credential) {
      return null
    }

    const authUsernames = this.radiusAuthUsernames(credential.username, credential.boundMacAddress)

    await tx.radCheck.deleteMany({ where: { username: { in: authUsernames } } })
    await tx.radReply.deleteMany({ where: { username: { in: authUsernames } } })

    return tx.radiusCredential.update({
      where: { id: credential.id },
      data: { status },
    })
  }

  private buildUsername(source: string, activationId: string) {
    return `arofi-${source.toLowerCase()}-${activationId.slice(0, 12)}`
  }

  private buildPassword() {
    return randomBytes(12).toString('base64url')
  }

  private radiusAuthUsernames(username: string, boundMacAddress?: string | null) {
    const names = new Set<string>([username])
    const mac = this.normalizeMac(boundMacAddress) ?? this.normalizeMac(username)
    if (mac && (username === mac || username === mac.replace(/:/g, ''))) {
      names.add(mac)
      names.add(mac.replace(/:/g, ''))
    }
    return Array.from(names)
  }

  private radiusPasswordForUsername(authUsername: string, primaryUsername: string, primaryPassword: string, boundMacAddress?: string | null) {
    const mac = this.normalizeMac(boundMacAddress) ?? this.normalizeMac(primaryUsername)
    if (!mac) return primaryPassword
    if (authUsername === mac || authUsername === mac.replace(/:/g, '')) return authUsername
    return primaryPassword
  }

  private normalizeMac(value?: string | null) {
    if (!value) {
      return undefined
    }

    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) {
      return undefined
    }

    return compact.match(/.{1,2}/g)?.join(':')
  }

  private formatRadiusExpiration(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const day = String(date.getUTCDate()).padStart(2, '0')
    const month = months[date.getUTCMonth()]
    const year = date.getUTCFullYear()
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    const seconds = String(date.getUTCSeconds()).padStart(2, '0')
    return `${day} ${month} ${year} ${hours}:${minutes}:${seconds} UTC`
  }

  private async repairSmartTvMacLoginCredentials() {
    const now = new Date()
    const activations = await this.prisma.packageActivation.findMany({
      where: {
        status: PackageActivationStatus.ACTIVE,
        endsAt: { gt: now },
        boundMacAddress: { not: null },
        package: {
          OR: [
            { name: { contains: 'tv', mode: 'insensitive' } },
            { name: { contains: 'smart', mode: 'insensitive' } },
            { name: { contains: 'stream', mode: 'insensitive' } },
            { code: { contains: 'tv', mode: 'insensitive' } },
            { description: { contains: 'tv', mode: 'insensitive' } },
            { description: { contains: 'smart', mode: 'insensitive' } },
            { description: { contains: 'stream', mode: 'insensitive' } },
          ],
        },
      },
      include: { radiusCredential: true },
      take: 200,
    })

    let repaired = 0
    for (const activation of activations) {
      const mac = this.normalizeMac(activation.boundMacAddress)
      if (!mac) continue
      if (activation.radiusUsername === mac && activation.radiusCredential?.username === mac) continue

      try {
        await this.prisma.$transaction(async (tx) => {
          const activeConflict = await tx.radiusCredential.findFirst({
            where: {
              username: mac,
              activationId: { not: activation.id },
              status: RadiusCredentialStatus.ACTIVE,
              expiresAt: { gt: now },
            },
            select: { activationId: true },
          })
          if (activeConflict) return

          const authUsernames = this.radiusAuthUsernames(mac, mac)
          await tx.radCheck.deleteMany({ where: { username: { in: authUsernames } } })
          await tx.radReply.deleteMany({ where: { username: { in: authUsernames } } })
          await tx.radiusCredential.deleteMany({
            where: {
              username: mac,
              activationId: { not: activation.id },
              OR: [{ expiresAt: { lte: now } }, { status: { not: RadiusCredentialStatus.ACTIVE } }],
            },
          })
          await tx.packageActivation.updateMany({
            where: {
              radiusUsername: mac,
              id: { not: activation.id },
              OR: [{ endsAt: { lte: now } }, { status: { not: PackageActivationStatus.ACTIVE } }],
            },
            data: { radiusUsername: null, radiusPassword: null },
          })
          await tx.packageActivation.update({
            where: { id: activation.id },
            data: { radiusUsername: mac, radiusPassword: mac },
          })
          await tx.radiusCredential.upsert({
            where: { activationId: activation.id },
            update: {
              username: mac,
              password: mac,
              status: RadiusCredentialStatus.ACTIVE,
              boundMacAddress: mac,
              routerId: activation.routerId,
              expiresAt: activation.endsAt,
            },
            create: {
              tenantId: activation.tenantId,
              activationId: activation.id,
              username: mac,
              password: mac,
              status: RadiusCredentialStatus.ACTIVE,
              boundMacAddress: mac,
              routerId: activation.routerId,
              expiresAt: activation.endsAt,
            },
          })
          await tx.radCheck.createMany({
            data: authUsernames.flatMap((authUsername) => [
              { username: authUsername, attribute: 'Cleartext-Password', op: ':=', value: authUsername },
              { username: authUsername, attribute: 'Expiration', op: ':=', value: this.formatRadiusExpiration(activation.endsAt) },
            ]),
          })
          await tx.radReply.createMany({
            data: authUsernames.map((authUsername) => ({
              username: authUsername,
              attribute: 'Session-Timeout',
              op: '=',
              value: Math.max(1, Math.floor((activation.endsAt.getTime() - Date.now()) / 1000)).toString(),
            })),
          })
        })
        repaired += 1
      } catch (error) {
        this.logger.warn(
          `Smart TV MAC-login repair skipped for activation=${activation.id} mac=${mac}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    if (repaired > 0) {
      this.logger.log(`Repaired ${repaired} active Smart TV MAC-login credential(s).`)
    }
  }
}
