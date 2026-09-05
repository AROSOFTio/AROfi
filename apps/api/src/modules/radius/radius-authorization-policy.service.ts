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
        activation: true,
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

    // AP/router names and SSIDs are never authorization boundaries. When a
    // customer moves from AP A to AP Z, the RADIUS request arrives with the
    // current AROFi router id. Verify that router belongs to the SAME tenant
    // before allowing any handoff. This also closes the old edge case where a
    // matching MAC could present a valid credential through another business.
    const currentRouter = input.routerId
      ? await tx.router.findUnique({
          where: { id: input.routerId },
          select: { id: true, tenantId: true },
        })
      : null

    if (input.routerId && (!currentRouter || currentRouter.tenantId !== activation.tenantId)) {
      await this.recordSuspicious(
        tx,
        activation,
        input,
        SuspiciousAccessAttemptType.SECOND_DEVICE,
        'Credential attempted through a router outside the activation business',
      )
      return { accepted: false, reason: 'Credential is not valid on this business network', activation }
    }

    const previousRouterId = activation.routerId ?? credential.routerId ?? null
    const sameTenantCrossApHandoff = Boolean(
      input.routerId &&
        currentRouter?.tenantId === activation.tenantId &&
        previousRouterId &&
        input.routerId !== previousRouterId,
    )

    const hasStartedSession = await tx.radAcct.findFirst({
      where: { username: input.username },
      select: { radacctid: true },
    })

    if (!boundMac || !hasStartedSession) {
      await tx.packageActivation.update({
        where: { id: activation.id },
        data: {
          boundMacAddress: observedMac,
          firstSeenIp: activation.firstSeenIp ?? input.ipAddress,
          firstSeenAt: activation.firstSeenAt ?? now,
          routerId: input.routerId ?? activation.routerId,
        },
      })
      await tx.radiusCredential.update({
        where: { id: credential.id },
        data: {
          boundMacAddress: observedMac,
          routerId: input.routerId ?? credential.routerId,
        },
      })
    } else if (boundMac !== observedMac) {
      if (!sameTenantCrossApHandoff) {
        await this.recordSuspicious(tx, activation, input, SuspiciousAccessAttemptType.SECOND_DEVICE, 'Credential attempted from a second MAC address on the same AP/business edge')
        return { accepted: false, reason: 'Credential is already bound to another device', activation }
      }

      // Modern phones may use a different private MAC per SSID. A verified
      // same-business AP handoff therefore transfers the one active credential
      // to the MAC currently presented on AP Z instead of blocking the buyer.
      // The credential still cannot cross tenants, and a different MAC on the
      // same AP is still rejected as a second device.
      await tx.packageActivation.update({
        where: { id: activation.id },
        data: {
          boundMacAddress: observedMac,
          routerId: input.routerId,
        },
      })
      await tx.radiusCredential.update({
        where: { id: credential.id },
        data: {
          boundMacAddress: observedMac,
          routerId: input.routerId,
        },
      })
    } else if (sameTenantCrossApHandoff) {
      // Same MAC, different AP: follow the customer to the current router so
      // future reconnect/handoff decisions use AP Z as the latest location.
      await tx.packageActivation.update({
        where: { id: activation.id },
        data: { routerId: input.routerId },
      })
      await tx.radiusCredential.update({
        where: { id: credential.id },
        data: { routerId: input.routerId },
      })
    }

    const staleBefore = new Date(now.getTime() - 90 * 1000)
    const concurrentSession = await tx.networkSession.findFirst({
      where: {
        username: input.username,
        status: SessionStatus.ACTIVE,
        macAddress: { not: observedMac },
        lastAccountingAt: { gte: staleBefore },
      },
      select: {
        id: true,
        macAddress: true,
        routerId: true,
      },
    })

    // During a real roam, AP A may continue reporting its old accounting row
    // for a short time after the phone has already associated to AP Z. That
    // stale row must never block the AP-Z login. Outside a verified same-tenant
    // router handoff, the normal one-device concurrent-session protection stays.
    if (concurrentSession && !sameTenantCrossApHandoff) {
      await this.recordSuspicious(
        tx,
        activation,
        input,
        SuspiciousAccessAttemptType.SECOND_DEVICE,
        `Concurrent session exists on another MAC address (${concurrentSession.macAddress ?? 'unknown'})`,
      )
      return { accepted: false, reason: 'Concurrent session exists for another device', activation }
    }

    return {
      accepted: true,
      reason: sameTenantCrossApHandoff
        ? 'Activation is active and same-business AP handoff is allowed'
        : 'Activation is active and device binding matches',
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
