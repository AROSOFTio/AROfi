import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ComplianceStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { MailService } from '../mail/mail.service'
import type { AuthenticatedAdminUser } from '../auth/auth.module'

const SUPPORT_NOTIFY_EMAIL = process.env.SUPPORT_EMAIL || 'support@arofi.net'

export type ComplianceSubmission = {
  businessName: string
  ownerName: string
  phoneNumber: string
  email: string
  country?: string
  district: string
  hotspotLocation: string
  businessType: string
  ispName: string
  ispPackage?: string
  routerCount?: number
  expectedUsers?: number
  payoutPhoneNumber?: string
  notes?: string
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async getMine(tenantId: string) {
    const [profile, documents] = await Promise.all([
      this.prisma.complianceProfile.findUnique({ where: { tenantId } }),
      this.prisma.kycDocument.findMany({
        where: { tenantId },
        select: { id: true, documentType: true, fileName: true, status: true, reviewNotes: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return {
      profile,
      status: profile?.status ?? 'NOT_SUBMITTED',
      documents,
    }
  }

  async submit(user: AuthenticatedAdminUser, tenantId: string, input: ComplianceSubmission) {
    const data = {
      businessName: input.businessName.trim(),
      ownerName: input.ownerName.trim(),
      phoneNumber: input.phoneNumber.trim(),
      email: input.email.trim().toLowerCase(),
      country: input.country?.trim() || 'Uganda',
      district: input.district.trim(),
      hotspotLocation: input.hotspotLocation.trim(),
      businessType: input.businessType.trim(),
      ispName: input.ispName.trim(),
      ispPackage: input.ispPackage?.trim() || null,
      routerCount: Math.max(1, Math.min(1000, Math.round(input.routerCount ?? 1))),
      expectedUsers: input.expectedUsers ? Math.max(1, Math.round(input.expectedUsers)) : null,
      payoutPhoneNumber: input.payoutPhoneNumber?.trim() || null,
      notes: input.notes?.trim() || null,
      // Every (re)submission goes back into the review queue and clears the
      // previous verdict so reviewers always see the latest declared facts.
      status: ComplianceStatus.PENDING_REVIEW,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
    }

    const profile = await this.prisma.complianceProfile.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    })

    void this.mailService.sendMail({
      to: SUPPORT_NOTIFY_EMAIL,
      subject: `Compliance submission: ${data.businessName}`,
      html: `<p>${user.displayName} submitted business details for compliance review.</p>
        <p><strong>Business:</strong> ${data.businessName} (${data.businessType})<br/>
        <strong>Owner:</strong> ${data.ownerName} · ${data.phoneNumber} · ${data.email}<br/>
        <strong>Location:</strong> ${data.hotspotLocation}, ${data.district}, ${data.country}<br/>
        <strong>ISP:</strong> ${data.ispName}${data.ispPackage ? ` (${data.ispPackage})` : ''} · Routers: ${data.routerCount}</p>
        <p>Review it in the admin console under Compliance Reviews.</p>`,
    })

    return { ok: true, status: profile.status, message: 'Business details submitted for compliance review.' }
  }

  async listForReview(reviewer: AuthenticatedAdminUser, status?: string) {
    this.requirePlatformAdmin(reviewer)
    const where =
      status && status in ComplianceStatus ? { status: status as ComplianceStatus } : {}
    return this.prisma.complianceProfile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { tenant: { select: { name: true, domain: true } } },
    })
  }

  async review(reviewer: AuthenticatedAdminUser, id: string, verdict: string, note?: string) {
    this.requirePlatformAdmin(reviewer)
    if (!['APPROVED', 'REJECTED', 'NEEDS_INFO'].includes(verdict)) {
      throw new BadRequestException('Verdict must be APPROVED, REJECTED, or NEEDS_INFO.')
    }
    const profile = await this.prisma.complianceProfile.findUnique({ where: { id } })
    if (!profile) {
      throw new NotFoundException('Compliance profile not found.')
    }

    const updated = await this.prisma.complianceProfile.update({
      where: { id },
      data: {
        status: verdict as ComplianceStatus,
        reviewedBy: reviewer.email,
        reviewedAt: new Date(),
        reviewNotes: note?.trim() || null,
      },
    })

    const subjectByVerdict: Record<string, string> = {
      APPROVED: 'Your AROFi compliance review is approved',
      REJECTED: 'Your AROFi compliance submission was declined',
      NEEDS_INFO: 'Your AROFi compliance submission needs more information',
    }
    const bodyByVerdict: Record<string, string> = {
      APPROVED: 'Your business has been reviewed and approved for live hotspot billing features.',
      REJECTED: 'Your submission was declined. Please review the note below, update your details, and resubmit.',
      NEEDS_INFO: 'A reviewer needs more information before approving your business. Please review the note below, update your details or documents, and resubmit.',
    }
    void this.mailService.sendMail({
      to: profile.email,
      subject: subjectByVerdict[verdict],
      html: `<p>${bodyByVerdict[verdict]}</p>${note ? `<p><strong>Reviewer note:</strong> ${note.trim()}</p>` : ''}
        <p>You can see your compliance status any time in your dashboard under Compliance.</p>`,
    })

    return updated
  }

  private requirePlatformAdmin(user: AuthenticatedAdminUser) {
    if (!user.permissions.includes('ALL')) {
      throw new ForbiddenException('Only platform administrators can review compliance submissions.')
    }
  }
}
