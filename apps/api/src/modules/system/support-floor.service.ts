import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import {
  SupportTicketChannel,
  SupportTicketPriority,
  SupportTicketStatus,
  SubscriptionPlanTier,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import type { AuthenticatedAdminUser } from '../auth/auth.module'
import { PERMISSIONS } from '../auth/permissions.constants'
import { MailService } from '../mail/mail.service'
import { resolveEffectiveSubscriptionTier } from '../subscription/subscription-plan.util'
import {
  AddSupportFloorMessageDto,
  CreateSupportFloorTicketDto,
  UpdateSupportFloorTicketDto,
} from './dto/support-floor.dto'

const PLATFORM_SUPPORT_ROLES = new Set([
  'SuperAdmin',
  'Support',
  'ReadOnlySupport',
  'NetworkOperator',
  'FinanceManager',
  'WifiAdmin',
])
const ASSIGNABLE_SUPPORT_ROLES = new Set([
  'SuperAdmin',
  'Support',
  'NetworkOperator',
  'FinanceManager',
  'WifiAdmin',
])
const FINAL_STATUSES = new Set<SupportTicketStatus>([SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED])

@Injectable()
export class SupportFloorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async listTickets(user: AuthenticatedAdminUser, requestedTenantId?: string) {
    const tenantId = this.resolveSupportScope(user, requestedTenantId)
    const items = await this.prisma.supportTicket.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        tenant: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ latestResponseAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 250,
    })

    const assignees = await this.resolveAssignees(items.map((ticket) => ticket.assignedTo))
    const presented = items.map((ticket) => this.presentTicket(ticket, assignees.get(ticket.assignedTo ?? '') ?? null))

    return {
      summary: {
        totalTickets: presented.length,
        open: presented.filter((ticket) => ticket.status === SupportTicketStatus.OPEN).length,
        inProgress: presented.filter((ticket) => ticket.status === SupportTicketStatus.IN_PROGRESS).length,
        pendingCustomer: presented.filter((ticket) => ticket.status === SupportTicketStatus.PENDING_CUSTOMER).length,
        resolved: presented.filter((ticket) => ticket.status === SupportTicketStatus.RESOLVED).length,
        closed: presented.filter((ticket) => ticket.status === SupportTicketStatus.CLOSED).length,
        critical: presented.filter((ticket) => ticket.priority === SupportTicketPriority.CRITICAL).length,
      },
      items: presented,
    }
  }

  async listAssignableStaff(user: AuthenticatedAdminUser) {
    this.assertPlatformSupportUser(user)
    const users = await this.prisma.user.findMany({
      where: { tenantId: null, isActive: true },
      include: { role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    })

    return {
      items: users
        .filter((staff) =>
          ASSIGNABLE_SUPPORT_ROLES.has(staff.role.name) &&
          (staff.role.permissions.includes(PERMISSIONS.supportWrite) || staff.role.permissions.includes(PERMISSIONS.all)),
        )
        .map((staff) => ({
          id: staff.id,
          email: staff.email,
          displayName: this.displayName(staff),
          role: staff.role.name,
        })),
    }
  }

  async createTicket(user: AuthenticatedAdminUser, dto: CreateSupportFloorTicketDto) {
    const tenantId = this.resolveTicketTenant(user, dto.tenantId)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        tenantSettings: { select: { subscriptionPlan: true, subscriptionPlanExpiresAt: true } },
      },
    })
    if (!tenant) throw new NotFoundException('Business not found')

    const effectiveTier = tenant.tenantSettings
      ? resolveEffectiveSubscriptionTier(tenant.tenantSettings.subscriptionPlan, tenant.tenantSettings.subscriptionPlanExpiresAt)
      : SubscriptionPlanTier.FREE
    const priority = dto.priority ?? (effectiveTier === SubscriptionPlanTier.ENTERPRISE ? SupportTicketPriority.HIGH : SupportTicketPriority.NORMAL)
    const reference = this.makeReference()
    const now = new Date()
    const isBusiness = Boolean(user.tenantId)

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          tenantId,
          reference,
          subject: dto.subject.trim(),
          category: dto.category.trim(),
          priority,
          status: SupportTicketStatus.OPEN,
          channel: SupportTicketChannel.PORTAL,
          phoneNumber: dto.phoneNumber?.trim() || null,
          email: dto.email?.trim().toLowerCase() || user.email,
          openedBy: user.displayName,
          latestResponseAt: now,
        },
      })
      await tx.supportTicketMessage.create({
        data: {
          ticketId: created.id,
          authorName: user.displayName,
          authorRole: isBusiness ? 'Business' : this.roleLabel(user.role),
          body: dto.body.trim(),
          isInternal: false,
        },
      })
      return created
    })

    const detailed = await this.getDetailedTicket(ticket.id, tenantId)
    await this.notifySupportNewTicket(detailed, dto.body.trim()).catch(() => undefined)
    return detailed
  }

  async updateTicket(
    user: AuthenticatedAdminUser,
    ticketId: string,
    dto: UpdateSupportFloorTicketDto,
  ) {
    this.assertPlatformSupportUser(user)
    const existing = await this.getTicketForScope(user, ticketId)
    const changes: string[] = []
    const data: {
      status?: SupportTicketStatus
      priority?: SupportTicketPriority
      assignedTo?: string | null
      resolvedAt?: Date | null
    } = {}

    if (dto.status !== undefined && dto.status !== existing.status) {
      data.status = dto.status
      data.resolvedAt = FINAL_STATUSES.has(dto.status) ? existing.resolvedAt ?? new Date() : null
      changes.push(`Status changed to ${this.cleanStatus(dto.status)}`)
    }
    if (dto.priority !== undefined && dto.priority !== existing.priority) {
      data.priority = dto.priority
      changes.push(`Priority changed to ${dto.priority.toLowerCase()}`)
    }

    let assignee: Awaited<ReturnType<SupportFloorService['findAssignableStaff']>> | null | undefined
    if (dto.assigneeUserId !== undefined) {
      assignee = dto.assigneeUserId ? await this.findAssignableStaff(dto.assigneeUserId) : null
      const nextEmail = assignee?.email ?? null
      if (nextEmail !== existing.assignedTo) {
        data.assignedTo = nextEmail
        changes.push(assignee ? `Assigned to ${this.displayName(assignee)}` : 'Assignment cleared')
      }
    }

    if (changes.length === 0) {
      return this.getDetailedTicket(existing.id, existing.tenantId)
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id: existing.id }, data })
      await tx.supportTicketMessage.create({
        data: {
          ticketId: existing.id,
          authorName: user.displayName,
          authorRole: this.roleLabel(user.role),
          body: `${changes.join(' · ')}.`,
          isInternal: true,
        },
      })
    })

    const updated = await this.getDetailedTicket(existing.id, existing.tenantId)
    if (assignee && assignee.email !== existing.assignedTo) {
      await this.notifyAssignee(updated, assignee.email).catch(() => undefined)
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.notifyRequesterStatus(updated).catch(() => undefined)
    }
    return updated
  }

  async addMessage(user: AuthenticatedAdminUser, ticketId: string, dto: AddSupportFloorMessageDto) {
    const existing = await this.getTicketForScope(user, ticketId)
    const isBusiness = Boolean(user.tenantId)
    const isInternal = !isBusiness && dto.isInternal === true

    if (isBusiness && dto.isInternal) {
      throw new ForbiddenException('Business users cannot create internal support notes')
    }
    if (isBusiness && dto.statusAfterReply !== undefined) {
      throw new ForbiddenException('Business users cannot change support workflow status')
    }

    let nextStatus = existing.status
    if (isBusiness && FINAL_STATUSES.has(existing.status)) {
      nextStatus = SupportTicketStatus.OPEN
    } else if (!isBusiness && dto.statusAfterReply !== undefined) {
      nextStatus = dto.statusAfterReply
    }

    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicketMessage.create({
        data: {
          ticketId: existing.id,
          authorName: user.displayName,
          authorRole: isBusiness ? 'Business' : this.roleLabel(user.role),
          body: dto.body.trim(),
          isInternal,
        },
      })
      await tx.supportTicket.update({
        where: { id: existing.id },
        data: {
          latestResponseAt: now,
          status: nextStatus,
          resolvedAt: FINAL_STATUSES.has(nextStatus) ? existing.resolvedAt ?? now : null,
        },
      })
    })

    const updated = await this.getDetailedTicket(existing.id, existing.tenantId)
    if (!isInternal) {
      if (isBusiness) {
        await this.notifySupportCustomerReply(updated, dto.body.trim()).catch(() => undefined)
      } else {
        await this.notifyRequesterReply(updated, user.displayName, dto.body.trim()).catch(() => undefined)
      }
    }
    return updated
  }

  private async getTicketForScope(user: AuthenticatedAdminUser, ticketId: string) {
    const tenantId = this.resolveSupportScope(user)
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, ...(tenantId ? { tenantId } : {}) },
    })
    if (!ticket) throw new NotFoundException('Support ticket not found')
    return ticket
  }

  private async getDetailedTicket(ticketId: string, tenantId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        tenant: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })
    if (!ticket) throw new NotFoundException('Support ticket not found')
    const assignees = await this.resolveAssignees([ticket.assignedTo])
    return this.presentTicket(ticket, assignees.get(ticket.assignedTo ?? '') ?? null)
  }

  private resolveSupportScope(user: AuthenticatedAdminUser, requestedTenantId?: string) {
    if (this.isPlatformSupportUser(user)) return requestedTenantId || undefined
    if (!user.tenantId) throw new ForbiddenException('This account is not allowed to access the platform support queue')
    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException('You can only access support tickets for your own business')
    }
    return user.tenantId
  }

  private resolveTicketTenant(user: AuthenticatedAdminUser, requestedTenantId?: string) {
    const scope = this.resolveSupportScope(user, requestedTenantId)
    const tenantId = user.tenantId ?? scope ?? requestedTenantId
    if (!tenantId) throw new BadRequestException('Select a business before creating this ticket')
    return tenantId
  }

  private isPlatformSupportUser(user: AuthenticatedAdminUser) {
    return user.permissions.includes(PERMISSIONS.all) || (user.tenantId === null && PLATFORM_SUPPORT_ROLES.has(user.role))
  }

  private assertPlatformSupportUser(user: AuthenticatedAdminUser) {
    if (!this.isPlatformSupportUser(user)) {
      throw new ForbiddenException('Only AROFi support staff can manage assignment and workflow status')
    }
  }

  private async findAssignableStaff(userId: string) {
    const staff = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
    if (
      !staff ||
      !staff.isActive ||
      staff.tenantId !== null ||
      !ASSIGNABLE_SUPPORT_ROLES.has(staff.role.name) ||
      (!staff.role.permissions.includes(PERMISSIONS.supportWrite) && !staff.role.permissions.includes(PERMISSIONS.all))
    ) {
      throw new BadRequestException('Select an active AROFi support staff user')
    }
    return staff
  }

  private async resolveAssignees(values: Array<string | null>) {
    const emails = Array.from(new Set(values.filter((value): value is string => Boolean(value && value.includes('@')))))
    if (emails.length === 0) return new Map<string, { id: string; email: string; firstName: string | null; lastName: string | null; role: { name: string } }>()
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails } },
      include: { role: { select: { name: true } } },
    })
    return new Map(users.map((staff) => [staff.email, staff]))
  }

  private presentTicket(ticket: any, assignee: any) {
    return {
      ...ticket,
      assignee: assignee
        ? {
            id: assignee.id,
            email: assignee.email,
            displayName: this.displayName(assignee),
            role: assignee.role?.name ?? 'Support',
          }
        : null,
    }
  }

  private displayName(user: { firstName?: string | null; lastName?: string | null; email: string }) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email
  }

  private roleLabel(role: string) {
    if (role === 'SuperAdmin') return 'Developer Admin'
    if (role === 'Support') return 'Support Officer'
    if (role === 'WifiAdmin') return 'Administrator'
    return role.replace(/([a-z])([A-Z])/g, '$1 $2')
  }

  private cleanStatus(status: SupportTicketStatus) {
    return status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  private makeReference() {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `SUP-${day}-${randomUUID().slice(0, 8).toUpperCase()}`
  }

  private supportAddress() {
    return process.env.SUPPORT_EMAIL?.trim() || 'support@arofi.net'
  }

  private async notifySupportNewTicket(ticket: any, body: string) {
    await this.mailService.sendMail({
      to: this.supportAddress(),
      subject: `[AROFi Support] ${ticket.priority} ${ticket.reference} - ${ticket.subject}`,
      html: this.emailLayout(ticket, body, 'New support ticket'),
      text: `New AROFi support ticket\n${ticket.reference}\n${ticket.tenant?.name ?? ''}\n${ticket.subject}\n\n${body}`,
    })
  }

  private async notifySupportCustomerReply(ticket: any, body: string) {
    await this.mailService.sendMail({
      to: this.supportAddress(),
      subject: `[AROFi Support Reply] ${ticket.reference} - ${ticket.subject}`,
      html: this.emailLayout(ticket, body, 'Customer replied'),
      text: `Customer replied to ${ticket.reference}\nBusiness: ${ticket.tenant?.name ?? ''}\n\n${body}`,
    })
  }

  private async notifyRequesterReply(ticket: any, from: string, body: string) {
    const to = ticket.email?.trim()
    if (!to) return
    await this.mailService.sendMail({
      to,
      subject: `AROFi support reply - ${ticket.reference}`,
      html: this.emailLayout(ticket, body, `Reply from ${from}`),
      text: `AROFi support replied to ${ticket.reference}\nFrom: ${from}\n\n${body}`,
    })
  }

  private async notifyRequesterStatus(ticket: any) {
    const to = ticket.email?.trim()
    if (!to) return
    await this.mailService.sendMail({
      to,
      subject: `AROFi ticket ${ticket.reference}: ${this.cleanStatus(ticket.status)}`,
      html: this.emailLayout(ticket, `Your support ticket status is now ${this.cleanStatus(ticket.status)}.`, 'Ticket status updated'),
      text: `AROFi ticket ${ticket.reference} is now ${this.cleanStatus(ticket.status)}.`,
    })
  }

  private async notifyAssignee(ticket: any, email: string) {
    await this.mailService.sendMail({
      to: email,
      subject: `Assigned: ${ticket.reference} - ${ticket.subject}`,
      html: this.emailLayout(ticket, 'This support ticket has been assigned to you. Open the AROFi Support queue to continue.', 'Ticket assigned'),
      text: `AROFi ticket ${ticket.reference} has been assigned to you.\n${ticket.subject}`,
    })
  }

  private emailLayout(ticket: any, body: string, heading: string) {
    return `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55;max-width:720px"><h2 style="color:#2563eb">AROFi Support</h2><h3>${this.escape(heading)}</h3><p><strong>Ticket:</strong> ${this.escape(ticket.reference)}<br/><strong>Business:</strong> ${this.escape(ticket.tenant?.name ?? 'AROFi customer')}<br/><strong>Subject:</strong> ${this.escape(ticket.subject)}<br/><strong>Status:</strong> ${this.escape(this.cleanStatus(ticket.status))}</p><div style="padding:14px 16px;border:1px solid #dbe3ef;border-radius:12px;background:#f8fafc">${this.escape(body).replace(/\r?\n/g, '<br/>')}</div><p style="font-size:12px;color:#64748b">This conversation is tracked in AROFi Support.</p></div>`
  }

  private escape(value: string) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}
