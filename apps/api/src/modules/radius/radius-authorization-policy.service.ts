import { Injectable } from '@nestjs/common'
import {
  PackageActivationStatus,
  Prisma,
  RadiusCredentialStatus,
  SessionStatus,
  SuspiciousAccessAttemptType,
} from '@prisma/client'

type AuthorizeInput = {
  username: string
  macAddress?: string | null
  routerId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

@Injectable()
export class RadiusAuthorizationPolicyService {
  async authorize(tx: Prisma.TransactionClient, input: AuthorizeInput) {
    const credential = await tx.radiusCredential.findUnique({
      where: { username: input.username },
      include: {
        activation: {
          include: {
            package: true,
          },
        },
      },
    })

    if (!credential) {
      return { accepted: false, reason: 'Unknown RADIUS username' }
    }

    const activation = credential.activation
    const now = new Date()
    const observedMac = this.normalizeMac(input.macAddress)
    const boundMac = this.normalizeMac(activation.boundMacAddress ?? credential.boundMacAddress)

    if (credential.status !== RadiusCredentialStatus.ACTIVE) {
      return { accepted: false, reason: 'RADIUS credential is not active', activation }
    }

    if (activation.status !== PackageActivationStatus.ACTIVE) {
      return { accepted: false, reason: `Activation status is ${activation.status}`, activation }
    }

    if (activation.endsAt <= now) {
      return { accepted: false, reason: 'Activation has expired', activation }
    }

    if (!observedMac) {
      await this.recordSuspicious(tx, activation, input, SuspiciousAccessAttemptType.MISSING_MAC, 'Missing MAC address on auth request')
      return { accepted: false, reason: 'MAC address is required for one-device enforcement', activation }
    }

    if (!boundMac) {
      await tx.packageActivation.update({
        where: { id: activation.id },
        data: {
          boundMacAddress: observedMac,
          firstSeenIp: activation.firstSeenIp ?? input.ipAddress,
          firstSeenAt: activation.firstSeenAt ?? now,
          routerId: activation.routerId ?? input.routerId,
        },
      })
      await tx.radiusCredential.update({
        where: { id: credential.id },
        data: {
          boundMacAddress: observedMac,
          routerId: credential.routerId ?? input.routerId,
        },
      })
    } else if (boundMac !== observedMac) {
      await this.recordSuspicious(tx, activation, input, SuspiciousAccessAttemptType.SECOND_DEVICE, 'Credential attempted from a second MAC address')
      return { accepted: false, reason: 'Credential is already bound to another device', activation }
    }

    const deviceLimit = activation.package?.deviceLimit ?? 1

    if (deviceLimit > 1) {
      // Multi-device package: count distinct active MACs
      const activeMacRows = await tx.networkSession.findMany({
        where: {
          activationId: activation.id,
          status: SessionStatus.ACTIVE,
          NOT: { macAddress: null },
        },
        select: { macAddress: true },
        distinct: ['macAddress'],
      })
      const activeMacs = new Set(
        activeMacRows.map((r) => this.normalizeMac(r.macAddress)).filter(Boolean),
      )
      if (!activeMacs.has(observedMac) && activeMacs.size >= deviceLimit) {
        await this.recordSuspicious(
          tx, activation, input,
          SuspiciousAccessAttemptType.SECOND_DEVICE,
          `Device limit (${deviceLimit}) reached. Active MACs: ${activeMacs.size}`,
        )
        return {
          accepted: false,
          reason: `Maximum ${deviceLimit} device(s) already connected on this plan`,
          activation,
        }
      }
    }


    return {
      accepted: true,
      reason: 'Activation is active and device binding matches',
      activation,
      sessionTimeoutSeconds: Math.max(1, Math.floor((activation.endsAt.getTime() - now.getTime()) / 1000)),
    }
  }

  private async recordSuspicious(
    tx: Prisma.TransactionClient,
    activation: { id: string; tenantId: string; boundMacAddress: string | null },
    input: AuthorizeInput,
    type: SuspiciousAccessAttemptType,
    message: string,
  ) {
    await tx.suspiciousAccessAttempt.create({
      data: {
        tenantId: activation.tenantId,
        activationId: activation.id,
        type,
        username: input.username,
        expectedMacAddress: activation.boundMacAddress,
        observedMacAddress: input.macAddress,
        routerId: input.routerId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        message,
      },
    })
  }

  private normalizeMac(value?: string | null) {
    if (!value) {
      return null
    }

    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) {
      return null
    }

    return compact.match(/.{1,2}/g)?.join(':') || null
  }
}
