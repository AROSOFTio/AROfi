import { Injectable } from '@nestjs/common'
import {
  AuditSeverity,
  ComplianceStatus,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'

/**
 * Cheap, count-only data for the platform command center.
 *
 * Do not replace this with SystemService.getOverview(): that endpoint deliberately
 * loads detailed audit rows, feature-limit usage and support-ticket messages for
 * the dedicated operations screens. The dashboard only needs small counters.
 */
@Injectable()
export class DashboardSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [openSupportTickets, criticalSupportTickets, criticalAudits, pendingComplianceReviews] =
      await Promise.all([
        this.prisma.supportTicket.count({
          where: { status: SupportTicketStatus.OPEN },
        }),
        this.prisma.supportTicket.count({
          where: {
            priority: SupportTicketPriority.CRITICAL,
            status: { not: SupportTicketStatus.RESOLVED },
          },
        }),
        this.prisma.auditLog.count({
          where: { severity: AuditSeverity.CRITICAL },
        }),
        this.prisma.complianceProfile.count({
          where: { status: ComplianceStatus.PENDING_REVIEW },
        }),
      ])

    return {
      support: {
        open: openSupportTickets,
        critical: criticalSupportTickets,
      },
      audit: {
        critical: criticalAudits,
      },
      reviews: {
        pendingCompliance: pendingComplianceReviews,
      },
    }
  }
}
