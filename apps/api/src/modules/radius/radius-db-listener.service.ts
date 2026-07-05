import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Client } from 'pg'
import { RadiusSignalSyncService } from './radius-signal-sync.service'

const CHANNEL = 'arofi_radius_events'
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

// Primary realtime path from FreeRADIUS to the API. FreeRADIUS (rlm_sql)
// writes accounting/auth rows straight into Postgres; database triggers
// (see migration 20260705020000) pg_notify on this channel, and this
// dedicated LISTEN connection reacts within milliseconds — no polling.
// The AccessLifecycleService polling sweep stays as the fallback for
// anything missed while this connection is down.
@Injectable()
export class RadiusDbListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadiusDbListenerService.name)
  private client: Client | null = null
  private stopped = false
  private reconnectDelayMs = RECONNECT_MIN_MS
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(private readonly signalSync: RadiusSignalSyncService) {}

  async onModuleInit() {
    if ((process.env.RADIUS_DB_LISTEN_ENABLED ?? 'true') !== 'true') {
      this.logger.warn('RADIUS_DB_LISTEN_ENABLED=false — realtime RADIUS bridge disabled, falling back to polling only')
      return
    }
    if (!process.env.DATABASE_URL) {
      this.logger.error('DATABASE_URL is not set — RADIUS realtime bridge cannot start')
      return
    }
    await this.connect()
  }

  async onModuleDestroy() {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    await this.client?.end().catch(() => undefined)
    this.client = null
  }

  private async connect() {
    if (this.stopped) {
      return
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL })
    this.client = client

    client.on('notification', (message) => {
      if (message.channel !== CHANNEL || !message.payload) {
        return
      }
      void this.handleNotification(message.payload)
    })

    client.on('error', (error) => {
      this.logger.warn(`RADIUS listener connection error: ${error.message}`)
      this.scheduleReconnect()
    })

    client.on('end', () => {
      if (!this.stopped) {
        this.scheduleReconnect()
      }
    })

    try {
      await client.connect()
      await client.query(`LISTEN ${CHANNEL}`)
      this.reconnectDelayMs = RECONNECT_MIN_MS
      this.logger.log(`Listening for FreeRADIUS events on Postgres channel "${CHANNEL}"`)
    } catch (error) {
      this.logger.warn(
        `RADIUS listener failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      )
      await client.end().catch(() => undefined)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return
    }
    const delay = this.reconnectDelayMs
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.cleanupAndReconnect()
    }, delay)
    if (typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref()
    }
  }

  private async cleanupAndReconnect() {
    await this.client?.end().catch(() => undefined)
    this.client = null
    await this.connect()
  }

  private async handleNotification(payload: string) {
    let parsed: { table?: string; id?: number | string }
    try {
      parsed = JSON.parse(payload)
    } catch {
      this.logger.warn(`Ignoring malformed RADIUS notification payload: ${payload.slice(0, 200)}`)
      return
    }

    try {
      if (parsed.table === 'radacct' && parsed.id != null) {
        await this.signalSync.processAcctRowById(BigInt(parsed.id))
      } else if (parsed.table === 'radpostauth' && parsed.id != null) {
        await this.signalSync.processPostAuthRowById(Number(parsed.id))
      }
    } catch (error) {
      this.logger.warn(
        `Failed to process RADIUS notification for ${parsed.table}#${parsed.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
