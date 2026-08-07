#!/usr/bin/env python3
"""Apply voucher preview, friendly naming, and printed-agent enhancements.

The repository currently applies several guarded source transforms during the
Docker build. This final transform is deliberately narrow and idempotent:

- friendly stock/batch names: Voucher-Agent-Location-Package-MONTH-0001
- agent/location printed on every physical voucher
- PDF preview does not mark stock as printed
- creation response exposes the first QR destination for verification
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "apps/api/src/modules/vouchers/vouchers.service.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


text = SERVICE.read_text()

text = replace_once(
    text,
    "    const batchNumber = this.voucherCodeService.generateBatchNumber(codeModeLabel)",
    "    const batchNumber = await this.buildFriendlyBatchNumber(dto.tenantId, agent, pkg)",
    "friendly voucher batch number",
)

text = replace_once(
    text,
    """          agent: {
            select: {
              id: true,
              code: true,
              name: true,
              phoneNumber: true,
            },
          },""",
    """          agent: {
            select: {
              id: true,
              code: true,
              name: true,
              phoneNumber: true,
              territory: true,
            },
          },""",
    "created batch agent location",
)

text = replace_once(
    text,
    """        previewVouchers: createdBatch.vouchers.map((voucher) => ({
          id: voucher.id,
          code: voucher.code,
          status: voucher.status,
        })),
        createdAt: createdBatch.createdAt,""",
    """        previewVouchers: createdBatch.vouchers.map((voucher) => ({
          id: voucher.id,
          code: voucher.code,
          status: voucher.status,
        })),
        qrUrl: createdBatch.vouchers[0]?.code
          ? this.buildVoucherPortalUrl(
              createdBatch.vouchers[0].code,
              this.buildTenantHotspotDomain(createdBatch.tenant.name),
            )
          : null,
        createdAt: createdBatch.createdAt,""",
    "created batch QR destination",
)

text = replace_once(
    text,
    "  async renderBatchPdf(batchId: string, tenantId?: string, actorUserId?: string, templateId?: string) {",
    "  async renderBatchPdf(batchId: string, tenantId?: string, actorUserId?: string, templateId?: string, trackPrint = true) {",
    "preview-safe PDF signature",
)

text = replace_once(
    text,
    """        tenant: true,
        package: { include: { prices: { orderBy: { startsAt: 'desc' }, take: 1 } } },
        vouchers: { orderBy: { serialNumber: 'asc' } },""",
    """        tenant: true,
        package: { include: { prices: { orderBy: { startsAt: 'desc' }, take: 1 } } },
        agent: true,
        vouchers: { orderBy: { serialNumber: 'asc' } },""",
    "PDF agent relation",
)

text = replace_once(
    text,
    """        tenantName: batch.tenant.name,
        packageName: batch.package.name,
        durationMinutes: batch.package.durationMinutes,""",
    """        tenantName: batch.tenant.name,
        agentName: batch.agent?.name ?? null,
        agentLocation: batch.agent?.territory ?? null,
        packageName: batch.package.name,
        durationMinutes: batch.package.durationMinutes,""",
    "voucher card agent values",
)

text = replace_once(
    text,
    """      tenantName: string
      packageName: string
      durationMinutes: number""",
    """      tenantName: string
      agentName?: string | null
      agentLocation?: string | null
      packageName: string
      durationMinutes: number""",
    "voucher card agent input type",
)

text = replace_once(
    text,
    """    doc.fillColor(template.accentDark).font('Helvetica-Bold').fontSize(5.2)
      .text(input.tenantName.toUpperCase(), innerX, y + 7, { width: width - railWidth - 12, align: 'center', ellipsis: true })

    const codeY = y + 28""",
    """    doc.fillColor(template.accentDark).font('Helvetica-Bold').fontSize(5.2)
      .text(input.tenantName.toUpperCase(), innerX, y + 6, { width: width - railWidth - 12, align: 'center', ellipsis: true })

    const stockLabel = input.agentName
      ? `AGENT: ${input.agentName}${input.agentLocation ? ` · ${input.agentLocation}` : ''}`
      : 'DIRECT / OWNER STOCK'
    doc.fillColor(template.muted).font('Helvetica-Bold').fontSize(4.5)
      .text(stockLabel, innerX, y + 15, { width: width - railWidth - 12, align: 'center', ellipsis: true })

    const codeY = y + 29""",
    "physical voucher agent label",
)

text = replace_once(
    text,
    """    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.voucherBatch.update({""",
    """    if (trackPrint) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.voucherBatch.update({""",
    "start conditional print tracking",
)

text = replace_once(
    text,
    """      })
    } catch (error) {
      console.warn('Voucher PDF generated but print tracking failed', error)
    }

    return {
      filename: `${batch.batchNumber}-${templateKey}-vouchers.pdf`,""",
    """        })
      } catch (error) {
        console.warn('Voucher PDF generated but print tracking failed', error)
      }
    }

    return {
      filename: `${batch.batchNumber}-${templateKey}.pdf`,""",
    "finish conditional print tracking",
)

helper_marker = "  private resolveVoucherPdfTemplate(templateId?: string): VoucherPdfTemplate {"
if "private async buildFriendlyBatchNumber(" not in text:
    if text.count(helper_marker) != 1:
        raise RuntimeError("friendly batch helper insertion marker not found")
    helper = """  private async buildFriendlyBatchNumber(
    tenantId: string,
    agent: { name: string; territory?: string | null } | null,
    pkg: { name: string },
  ) {
    const month = new Intl.DateTimeFormat('en', {
      month: 'long',
      timeZone: 'Africa/Kampala',
    }).format(new Date()).toUpperCase()
    const owner = this.sanitizeVoucherBatchPart(agent?.name ?? 'Owner')
    const location = this.sanitizeVoucherBatchPart(agent?.territory ?? 'Direct')
    const packageName = this.sanitizeVoucherBatchPart(pkg.name)
    const base = `Voucher-${owner}-${location}-${packageName}-${month}`
    const existing = await this.prisma.voucherBatch.findMany({
      where: {
        tenantId,
        batchNumber: { startsWith: `${base}-` },
      },
      select: { batchNumber: true },
    })
    const highestSequence = existing.reduce((highest, item) => {
      const match = item.batchNumber.match(/-(\\d{4,})$/)
      const sequence = match ? Number.parseInt(match[1], 10) : 0
      return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest
    }, 0)
    return `${base}-${String(highestSequence + 1).padStart(4, '0')}`
  }

  private sanitizeVoucherBatchPart(value: string) {
    const words = value
      .normalize('NFKD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    return words.join('-').slice(0, 36) || 'Unknown'
  }

"""
    text = text.replace(helper_marker, helper + helper_marker, 1)

SERVICE.write_text(text)
print('Voucher preview, naming, and physical-agent patches applied.')
