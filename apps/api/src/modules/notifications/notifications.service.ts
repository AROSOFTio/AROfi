import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { NotificationAudience } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { CreateNotificationDto } from './dto/create-notification.dto'

const MAX_ATTACHMENTS_PER_NOTIFICATION = 5

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, tenantId?: string | null) {
    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [{ audience: NotificationAudience.ALL_BUSINESSES }, ...(tenantId ? [{ tenantId }] : [])],
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
    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [{ audience: NotificationAudience.ALL_BUSINESSES }, ...(tenantId ? [{ tenantId }] : [])],
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

    if (dto.audience === NotificationAudience.SINGLE_BUSINESS && dto.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } })
      if (!tenant) {
        throw new NotFoundException('Business not found')
      }
    }

    return this.prisma.notification.create({
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
    if (notification.audience === NotificationAudience.SINGLE_BUSINESS && notification.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this notification')
    }
    return notification
  }

  async remove(id: string) {
    await this.prisma.notification.delete({ where: { id } })
    return { success: true }
  }
}
