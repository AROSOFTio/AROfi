import { Injectable, NotFoundException } from '@nestjs/common'
import {
  AgentStatus,
  FeatureLimit,
  PackageStatus,
  SessionStatus,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { AddSupportTicketMessageDto } from './dto/add-support-ticket-message.dto'
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto'
import { UpdateFeatureLimitDto } from './dto/update-feature-limit.dto'
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto'

type FeatureUsageSnapshot = {
  packages: number
  routers: number
  hotspots: number
  agents: number
  voucherBatches: number
  activeSessions: number
  openSupportTickets: number
}

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId?: string) {
    const [audit, featureLimits, support] = await Promise.all([
      this.getAuditLogs(tenantId),
      this.getFeatureLimits(tenantId),
      this.getSupportTickets(tenantId),
    ])

    const warningOrExceededLimits = featureLimits.items.filter(
      (limit) => limit.health === 'warning' || limit.health === 'exceeded' || limit.health === 'blocked',
    ).length
    const criticalAudits = audit.items.filter((item) => item.severity === 'CRITICAL').length

    return {
      summary: {
        auditEntries: audit.summary.totalEntries,
        criticalAudits,
        warningOrExceededLimits,
        openSupportTickets: support.summary.open,
        inProgressSupportTickets: support.summary.inProgress,
      },
      audit,
      featureLimits,
      support,
    }
  }

  async getAuditLogs(tenantId?: string) {
    const where = tenantId ? { tenantId } : undefined
    const items = await this.prisma.auditLog.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return {
      summary: {
        totalEntries: items.length,
        info: items.filter((item) => item.severity === 'INFO').length,
        warning: items.filter((item) => item.severity === 'WARNING').length,
        error: items.filter((item) => item.severity === 'ERROR').length,
        critical: items.filter((item) => item.severity === 'CRITICAL').length,
      },
      items,
    }
  }

  async getFeatureLimits(tenantId?: string) {
    const where = tenantId ? { tenantId } : undefined
    const limits = await this.prisma.featureLimit.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ tenantId: 'asc' }, { category: 'asc' }, { code: 'asc' }],
    })

    const usageByTenant = new Map<string, FeatureUsageSnapshot>()
    const tenantIds = Array.from(
      new Set(limits.map((limit) => limit.tenantId).filter((value): value is string => Boolean(value))),
    )

    await Promise.all(
      tenantIds.map(async (id) => {
        usageByTenant.set(id, await this.buildFeatureUsageSnapshot(id))
      }),
    )

    const items = limits.map((limit) => {
      const usage = limit.tenantId ? usageByTenant.get(limit.tenantId) : undefined
      const currentUsage = this.resolveCurrentUsage(limit, usage)
      const usagePercentage =
        limit.limitValue && limit.limitValue > 0
          ? Math.round((currentUsage / limit.limitValue) * 100)
          : null

      return {
        ...limit,
        currentUsage,
        usagePercentage,
        remaining:
          limit.limitValue === null
            ? null
            : Math.max(limit.limitValue - currentUsage, 0),
        health: this.resolveLimitHealth({
          isEnabled: limit.isEnabled,
          hardLimit: limit.hardLimit,
          limitValue: limit.limitValue,
          warningThresholdPct: limit.warningThresholdPct,
          currentUsage,
        }),
      }
    })

    return {
      summary: {
        totalLimits: items.length,
        enabled: items.filter((item) => item.isEnabled).length,
        warning: items.filter((item) => item.health === 'warning').length,
        exceeded: items.filter((item) => item.health === 'exceeded' || item.health === 'blocked').length,
      },
      items,
    }
  }

  async updateFeatureLimit(limitId: string, dto: UpdateFeatureLimitDto) {
    const existing = await this.prisma.featureLimit.findUnique({
      where: { id: limitId },
    })

    if (!existing) {
      throw new NotFoundException('Feature limit not found')
    }

    return this.prisma.featureLimit.update({
      where: { id: limitId },
      data: {
        name: dto.name?.trim(),
        category: dto.category,
        description: dto.description?.trim(),
        unit: dto.unit?.trim(),
        isEnabled: dto.isEnabled,
        limitValue: dto.limitValue,
        warningThresholdPct: dto.warningThresholdPct,
        hardLimit: dto.hardLimit,
        notes: dto.notes?.trim(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  }

  async getSupportTickets(tenantId?: string) {
    const where = tenantId ? { tenantId } : undefined
    const items = await this.prisma.supportTicket.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 120,
    })

    return {
      summary: {
        totalTickets: items.length,
        open: items.filter((ticket) => ticket.status === SupportTicketStatus.OPEN).length,
        inProgress: items.filter((ticket) => ticket.status === SupportTicketStatus.IN_PROGRESS).length,
        pendingCustomer: items.filter((ticket) => ticket.status === SupportTicketStatus.PENDING_CUSTOMER).length,
        resolved: items.filter((ticket) => ticket.status === SupportTicketStatus.RESOLVED).length,
        critical: items.filter((ticket) => ticket.priority === SupportTicketPriority.CRITICAL).length,
      },
      items,
    }
  }

  async createSupportTicket(dto: CreateSupportTicketDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true },
    })

    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    const reference = await this.resolveTicketReference(dto.tenantId, dto.reference)

    return this.prisma.supportTicket.create({
      data: {
        tenantId: dto.tenantId,
        reference,
        subject: dto.subject.trim(),
        category: dto.category.trim(),
        priority: dto.priority ?? SupportTicketPriority.NORMAL,
        status: dto.status ?? SupportTicketStatus.OPEN,
        channel: dto.channel,
        customerReference: dto.customerReference?.trim(),
        phoneNumber: dto.phoneNumber?.trim(),
        email: dto.email?.trim(),
        openedBy: dto.openedBy?.trim(),
        assignedTo: dto.assignedTo?.trim(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  async updateSupportTicket(ticketId: string, dto: UpdateSupportTicketDto) {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    })

    if (!existing) {
      throw new NotFoundException('Support ticket not found')
    }

    const resolvedStatuses = new Set<SupportTicketStatus>([
      SupportTicketStatus.RESOLVED,
      SupportTicketStatus.CLOSED,
    ])
    const nextStatus = dto.status ?? existing.status
    const now = new Date()

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: dto.status,
        priority: dto.priority,
        assignedTo: dto.assignedTo?.trim(),
        latestResponseAt: now,
        resolvedAt: resolvedStatuses.has(nextStatus) ? existing.resolvedAt ?? now : null,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  async addSupportTicketMessage(ticketId: string, dto: AddSupportTicketMessageDto) {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!existing) {
      throw new NotFoundException('Support ticket not found')
    }

    const now = new Date()
    const reopenedStatus =
      existing.status === SupportTicketStatus.RESOLVED || existing.status === SupportTicketStatus.CLOSED
        ? SupportTicketStatus.IN_PROGRESS
        : existing.status

    await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId,
          authorName: dto.authorName.trim(),
          authorRole: dto.authorRole.trim(),
          body: dto.body.trim(),
          isInternal: dto.isInternal ?? false,
        },
      }),
      this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          latestResponseAt: now,
          status: reopenedStatus,
          resolvedAt: reopenedStatus === SupportTicketStatus.IN_PROGRESS ? null : undefined,
        },
      }),
    ])

    return this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  private async buildFeatureUsageSnapshot(tenantId: string): Promise<FeatureUsageSnapshot> {
    const [
      packages,
      routers,
      hotspots,
      agents,
      voucherBatches,
      activeSessions,
      openSupportTickets,
    ] = await this.prisma.$transaction([
      this.prisma.package.count({
        where: {
          tenantId,
          status: {
            in: [PackageStatus.ACTIVE, PackageStatus.DRAFT],
          },
        },
      }),
      this.prisma.router.count({ where: { tenantId } }),
      this.prisma.hotspot.count({ where: { tenantId } }),
      this.prisma.agent.count({
        where: {
          tenantId,
          status: AgentStatus.ACTIVE,
        },
      }),
      this.prisma.voucherBatch.count({
        where: {
          tenantId,
        },
      }),
      this.prisma.networkSession.count({
        where: {
          tenantId,
          status: SessionStatus.ACTIVE,
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          tenantId,
          status: {
            in: [
              SupportTicketStatus.OPEN,
              SupportTicketStatus.IN_PROGRESS,
              SupportTicketStatus.PENDING_CUSTOMER,
            ],
          },
        },
      }),
    ])

    return {
      packages,
      routers,
      hotspots,
      agents,
      voucherBatches,
      activeSessions,
      openSupportTickets,
    }
  }

  private resolveCurrentUsage(limit: FeatureLimit, usage?: FeatureUsageSnapshot) {
    if (!usage) {
      return 0
    }

    switch (limit.code) {
      case 'packages':
        return usage.packages
      case 'routers':
        return usage.routers
      case 'hotspots':
        return usage.hotspots
      case 'agents':
        return usage.agents
      case 'voucher_batches':
        return usage.voucherBatches
      case 'active_sessions':
        return usage.activeSessions
      case 'open_support_tickets':
        return usage.openSupportTickets
      default:
        return 0
    }
  }

  private resolveLimitHealth(input: {
    isEnabled: boolean
    hardLimit: boolean
    limitValue: number | null
    warningThresholdPct: number
    currentUsage: number
  }) {
    if (!input.isEnabled) {
      return 'disabled'
    }

    if (input.limitValue === null || input.limitValue <= 0) {
      return 'unlimited'
    }

    if (input.currentUsage >= input.limitValue) {
      return input.hardLimit ? 'blocked' : 'exceeded'
    }

    const usagePercentage = Math.round((input.currentUsage / input.limitValue) * 100)
    if (usagePercentage >= input.warningThresholdPct) {
      return 'warning'
    }

    return 'healthy'
  }

  private async resolveTicketReference(tenantId: string, preferredReference?: string) {
    const cleanedPreferredReference = preferredReference?.trim().toUpperCase()
    if (cleanedPreferredReference) {
      return cleanedPreferredReference
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const generatedReference = `SUP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID()
        .slice(0, 6)
        .toUpperCase()}`
      const existing = await this.prisma.supportTicket.findFirst({
        where: {
          tenantId,
          reference: generatedReference,
        },
        select: { id: true },
      })

      if (!existing) {
        return generatedReference
      }
    }

    return `SUP-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`
  }
}
