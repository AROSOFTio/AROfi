import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, SubscriptionPlanTier } from '@prisma/client'
import { promises as dns } from 'dns'
import { isIP } from 'net'
import { randomBytes, randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'
import {
  CreateEnterprisePaymentConnectorDto,
  EnterpriseConnectorAuthDto,
  EnterpriseConnectorCollectDto,
  EnterpriseConnectorStatusDto,
} from './dto/enterprise-payment-connector.dto'
import { EnterprisePaymentConnectorCrypto } from './enterprise-payment-connector.crypto'

export type EnterprisePaymentConnectorRow = {
  id: string
  tenantId: string
  name: string
  slug: string
  countryCode: string
  currency: string
  networkCode: string
  providerName: string
  collectionUrl: string
  statusUrl: string | null
  disbursementUrl: string | null
  disbursementStatusUrl: string | null
  collectionMethod: string
  statusMethod: string
  disbursementMethod: string
  headers: Record<string, string>
  staticBody: Record<string, unknown>
  authCiphertext: string
  fieldMap: Record<string, string>
  responseMap: Record<string, string>
  statusMap: {
    success?: string[]
    pending?: string[]
    failed?: string[]
    cancelled?: string[]
  }
  webhookTokenCiphertext: string
  supportsCollections: boolean
  supportsDisbursements: boolean
  enabled: boolean
  lastValidatedAt: Date | null
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type ConnectorResult = {
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'UNKNOWN'
  rawStatus: string
  providerReference?: string
  checkoutUrl?: string
  message?: string
  amount?: string
  currency?: string
  raw: unknown
}

@Injectable()
export class EnterprisePaymentConnectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly crypto: EnterprisePaymentConnectorCrypto,
  ) {}

  async list(tenantId: string) {
    await this.assertEnterprise(tenantId)
    const rows = await this.prisma.$queryRaw<EnterprisePaymentConnectorRow[]>(Prisma.sql`
      SELECT * FROM "EnterprisePaymentConnector"
      WHERE "tenantId" = ${tenantId}
      ORDER BY "createdAt" DESC
    `)
    return rows.map((row) => this.toPublic(row))
  }

  async create(tenantId: string, dto: CreateEnterprisePaymentConnectorDto) {
    await this.assertEnterprise(tenantId)
    await this.validateDto(dto)

    const id = randomUUID()
    const slug = this.slug(dto.name)
    const webhookToken = randomBytes(32).toString('base64url')
    const authCiphertext = this.crypto.encryptObject(dto.auth as unknown as Record<string, unknown>)
    const webhookTokenCiphertext = this.crypto.encryptText(webhookToken)
    const headers = dto.headers ?? {}
    const staticBody = dto.staticBody ?? {}
    const fields = dto.fields as unknown as Record<string, string>
    const response = dto.response as unknown as Record<string, string>
    const statusMap = dto.statusMap as unknown as Record<string, string[]>

    try {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "EnterprisePaymentConnector" (
          "id", "tenantId", "name", "slug", "countryCode", "currency", "networkCode", "providerName",
          "collectionUrl", "statusUrl", "disbursementUrl", "disbursementStatusUrl",
          "collectionMethod", "statusMethod", "disbursementMethod", "headers", "staticBody",
          "authCiphertext", "fieldMap", "responseMap", "statusMap", "webhookTokenCiphertext",
          "supportsCollections", "supportsDisbursements", "enabled", "updatedAt"
        ) VALUES (
          ${id}, ${tenantId}, ${dto.name.trim()}, ${slug}, ${dto.countryCode.toUpperCase()},
          ${dto.currency.toUpperCase()}, ${dto.networkCode.toUpperCase()}, ${dto.providerName.trim()},
          ${dto.collectionUrl.trim()}, ${dto.statusUrl?.trim() ?? null}, ${dto.disbursementUrl?.trim() ?? null},
          ${dto.disbursementStatusUrl?.trim() ?? null}, ${(dto.collectionMethod ?? 'POST').toUpperCase()},
          ${(dto.statusMethod ?? 'GET').toUpperCase()}, ${(dto.disbursementMethod ?? 'POST').toUpperCase()},
          CAST(${JSON.stringify(headers)} AS jsonb), CAST(${JSON.stringify(staticBody)} AS jsonb),
          ${authCiphertext}, CAST(${JSON.stringify(fields)} AS jsonb), CAST(${JSON.stringify(response)} AS jsonb),
          CAST(${JSON.stringify(statusMap)} AS jsonb), ${webhookTokenCiphertext},
          ${dto.supportsCollections ?? true}, ${dto.supportsDisbursements ?? Boolean(dto.disbursementUrl)},
          ${dto.enabled ?? true}, CURRENT_TIMESTAMP
        )
      `)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes('unique')) {
        throw new BadRequestException('A payment connector with this name already exists')
      }
      throw error
    }

    const row = await this.getRow(id, tenantId)
    return this.toPublic(row, webhookToken)
  }

  async remove(tenantId: string, connectorId: string) {
    await this.assertEnterprise(tenantId)
    const row = await this.getRow(connectorId, tenantId)
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "EnterprisePaymentConnector" WHERE "id" = ${row.id} AND "tenantId" = ${tenantId}
    `)
    return { deleted: true, id: row.id }
  }

  async validate(tenantId: string, connectorId: string) {
    await this.assertEnterprise(tenantId)
    const row = await this.getRow(connectorId, tenantId)
    await this.assertSafeUrl(row.collectionUrl)
    if (row.statusUrl) await this.assertSafeUrl(row.statusUrl)
    if (row.disbursementUrl) await this.assertSafeUrl(row.disbursementUrl)
    if (row.disbursementStatusUrl) await this.assertSafeUrl(row.disbursementStatusUrl)

    const auth = this.crypto.decryptObject<EnterpriseConnectorAuthDto & Record<string, unknown>>(row.authCiphertext)
    if (auth.type === 'OAUTH2_CLIENT_CREDENTIALS') {
      await this.oauthToken(auth)
    }

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "EnterprisePaymentConnector"
      SET "lastValidatedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.id}
    `)

    return {
      valid: true,
      connector: this.toPublic({ ...row, lastValidatedAt: new Date() }),
      note:
        auth.type === 'OAUTH2_CLIENT_CREDENTIALS'
          ? 'Configuration and OAuth credentials validated.'
          : 'Configuration validated. No charge was created during validation.',
    }
  }

  async collect(tenantId: string, connectorId: string, dto: EnterpriseConnectorCollectDto) {
    await this.assertEnterprise(tenantId)
    const row = await this.getRow(connectorId, tenantId)
    if (!row.enabled || !row.supportsCollections) {
      throw new BadRequestException('This connector is not enabled for collections')
    }

    await this.assertSafeUrl(row.collectionUrl)
    const body = structuredClone(row.staticBody ?? {}) as Record<string, unknown>
    this.setPath(body, row.fieldMap.amount || 'amount', dto.amount)
    this.setPath(body, row.fieldMap.currency || 'currency', row.currency)
    this.setPath(body, row.fieldMap.phone || 'phoneNumber', dto.phoneNumber)
    this.setPath(body, row.fieldMap.reference || 'reference', dto.externalReference)
    if (row.fieldMap.narrative && dto.narrative) this.setPath(body, row.fieldMap.narrative, dto.narrative)
    if (row.fieldMap.customerReference && dto.customerReference) {
      this.setPath(body, row.fieldMap.customerReference, dto.customerReference)
    }
    if (row.fieldMap.callbackUrl && dto.callbackUrl) this.setPath(body, row.fieldMap.callbackUrl, dto.callbackUrl)

    const response = await this.request(row, row.collectionUrl, row.collectionMethod, body)
    await this.touch(row.id)
    return this.mapResult(row, response)
  }

  async status(tenantId: string, connectorId: string, dto: EnterpriseConnectorStatusDto) {
    await this.assertEnterprise(tenantId)
    const row = await this.getRow(connectorId, tenantId)
    if (!row.statusUrl) {
      throw new BadRequestException('This connector has no status endpoint configured')
    }

    const rendered = row.statusUrl.replace(/\{\{\s*reference\s*\}\}/gi, encodeURIComponent(dto.reference))
    await this.assertSafeUrl(rendered)
    const method = (row.statusMethod || 'GET').toUpperCase()
    const body: Record<string, unknown> = {}
    if (!row.statusUrl.includes('{{reference}}') && method !== 'GET') {
      this.setPath(body, row.fieldMap.reference || 'reference', dto.reference)
    }

    let url = rendered
    if (!row.statusUrl.includes('{{reference}}') && method === 'GET') {
      const target = new URL(rendered)
      target.searchParams.set(row.fieldMap.reference || 'reference', dto.reference)
      url = target.toString()
    }

    const response = await this.request(row, url, method, body)
    await this.touch(row.id)
    return this.mapResult(row, response)
  }

  async handleWebhook(connectorId: string, token: string, payload: Record<string, unknown>) {
    const row = await this.getRow(connectorId)
    if (!row.enabled) throw new NotFoundException('Payment connector not found')
    await this.assertEnterprise(row.tenantId)

    const expected = this.crypto.decryptText(row.webhookTokenCiphertext)
    if (!token || token !== expected) {
      throw new ForbiddenException('Invalid payment connector webhook token')
    }

    await this.touch(row.id)
    return {
      received: true,
      connectorId: row.id,
      tenantId: row.tenantId,
      result: this.mapResult(row, payload),
    }
  }

  private async request(
    row: EnterprisePaymentConnectorRow,
    url: string,
    methodInput: string,
    body: Record<string, unknown>,
  ) {
    await this.assertSafeUrl(url)
    const auth = this.crypto.decryptObject<EnterpriseConnectorAuthDto & Record<string, unknown>>(row.authCiphertext)
    const authHeaders = await this.authHeaders(auth)
    const method = (methodInput || 'POST').toUpperCase()
    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) {
      throw new BadRequestException(`Unsupported connector HTTP method ${method}`)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(url, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
          ...(row.headers ?? {}),
          ...authHeaders,
        },
        ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
      })

      if (response.status >= 300 && response.status < 400) {
        throw new ServiceUnavailableException('Payment provider redirects are disabled for server-to-server connector calls')
      }

      const text = await response.text()
      let parsed: unknown = text
      try {
        parsed = text ? JSON.parse(text) : {}
      } catch {
        // Some provider status endpoints return plain text; preserve it as-is.
      }

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Payment provider returned HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
        )
      }
      return parsed
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new ServiceUnavailableException(`Payment provider request failed: ${message}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async authHeaders(auth: EnterpriseConnectorAuthDto & Record<string, unknown>) {
    switch (auth.type) {
      case 'NONE':
        return {}
      case 'BEARER_STATIC':
        if (!auth.token) throw new BadRequestException('Bearer token is missing')
        return { Authorization: `Bearer ${auth.token}` }
      case 'API_KEY_HEADER':
        if (!auth.apiKey) throw new BadRequestException('API key is missing')
        return { [auth.headerName || 'X-API-Key']: auth.apiKey }
      case 'BASIC': {
        if (!auth.username || !auth.password) throw new BadRequestException('Basic auth username/password is missing')
        const value = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
        return { Authorization: `Basic ${value}` }
      }
      case 'OAUTH2_CLIENT_CREDENTIALS': {
        const token = await this.oauthToken(auth)
        return { Authorization: `Bearer ${token}` }
      }
      default:
        throw new BadRequestException(`Unsupported connector auth type ${String(auth.type)}`)
    }
  }

  private async oauthToken(auth: EnterpriseConnectorAuthDto & Record<string, unknown>) {
    if (!auth.tokenUrl || !auth.clientId || !auth.clientSecret) {
      throw new BadRequestException('OAuth2 token URL, client ID and client secret are required')
    }
    await this.assertSafeUrl(auth.tokenUrl)

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
    })
    if (auth.scope) body.set('scope', auth.scope)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(auth.tokenUrl, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      })
      if (!response.ok) {
        throw new ServiceUnavailableException(`OAuth token endpoint returned HTTP ${response.status}`)
      }
      const payload = (await response.json()) as Record<string, unknown>
      const token = this.getPath(payload, auth.tokenField || 'access_token')
      if (typeof token !== 'string' || !token) {
        throw new ServiceUnavailableException('OAuth token response did not contain the configured token field')
      }
      return token
    } finally {
      clearTimeout(timeout)
    }
  }

  private mapResult(row: EnterprisePaymentConnectorRow, raw: unknown): ConnectorResult {
    const object = this.asObject(raw)
    const rawStatusValue = this.getPath(object, row.responseMap.status || 'status')
    const rawStatus = String(rawStatusValue ?? '').trim()
    const normalized = rawStatus.toUpperCase()
    const status = this.mapStatus(row.statusMap, normalized)

    return {
      status,
      rawStatus,
      providerReference: this.stringAt(object, row.responseMap.providerReference),
      checkoutUrl: this.stringAt(object, row.responseMap.checkoutUrl),
      message: this.stringAt(object, row.responseMap.message),
      amount: this.stringAt(object, row.responseMap.amount),
      currency: this.stringAt(object, row.responseMap.currency),
      raw,
    }
  }

  private mapStatus(map: EnterprisePaymentConnectorRow['statusMap'], status: string): ConnectorResult['status'] {
    const has = (values?: string[]) => (values ?? []).some((value) => value.toUpperCase() === status)
    if (has(map.success)) return 'COMPLETED'
    if (has(map.failed)) return 'FAILED'
    if (has(map.cancelled)) return 'CANCELLED'
    if (has(map.pending)) return 'PENDING'
    return 'UNKNOWN'
  }

  private async validateDto(dto: CreateEnterprisePaymentConnectorDto) {
    await this.assertSafeUrl(dto.collectionUrl)
    if (dto.statusUrl) await this.assertSafeUrl(dto.statusUrl)
    if (dto.disbursementUrl) await this.assertSafeUrl(dto.disbursementUrl)
    if (dto.disbursementStatusUrl) await this.assertSafeUrl(dto.disbursementStatusUrl)
    if (dto.auth?.tokenUrl) await this.assertSafeUrl(dto.auth.tokenUrl)

    const methods = [dto.collectionMethod ?? 'POST', dto.statusMethod ?? 'GET', dto.disbursementMethod ?? 'POST']
    for (const method of methods) {
      if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        throw new BadRequestException(`Unsupported connector HTTP method ${method}`)
      }
    }
  }

  private async assertEnterprise(tenantId: string) {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true },
    })
    const tier = settings
      ? resolveEffectiveSubscriptionTier(settings.subscriptionPlan, settings.subscriptionPlanExpiresAt)
      : SubscriptionPlanTier.FREE
    if (tier !== SubscriptionPlanTier.ENTERPRISE) {
      throw new ForbiddenException('Bring Your Own Payment API is available on the Enterprise plan')
    }
  }

  private async getRow(connectorId: string, tenantId?: string) {
    const rows = await this.prisma.$queryRaw<EnterprisePaymentConnectorRow[]>(Prisma.sql`
      SELECT * FROM "EnterprisePaymentConnector"
      WHERE "id" = ${connectorId}
      ${tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.empty}
      LIMIT 1
    `)
    const row = rows[0]
    if (!row) throw new NotFoundException('Payment connector not found')
    return row
  }

  private async touch(connectorId: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "EnterprisePaymentConnector"
      SET "lastUsedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${connectorId}
    `)
  }

  private toPublic(row: EnterprisePaymentConnectorRow, webhookToken?: string) {
    const auth = this.crypto.decryptObject<EnterpriseConnectorAuthDto & Record<string, unknown>>(row.authCiphertext)
    const token = webhookToken ?? this.crypto.decryptText(row.webhookTokenCiphertext)
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      countryCode: row.countryCode,
      currency: row.currency,
      networkCode: row.networkCode,
      providerName: row.providerName,
      collectionUrl: row.collectionUrl,
      statusUrl: row.statusUrl,
      disbursementUrl: row.disbursementUrl,
      disbursementStatusUrl: row.disbursementStatusUrl,
      collectionMethod: row.collectionMethod,
      statusMethod: row.statusMethod,
      disbursementMethod: row.disbursementMethod,
      fields: row.fieldMap,
      response: row.responseMap,
      statusMap: row.statusMap,
      supportsCollections: row.supportsCollections,
      supportsDisbursements: row.supportsDisbursements,
      enabled: row.enabled,
      authType: auth.type,
      credentialsConfigured: auth.type !== 'NONE',
      webhookUrl: this.webhookUrl(row.id, token),
      lastValidatedAt: row.lastValidatedAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private webhookUrl(connectorId: string, token: string) {
    const configured =
      this.configService.get<string>('API_PUBLIC_URL') ||
      this.configService.get<string>('API_PUBLIC_HOST') ||
      this.configService.get<string>('PUBLIC_API_URL') ||
      ''
    const base = configured.replace(/\/$/, '').replace(/\/api$/, '')
    const path = `/api/enterprise-payment-connectors/webhooks/${encodeURIComponent(connectorId)}/${encodeURIComponent(token)}`
    return base ? `${base}${path}` : path
  }

  private slug(value: string) {
    const result = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
    return result || `connector-${randomBytes(4).toString('hex')}`
  }

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value }
  }

  private getPath(source: Record<string, unknown>, path: string) {
    return path
      .split('.')
      .filter(Boolean)
      .reduce<unknown>((current, key) => {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
        return (current as Record<string, unknown>)[key]
      }, source)
  }

  private stringAt(source: Record<string, unknown>, path?: string) {
    if (!path) return undefined
    const value = this.getPath(source, path)
    return value == null ? undefined : String(value)
  }

  private setPath(target: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split('.').filter(Boolean)
    if (!parts.length) return
    let current = target
    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index]
      const existing = current[key]
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) current[key] = {}
      current = current[key] as Record<string, unknown>
    }
    current[parts[parts.length - 1]] = value
  }

  private async assertSafeUrl(value: string) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new BadRequestException('Payment connector URL is invalid')
    }

    if (url.username || url.password) {
      throw new BadRequestException('Do not place credentials inside payment connector URLs')
    }
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
      throw new BadRequestException('Payment connector endpoints must use HTTPS')
    }

    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new BadRequestException('Payment connector endpoints cannot target local hosts')
    }

    if (isIP(host)) {
      if (this.isPrivateIp(host)) throw new BadRequestException('Payment connector endpoints cannot target private IP addresses')
      return
    }

    let addresses: Array<{ address: string }> = []
    try {
      addresses = await dns.lookup(host, { all: true })
    } catch {
      throw new BadRequestException(`Payment connector host ${host} could not be resolved`)
    }
    if (!addresses.length || addresses.some((item) => this.isPrivateIp(item.address))) {
      throw new BadRequestException('Payment connector host resolves to a private or unsupported address')
    }
  }

  private isPrivateIp(address: string) {
    if (address.includes(':')) {
      const normalized = address.toLowerCase()
      return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
    }

    const octets = address.split('.').map(Number)
    if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) return true
    const [a, b] = octets
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    )
  }
}
