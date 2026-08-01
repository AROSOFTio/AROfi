import { NotificationAudience } from '@prisma/client'
import { NotificationsService } from './notifications.service'

describe('NotificationsService delivery', () => {
  function buildService(options?: { emailDelivered?: boolean; whatsAppDelivered?: boolean }) {
    const business = {
      id: 'business-1',
      name: 'Kampala WiFi',
      supportEmail: 'owner@example.com',
      supportPhone: '+256 772 000 000',
      complianceProfile: {
        email: 'accounts@example.com',
        phoneNumber: '256772000000',
      },
      users: [
        { email: 'OWNER@example.com' },
        { email: 'manager@example.com' },
      ],
    }
    const notification = {
      id: 'notification-1',
      title: 'Scheduled maintenance',
      body: 'Service work begins at 10 PM.',
      audience: NotificationAudience.SINGLE_BUSINESS,
      tenantId: business.id,
      createdById: 'admin-1',
      tenant: { id: business.id, name: business.name },
      attachments: [],
    }
    const prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue([business]) },
      notification: { create: jest.fn().mockResolvedValue(notification) },
    }
    const mailService = {
      sendBusinessNotificationEmail: jest.fn().mockResolvedValue(options?.emailDelivered ?? true),
    }
    const whatsAppService = {
      sendTextMessage: jest.fn().mockResolvedValue(options?.whatsAppDelivered ?? true),
    }
    const smsService = {
      sendBusinessSms: jest.fn().mockResolvedValue({ attempted: 1, delivered: 1, failed: 0 }),
    }

    return {
      service: new NotificationsService(prisma as never, mailService as never, whatsAppService as never, smsService as never),
      prisma,
      mailService,
      whatsAppService,
      smsService,
    }
  }

  it('stores the inbox notification and sends one copy to each unique contact', async () => {
    const { service, mailService, whatsAppService } = buildService()

    const result = await service.create(
      {
        title: ' Scheduled maintenance ',
        body: ' Service work begins at 10 PM. ',
        audience: NotificationAudience.SINGLE_BUSINESS,
        tenantId: 'business-1',
      },
      'admin-1',
    )

    expect(mailService.sendBusinessNotificationEmail).toHaveBeenCalledTimes(3)
    expect(whatsAppService.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(result.delivery).toEqual({
      inbox: { businesses: 1 },
      email: { businesses: 1, attempted: 3, delivered: 3, failed: 0 },
      whatsapp: { businesses: 1, attempted: 1, delivered: 1, failed: 0 },
      sms: { businesses: 1, attempted: 1, delivered: 1, failed: 0 },
    })
  })

  it('reports external delivery failures without losing the dashboard notification', async () => {
    const { service } = buildService({ emailDelivered: false, whatsAppDelivered: false })

    const result = await service.create(
      {
        title: 'Maintenance',
        body: 'Please check the dashboard.',
        audience: NotificationAudience.SINGLE_BUSINESS,
        tenantId: 'business-1',
      },
      'admin-1',
    )

    expect(result.id).toBe('notification-1')
    expect(result.delivery.email).toMatchObject({ delivered: 0, failed: 3 })
    expect(result.delivery.whatsapp).toMatchObject({ delivered: 0, failed: 1 })
  })
})
