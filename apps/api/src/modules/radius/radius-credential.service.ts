import { Injectable } from '@nestjs/common'
import {
  PackageActivationStatus,
  Prisma,
  RadiusCredentialStatus,
} from '@prisma/client'
import { randomBytes } from 'crypto'

type ProvisionInput = {
  tenantId: string
  activationId: string
  username?: string | null
  password?: string | null
  boundMacAddress?: string | null
  routerId?: string | null
}

@Injectable()
export class RadiusCredentialService {
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

    await tx.radCheck.deleteMany({ where: { username } })
    await tx.radReply.deleteMany({ where: { username } })

    if (credential.status === RadiusCredentialStatus.ACTIVE) {
      await tx.radCheck.createMany({
        data: [
          {
            username,
            attribute: 'Cleartext-Password',
            op: ':=',
            value: password,
          },
          {
            username,
            attribute: 'Expiration',
            op: ':=',
            value: this.formatRadiusExpiration(activation.endsAt),
          },
        ],
      })

      const replies: Prisma.RadReplyCreateManyInput[] = [
        {
          username,
          attribute: 'Session-Timeout',
          op: '=',
          value: remainingSeconds.toString(),
        },
        {
          username,
          attribute: 'Idle-Timeout',
          op: '=',
          value: '600',
        },
      ]

      if (activation.downloadSpeedKbps || activation.uploadSpeedKbps) {
        const down = activation.downloadSpeedKbps ?? activation.uploadSpeedKbps ?? 0
        const up = activation.uploadSpeedKbps ?? activation.downloadSpeedKbps ?? 0
        replies.push({
          username,
          attribute: 'Mikrotik-Rate-Limit',
          op: '=',
          value: `${up}k/${down}k`,
        })
      }

      await tx.radReply.createMany({ data: replies })
      console.log(
        `[RADIUS] Provisioned username=${username} activationId=${activation.id} expiresAt=${activation.endsAt.toISOString()}`,
      )
    }

    return credential
  }

  async disableForActivation(tx: Prisma.TransactionClient, activationId: string, status: RadiusCredentialStatus) {
    const credential = await tx.radiusCredential.findUnique({ where: { activationId } })
    if (!credential) {
      return null
    }

    await tx.radCheck.deleteMany({ where: { username: credential.username } })
    await tx.radReply.deleteMany({ where: { username: credential.username } })

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
}
