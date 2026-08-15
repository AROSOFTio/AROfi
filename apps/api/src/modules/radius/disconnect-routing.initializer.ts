import { Injectable, Logger } from '@nestjs/common'
import { DisconnectionMethod, DisconnectionStatus } from '@prisma/client'
import { spawn } from 'child_process'
import { PrismaService } from '../../prisma.service'
import { RealtimeEventsService } from '../events/realtime-events.service'
import { MikrotikService } from '../routers/mikrotik.service'
import { RouterCredentialsService } from '../routers/router-credentials.service'
import { AccessLifecycleService } from './access-lifecycle.service'

type DisconnectAttempt = {
  id: string
  tenantId: string
  routerId: string | null
  activationId: string | null
  username: string | null
  macAddress: string | null
  radiusSessionId: string | null
  retryCount: number
}

type RouterTarget = {
  id: string
  tenantId: string
  name: string
  identity: string | null
  siteLabel: string | null
  serialNumber: string | null
  radiusNasIpAddress: string | null
  host: string
  remoteSstpIp: string | null
  lastSeenAt: Date | null
  lastProvisionedAt: Date | null
  apiPort: number
  connectionMode: string
  username: string
  passwordCiphertext: string
}

type DisconnectRoute = {
  original: RouterTarget | null
  router: RouterTarget | null
  remapped: boolean
  note: string
}

type MutableAccessLifecycleService = {
  processPendingDisconnects: () => Promise<void>
  handleDisconnectFailure: (attempt: DisconnectAttempt, error: unknown) => Promise<void>
  logoutHotspotActiveSession: (attempt: DisconnectAttempt) => Promise<number>
}

const ROUTER_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  identity: true,
  siteLabel: true,
  serialNumber: true,
  radiusNasIpAddress: true,
  host: true,
  remoteSstpIp: true,
  lastSeenAt: true,
  lastProvisionedAt: true,
  apiPort: true,
  connectionMode: true,
  username: true,
  passwordCiphertext: true,
} as const

/**
 * Final safety layer for active-session disconnect delivery.
 *
 * The proven expiry/RADIUS policy stays in AccessLifecycleService: activation
 * expiry still removes authorization first, queues one DisconnectionAttempt,
 * retries with the existing backoff, and raises the existing alert only after
 * retries are exhausted. This initializer changes only HOW that queued
 * Disconnect-Request finds the physical router.
 *
 * Why this exists: a physical MikroTik can be deliberately re-onboarded and
 * receive a newer AroFi router record/SSTP identity while an older customer
 * activation still points at the previous record. Sending CoA only to the old
 * record's remoteSstpIp cannot reach the currently connected router. We only
 * remap when the old record is not currently live and exactly one newer/live
 * record in the same tenant has the same learned NAS address plus a matching
 * physical identity hint. Ambiguous matches are never guessed.
 *
 * This file deliberately does NOT alter MikroTik provisioning, HotSpot rules,
 * RADIUS auth/accounting, SSTP installation, firewall/NAT, port 3799, or the
 * shared-secret policy.
 */
@Injectable()
export class DisconnectRoutingInitializer {
  private readonly logger = new Logger(DisconnectRoutingInitializer.name)

  constructor(
    private readonly lifecycle: AccessLifecycleService,
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly mikrotikService: MikrotikService,
    private readonly routerCredentialsService: RouterCredentialsService,
  ) {
    // Patch during provider construction, before AccessLifecycleService's
    // onModuleInit starts its first worker cycle.
    const service = this.lifecycle as unknown as MutableAccessLifecycleService
    service.processPendingDisconnects = () => this.processPendingDisconnects(service)
    service.logoutHotspotActiveSession = (attempt) => this.logoutHotspotActiveSession(attempt)
  }

