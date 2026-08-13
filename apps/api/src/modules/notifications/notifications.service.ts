import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { NotificationAudience } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { MailService } from '../mail/mail.service'
import { SmsService } from '../sms/sms.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { CreateNotificationDto } from './dto/create-notification.dto'

const MAX_ATTACHMENTS_PER_NOTIFICATION = 5

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly whatsAppService: WhatsAppService,
    private readonly smsService: SmsService,
  ) {}

  async listForUser(userId: string, tenantId?: string | null) {
    const tenant = tenantId ? await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true } }) : null
    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [
          ...(tenant ? [{ audience: NotificationAudience.ALL_BUSINESSES, createdAt: { gte: tenant.createdAt } }] : []),
          ...(tenantId ? [{ tenantId }] : []),
        ],
      },
      include: {
        attachments: { select: { id: true, fileName: true, mimeType: true, fileSize: true } },
        reads: { where: { userId }, select: { readAt: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return {
      unreadCount: notifications.filter((notification) => notification.reads.length === 0).length,
      items: notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        audience: notification.audience,
        tenant: notification.tenant,
        createdBy: notification.createdBy
          ? { id: notification.createdBy.id, name: [notification.createdBy.firstName, notification.createdBy.lastName].filter(Boolean).join(' ') || 'AROFi Team' }
          : { id: null, name: 'AROFi Team' },
        createdAt: notification.createdAt,
        isRead: notification.reads.length > 0,
        readAt: notification.reads[0]?.readAt ?? null,
        attachments: notification.attachments,
      })),
    }
  }

  async markRead(notificationId: string, userId: string, tenantId?: string | null) {
    await this.assertVisible(notificationId, tenantId)
    await this.prisma.notificationRead.upsert({
      where: { notificationId_userId: { notificationId, userId } },
      update: {},
      create: { notificationId, userId },
    })
    return { success: true }
  }

  async markAllRead(userId: string, tenantId?: string | null) {
    const tenant = tenantId ? await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true } }) : null
    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [
          ...(tenant ? [{ audience: NotificationAudience.ALL_BUSINESSES, createdAt: { gte: tenant.createdAt } }] : []),
          ...(tenantId ? [{ tenantId }] : []),
        ],
      },
      select: { id: true },
    })

    if (notifications.length === 0) {
      return { success: true }
    }

    await this.prisma.$transaction(
      notifications.map((notification) =>
        this.prisma.notificationRead.upsert({
          where: { notificationId_userId: { notificationId: notification.id, userId } },
          update: {},
          create: { notificationId: notification.id, userId },
        }),
      ),
    )
    return { success: true }
  }

  async listSent() {
    return this.prisma.notification.findMany({
      include: {
        tenant: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        attachments: { select: { id: true, fileName: true, mimeType: true, fileSize: true } },
        _count: { select: { reads: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  async create(dto: CreateNotificationDto, createdById: string) {
    if (dto.audience === NotificationAudience.SINGLE_BUSINESS && !dto.tenantId) {
      throw new BadRequestException('Select a business to notify')
    }

    const businesses = await this.prisma.tenant.findMany({
      where: dto.audience === NotificationAudience.SINGLE_BUSINESS ? { id: dto.tenantId } : undefined,
      select: {
        id: true,
        name: true,
        supportEmail: true,
        supportPhone: true,
        complianceProfile: { select: { email: true, phoneNumber: true } },
        users: {
          where: { isActive: true },
          select: { email: true },
        },
      },
    })

    if (dto.audience === NotificationAudience.SINGLE_BUSINESS && businesses.length === 0) {
      throw new NotFoundException('Business not found')
    }

    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        audience: dto.audience,
        tenantId: dto.audience === NotificationAudience.SINGLE_BUSINESS ? dto.tenantId : null,
        createdById,
      },
      include: {
        tenant: { select: { id: true, name: true } },
        attachments: { select: { id: true, fileName: true, mimeType: true, fileSize: true } },
      },
    })

    const emailAddresses = this.uniqueContacts(
      businesses.flatMap((business) => [
        business.supportEmail,
        business.complianceProfile?.email,
        ...business.users.map((user) => user.email),
      ]),
      true,
    )
    const phoneNumbers = this.uniqueContacts(
      businesses.flatMap((business) => [business.supportPhone, business.complianceProfile?.phoneNumber]),
    )
    const businessesWithEmail = businesses.filter((business) =>
      Boolean(business.supportEmail || business.complianceProfile?.email || business.users.some((user) => user.email)),
    ).length
    const businessesWithPhone = businesses.filter((business) =>
      Boolean(business.supportPhone || business.complianceProfile?.phoneNumber),
    ).length

    const [emailResults, whatsAppResults, smsResults] = await Promise.all([
      Promise.all(
        emailAddresses.map((to) =>
          this.mailService.sendBusinessNotificationEmail({
            to,
            title: notification.title,
            message: notification.body,
          }),
        ),
      ),
      Promise.all(
        phoneNumbers.map((phoneNumber) =>
          this.whatsAppService.sendTextMessage(
            phoneNumber,
            `AROFi notification\n\n${notification.title}\n\n${notification.body}\n\nOpen your AROFi dashboard to view this notification.`,
          ),
        ),
      ),
      Promise.all(
        businesses.map((business) =>
          this.smsService.sendBusinessSms({
            tenantId: business.id,
            title: notification.title,
            message: notification.body,
            phoneNumbers: this.uniqueContacts([business.supportPhone, business.complianceProfile?.phoneNumber]),
            templateKey: 'admin_notification',
          }),
        ),
      ),
    ])

    const smsAttempted = smsResults.reduce((total, result) => total + result.attempted, 0)
    const smsDelivered = smsResults.reduce((total, result) => total + result.delivered, 0)

    const delivery = {
      inbox: { businesses: businesses.length },
      email: {
        businesses: businessesWithEmail,
        attempted: emailAddresses.length,
        delivered: emailResults.filter(Boolean).length,
        failed: emailResults.filter((result) => !result).length,
      },
      whatsapp: {
        businesses: businessesWithPhone,
        attempted: phoneNumbers.length,
        delivered: whatsAppResults.filter(Boolean).length,
        failed: whatsAppResults.filter((result) => !result).length,
      },
      sms: {
        businesses: businessesWithPhone,
        attempted: smsAttempted,
        delivered: smsDelivered,
        failed: smsAttempted - smsDelivered,
      },
    }

    if (delivery.email.failed > 0 || delivery.whatsapp.failed > 0 || delivery.sms.failed > 0) {
      this.logger.warn(
        `Notification ${notification.id} saved in-app, with external delivery failures: email ${delivery.email.delivered}/${delivery.email.attempted}, WhatsApp ${delivery.whatsapp.delivered}/${delivery.whatsapp.attempted}, SMS ${delivery.sms.delivered}/${delivery.sms.attempted}`,
      )
    }

    return { ...notification, delivery }
  }

  private uniqueContacts(values: Array<string | null | undefined>, caseInsensitive = false) {
    const contacts = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
    const seen = new Set<string>()

    return contacts.filter((contact) => {
      const key = caseInsensitive ? contact.toLowerCase() : contact.replace(/\D/g, '')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async addAttachment(notificationId: string, file: Express.Multer.File) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { _count: { select: { attachments: true } } },
    })
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    if (notification._count.attachments >= MAX_ATTACHMENTS_PER_NOTIFICATION) {
      throw new BadRequestException(`A notification can have at most ${MAX_ATTACHMENTS_PER_NOTIFICATION} attachments`)
    }

    return this.prisma.notificationAttachment.create({
      data: {
        notificationId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileData: file.buffer,
      },
      select: { id: true, fileName: true, mimeType: true, fileSize: true },
    })
  }

  async getAttachmentFile(attachmentId: string, userId: string, tenantId: string | null, isSuperAdmin: boolean) {
    const attachment = await this.prisma.notificationAttachment.findUnique({
      where: { id: attachmentId },
      include: { notification: { select: { audience: true, tenantId: true } } },
    })
    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    const visible =
      isSuperAdmin ||
      attachment.notification.audience === NotificationAudience.ALL_BUSINESSES ||
      (tenantId && attachment.notification.tenantId === tenantId)

    if (!visible) {
      throw new ForbiddenException('You do not have access to this attachment')
    }

    return attachment
  }

  private async assertVisible(notificationId: string, tenantId?: string | null) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } })
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    const tenant = tenantId ? await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true } }) : null
    const visible = notification.audience === NotificationAudience.SINGLE_BUSINESS
      ? notification.tenantId === tenantId
      : Boolean(tenant && notification.createdAt >= tenant.createdAt)
    if (!visible) {
      throw new ForbiddenException('You do not have access to this notification')
    }
    return notification
  }

  async remove(id: string) {
    await this.prisma.notification.delete({ where: { id } })
    return { success: true }
  }
}
