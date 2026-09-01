import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PackageActivationStatus, ReconnectionStatus, SessionStatus } from '@prisma/client'
import { createHmac, timingSafeEqual } from 'crypto'
import { PrismaService } from '../../prisma.service'

type PortalTokenPayload = {
  tenantId: string
  phoneNumber: string
  issuedAt: number
  expiresAt: number
}

type RoamInput = {
  macAddress?: string
  ipAddress?: string
  routerId?: string
  routerKey?: string
  hotspotServerName?: string
  loginUrl?: string
}

@Injectable()
export class PortalRoamingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async roam(authorization: string | undefined, input: RoamInput) {
    const token = this.extractBearerToken(authorization)
    if (!token) throw new UnauthorizedException('Portal access token is required for roaming')

    const payload = this.verifyAccessToken(token)
    const macAddress = this.normalizeMac(input.macAddress)
    if (!macAddress) throw new BadRequestException('A valid device MAC address is required for roaming')

    const router = input.routerKey
      ? await this.prisma.router.findUnique({
          where: { registrationKey: input.routerKey },
          select: { id: true, tenantId: true, hotspotServerName: true },
        })
      : input.routerId
        ? await this.prisma.router.findUnique({
            where: { id: input.routerId },
            select: { id: true, tenantId: true, hotspotServerName: true },
          })
        : null

    if (!router) {
      throw new BadRequestException('Roaming must be started from an AROFi Wi-Fi login page')
    }
    if (router.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Active access belongs to a different Wi-Fi business')
    }

    const phoneVariants = this.buildPhoneVariants(payload.phoneNumber)
    const activation = await this.prisma.packageActivation.findFirst({
      where: {
        tenantId: payload.tenantId,
        status: PackageActivationStatus.ACTIVE,
        endsAt: { gt: new Date() },
        OR: [
          { accessPhoneNumber: { in: phoneVariants } },
          { customerReference: { in: phoneVariants } },
        ],
      },
      include: { radiusCredential: true },
      orderBy: { endsAt: 'desc' },
    })

    if (!activation) {
      throw new UnauthorizedException('No active package was found for this portal session')
    }

    const username = activation.radiusCredential?.username ?? activation.radiusUsername
    const password = activation.radiusCredential?.password ?? activation.radiusPassword
    if (!username || !password) {
      throw new BadRequestException('This active package is missing its router login credential')
    }

    // MAC-login credentials (Smart TV/trial) intentionally remain device-bound.
    // Roaming is for a signed-in phone/browser moving between AP/SSID names.
    if (this.normalizeMac(username)) {
      throw new BadRequestException('This device-bound package cannot be moved to another device identity')
    }

    const oldMac = this.normalizeMac(activation.boundMacAddress ?? activation.radiusCredential?.boundMacAddress)
    if (oldMac !== macAddress) {
      // Prevent two devices sharing one credential. MikroTik sends Stop on a normal
      // AP/SSID handoff; if an old session is still accounting in the last 20s,
      // wait for that disconnect instead of silently creating concurrent access.
      const freshOtherSession = await this.prisma.networkSession.findFirst({
        where: {
          activationId: activation.id,
          status: SessionStatus.ACTIVE,
          macAddress: { not: macAddress },
          lastAccountingAt: { gte: new Date(Date.now() - 20_000) },
        },
        select: { id: true },
      })
      if (freshOtherSession) {
        throw new BadRequestException('Your previous Wi-Fi connection is still active. Wait a few seconds, then reconnect to this AROFi access point.')
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.packageActivation.update({
          where: { id: activation.id },
          data: {
            boundMacAddress: macAddress,
            routerId: router.id,
            hotspotServerName: input.hotspotServerName || router.hotspotServerName || activation.hotspotServerName,
          },
        })
        if (activation.radiusCredential) {
          await tx.radiusCredential.update({
            where: { id: activation.radiusCredential.id },
            data: { boundMacAddress: macAddress, routerId: router.id },
          })
        }
        await tx.networkSession.updateMany({
          where: {
            activationId: activation.id,
            status: SessionStatus.ACTIVE,
            macAddress: { not: macAddress },
            OR: [{ lastAccountingAt: null }, { lastAccountingAt: { lt: new Date(Date.now() - 20_000) } }],
          },
          data: { status: SessionStatus.STALE, endedAt: new Date() },
        })
        await tx.reconnectionLog.create({
          data: {
            tenantId: activation.tenantId,
            activationId: activation.id,
            routerId: router.id,
            macAddress,
            ipAddress: input.ipAddress,
            status: ReconnectionStatus.LOGIN_PAYLOAD_ISSUED,
            message: oldMac
              ? `Portal-token roaming rebound active access from ${oldMac} to ${macAddress}`
              : `Portal-token roaming bound active access to ${macAddress}`,
          },
        })
      })
    }

    const remainingSeconds = Math.max(1, Math.floor((activation.endsAt.getTime() - Date.now()) / 1000))
    await this.prisma.radReply.updateMany({
      where: { username, attribute: 'Session-Timeout' },
      data: { value: remainingSeconds.toString() },
    })

    return {
      message: 'Active access found. Roaming to this AROFi access point.',
      reconnect: {
        method: 'mikrotik-hotspot-post',
        loginUrl: input.loginUrl || process.env.HOTSPOT_LOGIN_URL || 'http://10.55.0.1/login',
        username,
        password,
        routerId: router.id,
        hotspotServerName: input.hotspotServerName || router.hotspotServerName || null,
        expiresAt: activation.endsAt.toISOString(),
      },
    }
  }

  private extractBearerToken(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() ?? null
  }

  private verifyAccessToken(accessToken: string) {
    const [encodedPayload, signature] = accessToken.split('.')
    if (!encodedPayload || !signature) throw new UnauthorizedException('Portal access token is invalid')

    const expectedSignature = createHmac('sha256', this.getTokenSecret()).update(encodedPayload).digest('base64url')
    const providedBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSignature)
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Portal access token signature mismatch')
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as PortalTokenPayload
    if (!payload.tenantId || !payload.phoneNumber || !payload.expiresAt || payload.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Portal access token has expired or is incomplete')
    }
    return payload
  }

  private getTokenSecret() {
    const secret = this.configService.get<string>('PORTAL_TOKEN_SECRET') ?? this.configService.get<string>('JWT_SECRET')
    if (!secret) throw new UnauthorizedException('Portal token secret is not configured')
    return secret
  }

  private buildPhoneVariants(phoneNumber: string) {
    return Array.from(new Set([phoneNumber, `+${phoneNumber}`, `0${phoneNumber.slice(3)}`]))
  }

  private normalizeMac(value?: string | null) {
    if (!value) return undefined
    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) return undefined
    return compact.match(/.{1,2}/g)?.join(':')
  }
}