  private async processPendingDisconnects(service: MutableAccessLifecycleService) {
    if (process.env.RADIUS_DISCONNECT_ENABLED !== 'true') {
      return
    }

    const now = new Date()
    const attempts = await this.prisma.disconnectionAttempt.findMany({
      where: {
        method: DisconnectionMethod.RADIUS_DISCONNECT,
        status: DisconnectionStatus.REQUESTED,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      take: 25,
    })

    for (const attempt of attempts) {
      try {
        const secret = process.env.RADIUS_DISCONNECT_SECRET?.trim() || process.env.RADIUS_SHARED_SECRET
        const port = process.env.RADIUS_DISCONNECT_PORT ?? '3799'
        if (!secret) {
          throw new Error('RADIUS disconnect secret is not configured')
        }

        const forcedHost = process.env.RADIUS_DISCONNECT_HOST?.trim()
        const route = forcedHost
          ? ({ original: null, router: null, remapped: false, note: 'forced disconnect host configured' } satisfies DisconnectRoute)
          : await this.resolveDisconnectRoute(attempt)

        const candidates = forcedHost
          ? [forcedHost]
          : route.router
            ? [route.router.remoteSstIp ?? route.router.remoteSstpIp, route.router.radiusNasIpAddress, route.router.host]
            : []
        const targets = [...new Set(candidates.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))]

        if (targets.length === 0) {
          throw new Error(
            `CoA target unresolvable for router ${attempt.routerId ?? 'unknown'}; ${route.note}`,
          )
        }

        const packet = [
          `User-Name = ${attempt.username ?? ''}`,
          attempt.radiusSessionId ? `Acct-Session-Id = ${attempt.radiusSessionId}` : '',
          attempt.macAddress ? `Calling-Station-Id = ${attempt.macAddress}` : '',
        ].filter(Boolean).join('\n')

        const coaErrors: string[] = []
        let ackTarget: string | null = null
        for (const host of targets) {
          try {
            await this.runRadclientDisconnect(host, port, secret, packet)
            ackTarget = host
            break
          } catch (error) {
            coaErrors.push(`${host}:${port} => ${this.errorMessage(error)}`)
          }
        }

        let apiRemoved = 0
        let apiAlreadyAbsent = false
        let apiError: string | null = null
        if (!ackTarget) {
          try {
            apiRemoved = await this.logoutHotspotActiveSession(attempt, route.router ?? undefined)
          } catch (error) {
            const message = this.errorMessage(error)
            if (/no matching active HotSpot session/i.test(message)) {
              // Authorization is already disabled. If RouterOS says the live
              // session is absent, the desired final state has already been
              // reached and a critical disconnect alarm would be false.
              apiAlreadyAbsent = true
            } else {
              apiError = message
            }
          }
        }

        const delivered = Boolean(ackTarget) || apiRemoved > 0 || apiAlreadyAbsent
        if (!delivered) {
          const details = [
            `Original router ${attempt.routerId ?? 'unknown'}`,
            route.remapped && route.router ? `resolved live router ${route.router.id}` : route.note,
            `CoA failures: ${coaErrors.length ? coaErrors.join('; ') : 'none recorded'}`,
            `RouterOS API fallback: ${apiError ?? 'did not remove a session'}`,
          ]
          throw new Error(details.join(' | '))
        }

        const successMessage = ackTarget
          ? `RADIUS Disconnect-ACK received from ${ackTarget}:${port}${route.remapped && route.router ? ` using current router ${route.router.id} (activation router ${attempt.routerId})` : ''}`
          : apiRemoved > 0
            ? `RouterOS HotSpot active session removed (${apiRemoved}) after CoA fallback${route.remapped && route.router ? ` using current router ${route.router.id}` : ''}`
            : `RouterOS HotSpot session already absent after authorization was disabled${route.remapped && route.router ? ` on current router ${route.router.id}` : ''}`

        await this.prisma.disconnectionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: DisconnectionStatus.SUCCESS,
            completedAt: new Date(),
            nextRetryAt: null,
            message: successMessage,
          },
        })

