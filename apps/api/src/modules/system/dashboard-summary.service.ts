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
    const [supportTicketGroups, criticalAudits, pendingComplianceReviews] = await Promise.all([
      this.prisma.supportTicket.groupBy({
        by: ['status', 'priority'],
        where: {
          OR: [
            { status: SupportTicketStatus.OPEN },
            {
              priority: SupportTicketPriority.CRITICAL,
              status: { not: SupportTicketStatus.RESOLVED },
            },
          ],
        },
        _count: { _all: true },
      }),
      this.prisma.auditLog.count({
        where: { severity: AuditSeverity.CRITICAL },
      }),
      this.prisma.complianceProfile.count({
        where: { status: ComplianceStatus.PENDING_REVIEW },
      }),
    ])

    let openSupportTickets = 0
    let criticalSupportTickets = 0
    for (const group of supportTicketGroups) {
      if (group.status === SupportTicketStatus.OPEN) {
        openSupportTickets += group._count._all
      }
      if (
        group.priority === SupportTicketPriority.CRITICAL &&
        group.status !== SupportTicketStatus.RESOLVED
      ) {
        criticalSupportTickets += group._count._all
      }
    }

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
