import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'

/** Read-only, aggregate homepage figures. No tenant or customer data is exposed. */
@Controller('public/stats')
export class PublicStatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [businesses, routers, liveRouters, payments, active] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.router.count(),
      this.prisma.router.count({ where: { status: 'HEALTHY' } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: today } },
        _sum: { amountUgx: true },
      }),
      this.prisma.router.aggregate({ _sum: { activeSessionCount: true } }),
    ])
    return {
      businesses,
      routers,
      liveRouters,
      activeSessions: active._sum.activeSessionCount ?? 0,
      salesTodayUgx: payments._sum.amountUgx ?? 0,
    }
  }
}