        if (route.remapped && route.router) {
          try {
            await this.prisma.auditLog.create({
              data: {
                tenantId: attempt.tenantId,
                action: 'radius.disconnect_router_remapped',
                entity: 'DisconnectionAttempt',
                entityId: attempt.id,
                severity: 'WARNING',
                details: {
                  originalRouterId: attempt.routerId,
                  resolvedRouterId: route.router.id,
                  radiusNasIpAddress: route.router.radiusNasIpAddress,
                  reason: route.note,
                },
              },
            })
          } catch (error) {
            this.logger.warn(`Could not audit disconnect router remap ${attempt.id}: ${this.errorMessage(error)}`)
          }
        }

        this.realtimeEvents.publish('disconnect.succeeded', {
          tenantId: attempt.tenantId,
          routerId: attempt.routerId ?? null,
          data: {
            attemptId: attempt.id,
            activationId: attempt.activationId,
            username: attempt.username,
            retryCount: attempt.retryCount,
            resolvedRouterId: route.router?.id ?? attempt.routerId,
            remappedRouter: route.remapped,
            delivery: ackTarget ? 'radius-disconnect-ack' : apiAlreadyAbsent ? 'already-absent' : 'routeros-api',
          },
        })
      } catch (error) {
        await service.handleDisconnectFailure(attempt, error)
      }
    }
  }

  private async resolveDisconnectRoute(attempt: DisconnectAttempt): Promise<DisconnectRoute> {
    if (!attempt.routerId) {
      return { original: null, router: null, remapped: false, note: 'no router is linked to the session' }
    }

    const original = await this.prisma.router.findUnique({
      where: { id: attempt.routerId },
      select: ROUTER_SELECT,
    }) as RouterTarget | null

    if (!original) {
      return { original: null, router: null, remapped: false, note: 'linked router record no longer exists' }
    }

    // The current registration sends heartbeat every few seconds. A recent
    // lastSeenAt therefore proves this record is still the physical router's
    // active identity; never remap a record that is demonstrably live.
    if (this.isRecentlyLive(original.lastSeenAt)) {
      return { original, router: original, remapped: false, note: 'linked router record is currently live' }
    }

    if (!original.radiusNasIpAddress?.trim()) {
      return { original, router: original, remapped: false, note: 'linked router has no learned NAS address for safe successor matching' }
    }

    const cutoff = this.liveCutoff()
    const possible = await this.prisma.router.findMany({
      where: {
        tenantId: attempt.tenantId,
        id: { not: original.id },
        radiusNasIpAddress: original.radiusNasIpAddress,
        remoteSstpIp: { not: null },
        lastSeenAt: { gte: cutoff },
      },
      select: ROUTER_SELECT,
      orderBy: { lastSeenAt: 'desc' },
      take: 10,
    }) as RouterTarget[]

    const matching = possible.filter((candidate) => this.samePhysicalRouter(original, candidate))
    if (matching.length !== 1) {
      const reason = matching.length === 0
        ? 'no unambiguous live re-onboarded router record matched the stale linked router'
        : `multiple (${matching.length}) live router records matched; refusing to guess`
      return { original, router: original, remapped: false, note: reason }
    }

    const successor = matching[0]
    // Prefer a newer provisioning record when both timestamps are known.
    // If timestamps are missing, the recent heartbeat + exact physical hints
    // are still required before this point.
    if (
      original.lastProvisionedAt &&
      successor.lastProvisionedAt &&
      successor.lastProvisionedAt.getTime() <= original.lastProvisionedAt.getTime()
    ) {
      return {
        original,
        router: original,
        remapped: false,
        note: 'matching live router record is not newer than the linked router; refusing to remap',
      }
    }

    return {
      original,
      router: successor,
      remapped: true,
      note: `stale router record ${original.id} resolved to the only current live re-onboarding record ${successor.id}`,
    }
  }

  private samePhysicalRouter(original: RouterTarget, candidate: RouterTarget) {
    const originalSerial = this.normalizedIdentity(original.serialNumber)
    const candidateSerial = this.normalizedIdentity(candidate.serialNumber)
    if (originalSerial && candidateSerial) {
      return originalSerial === candidateSerial
    }

    const pairs: Array<[string | null, string | null]> = [
      [original.identity, candidate.identity],
      [original.siteLabel, candidate.siteLabel],
      [original.name, candidate.name],
    ]

    return pairs.some(([left, right]) => {
      const a = this.normalizedIdentity(left)
      const b = this.normalizedIdentity(right)
      return Boolean(a && b && a === b)
    })
  }

  private normalizedIdentity(value?: string | null) {
    return value?.trim().toLowerCase().replace(/\s+/g, ' ') || null
  }

  private liveCutoff() {
    const staleSeconds = Number.parseInt(process.env.ROUTER_STALE_WINDOW_SECONDS ?? '30', 10) || 30
    const safetyWindowSeconds = Math.max(60, staleSeconds * 2)
    return new Date(Date.now() - safetyWindowSeconds * 1000)
  }

  private isRecentlyLive(lastSeenAt?: Date | null) {
    return Boolean(lastSeenAt && lastSeenAt.getTime() >= this.liveCutoff().getTime())
  }

  private async logoutHotspotActiveSession(
    attempt: DisconnectAttempt,
    preferredRouter?: RouterTarget,
  ) {
    const route = preferredRouter
      ? ({ original: preferredRouter, router: preferredRouter, remapped: preferredRouter.id !== attempt.routerId, note: 'preferred resolved router' } satisfies DisconnectRoute)
      : await this.resolveDisconnectRoute(attempt)
    const router = route.router

    if (!router) {
      throw new Error(`RouterOS logout fallback unavailable: ${route.note}`)
    }

    const password = this.routerCredentialsService.decrypt(router.passwordCiphertext)
    const targetHost = router.remoteSstpIp || router.host
    if (!targetHost) {
      throw new Error(`RouterOS logout fallback unavailable: router ${router.id} has no management host`)
    }

    const result = await this.mikrotikService.removeHotspotActiveSession({
      host: targetHost,
      port: router.apiPort,
      useTls: router.connectionMode === 'ROUTEROS_API_SSL',
      username: router.username,
      password,
      hotspotUsername: attempt.username,
      macAddress: attempt.macAddress,
      timeoutMs: 5000,
    })

    if (result.removed <= 0) {
      throw new Error(`RouterOS logout fallback found no matching active HotSpot session on router ${router.id}`)
    }

    return result.removed
  }

  private runRadclientDisconnect(host: string, port: string, secret: string, packet: string) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('radclient', ['-x', `${host}:${port}`, 'disconnect', secret], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let settled = false
      let stdout = ''
      let stderr = ''

      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (error) reject(error)
        else resolve()
      }

      const timeout = setTimeout(() => {
        child.kill()
        finish(new Error('RADIUS Disconnect-Request timed out waiting for Disconnect-ACK'))
      }, 5000)

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => finish(error))
      child.on('close', (code) => {
        if (settled) return
        const output = `${stdout}\n${stderr}`
        if (/Received\s+Disconnect-ACK\b/i.test(output)) {
          finish()
          return
        }
        if (/Received\s+Disconnect-NAK\b/i.test(output)) {
          finish(new Error(`RADIUS Disconnect-NAK received${this.outputDetail(output)}`))
          return
        }
        const prefix = code === 0
          ? 'radclient completed without a Disconnect-ACK'
          : `radclient exited with code ${code}`
        finish(new Error(`${prefix}${this.outputDetail(output)}`))
      })

      child.stdin.write(packet)
      child.stdin.end()
    })
  }

  private outputDetail(output: string) {
    const compact = output.replace(/\s+/g, ' ').trim()
    return compact ? `: ${compact.slice(0, 700)}` : ''
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}
