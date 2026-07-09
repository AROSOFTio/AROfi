import { BadRequestException, Injectable } from '@nestjs/common'
import { BillingChannel, BillingTransactionStatus, BillingTransactionType, DisbursementStatus, Prisma, VoucherStatus } from '@prisma/client'
import PDFDocument = require('pdfkit')
import * as ExcelJS from 'exceljs'
import { PrismaService } from '../../prisma.service'

export type ReportType = 'sales' | 'disbursements' | 'vouchers'
export type ReportFormat = 'csv' | 'xlsx' | 'pdf'

export interface ReportFilters {
  from?: string
  to?: string
  status?: string
  channel?: string
  search?: string
}

type Column = { header: string; value: (row: any) => string | number }

const REPORT_TITLES: Record<ReportType, string> = {
  sales: 'Sales Report',
  disbursements: 'Disbursements Report',
  vouchers: 'Vouchers Report',
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(type: ReportType, filters: ReportFilters, tenantId: string | undefined, includeFees: boolean) {
    const rows = await this.fetchRows(type, filters, tenantId)
    const columns = this.getColumns(type, includeFees, !tenantId)
    return {
      total: rows.length,
      columns: columns.map((column) => column.header),
      rows: rows.slice(0, 50).map((row) => columns.map((column) => column.value(row))),
    }
  }

  async exportReport(
    type: ReportType,
    format: ReportFormat,
    filters: ReportFilters,
    tenantId: string | undefined,
    includeFees: boolean,
  ) {
    const rows = await this.fetchRows(type, filters, tenantId)
    const columns = this.getColumns(type, includeFees, !tenantId)
    const title = REPORT_TITLES[type]
    const filenameBase = `${type}-report-${new Date().toISOString().slice(0, 10)}`

    if (format === 'csv') {
      return this.buildCsv(columns, rows, filenameBase)
    }
    if (format === 'xlsx') {
      return this.buildXlsx(columns, rows, filenameBase, title)
    }
    if (format === 'pdf') {
      return this.buildPdf(columns, rows, filenameBase, title, filters)
    }
    throw new BadRequestException('Unsupported export format')
  }

  private async fetchRows(type: ReportType, filters: ReportFilters, tenantId?: string) {
    if (type === 'sales') {
      return this.fetchSalesRows(filters, tenantId)
    }
    if (type === 'disbursements') {
      return this.fetchDisbursementRows(filters, tenantId)
    }
    if (type === 'vouchers') {
      return this.fetchVoucherRows(filters, tenantId)
    }
    throw new BadRequestException('Unknown report type')
  }

  private dateRange(filters: ReportFilters): { createdAt?: { gte?: Date; lte?: Date } } {
    if (!filters.from && !filters.to) {
      return {}
    }
    return {
      createdAt: {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      },
    }
  }

  private async fetchSalesRows(filters: ReportFilters, tenantId?: string) {
    const where: Prisma.BillingTransactionWhereInput = {
      type: { in: [BillingTransactionType.MOBILE_MONEY_SALE, BillingTransactionType.VOUCHER_SALE] },
      ...(tenantId ? { tenantId } : {}),
      ...(filters.status ? { status: filters.status as BillingTransactionStatus } : {}),
      ...(filters.channel ? { channel: filters.channel as BillingChannel } : {}),
      ...(filters.search
        ? {
            OR: [
              { customerReference: { contains: filters.search, mode: 'insensitive' } },
              { externalReference: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...this.dateRange(filters),
    }

    return this.prisma.billingTransaction.findMany({
      where,
      include: {
        tenant: { select: { name: true } },
        package: { select: { name: true } },
        voucher: { select: { code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20_000,
    })
  }

  private async fetchDisbursementRows(filters: ReportFilters, tenantId?: string) {
    const where: Prisma.DisbursementWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(filters.status ? { status: filters.status as DisbursementStatus } : {}),
      ...(filters.search
        ? {
            OR: [
              { reference: { contains: filters.search, mode: 'insensitive' } },
              { destinationReference: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...this.dateRange(filters),
    }

    return this.prisma.disbursement.findMany({
      where,
      include: {
        tenant: { select: { name: true } },
        agent: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20_000,
    })
  }

  private async fetchVoucherRows(filters: ReportFilters, tenantId?: string) {
    const where: Prisma.VoucherWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(filters.status ? { status: filters.status as VoucherStatus } : {}),
      ...(filters.search
        ? {
            OR: [
              { code: { contains: filters.search, mode: 'insensitive' } },
              { customerReference: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...this.dateRange(filters),
    }

    return this.prisma.voucher.findMany({
      where,
      include: {
        tenant: { select: { name: true } },
        package: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20_000,
    })
  }

  private getColumns(type: ReportType, includeFees: boolean, showTenantColumn: boolean): Column[] {
    if (type === 'sales') {
      const columns: Column[] = []
      if (showTenantColumn) {
        columns.push({ header: 'Business', value: (r) => r.tenant?.name ?? '' })
      }
      columns.push(
        { header: 'Date', value: (r) => r.createdAt.toISOString() },
        { header: 'Type', value: (r) => r.type },
        { header: 'Channel', value: (r) => r.channel },
        { header: 'Status', value: (r) => r.status },
        { header: 'Customer', value: (r) => r.customerReference ?? '' },
        { header: 'Package', value: (r) => r.package?.name ?? '' },
        { header: 'Voucher Code', value: (r) => r.voucher?.code ?? '' },
        { header: 'Gross UGX', value: (r) => r.grossAmountUgx },
      )
      if (includeFees) {
        columns.push(
          { header: 'Fee UGX', value: (r) => r.feeAmountUgx },
          { header: 'Net UGX', value: (r) => r.netAmountUgx },
        )
      }
      columns.push({ header: 'Reference', value: (r) => r.externalReference ?? '' })
      return columns
    }

    if (type === 'disbursements') {
      const columns: Column[] = []
      if (showTenantColumn) {
        columns.push({ header: 'Business', value: (r) => r.tenant?.name ?? '' })
      }
      columns.push(
        { header: 'Date', value: (r) => (r.completedAt ?? r.createdAt).toISOString() },
        { header: 'Reference', value: (r) => r.reference },
        { header: 'Agent', value: (r) => (r.agent ? `${r.agent.name} (${r.agent.code})` : 'Vendor wallet') },
        { header: 'Method', value: (r) => r.method },
        { header: 'Status', value: (r) => r.status },
        { header: 'Amount UGX', value: (r) => r.amountUgx },
        { header: 'Destination', value: (r) => r.destinationReference ?? '' },
      )
      return columns
    }

    const columns: Column[] = []
    if (showTenantColumn) {
      columns.push({ header: 'Business', value: (r) => r.tenant?.name ?? '' })
    }
    columns.push(
      { header: 'Code', value: (r) => r.code },
      { header: 'Package', value: (r) => r.package?.name ?? '' },
      { header: 'Status', value: (r) => r.status },
      { header: 'Face Value UGX', value: (r) => r.faceValueUgx },
      { header: 'Sold At', value: (r) => (r.soldAt ? r.soldAt.toISOString() : '') },
      { header: 'Redeemed At', value: (r) => (r.redeemedAt ? r.redeemedAt.toISOString() : '') },
      { header: 'Customer', value: (r) => r.customerReference ?? '' },
      { header: 'Expires At', value: (r) => (r.expiresAt ? r.expiresAt.toISOString() : '') },
    )
    return columns
  }

  private buildCsv(columns: Column[], rows: any[], filenameBase: string) {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const header = columns.map((column) => escape(column.header)).join(',')
    const body = rows.map((row) => columns.map((column) => escape(column.value(row))).join(','))
    return {
      filename: `${filenameBase}.csv`,
      contentType: 'text/csv',
      buffer: Buffer.from([header, ...body].join('\n'), 'utf-8'),
    }
  }

  private async buildXlsx(columns: Column[], rows: any[], filenameBase: string, title: string) {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(title.slice(0, 31))
    sheet.columns = columns.map((column) => ({ header: column.header, key: column.header, width: 22 }))
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    rows.forEach((row) => {
      sheet.addRow(Object.fromEntries(columns.map((column) => [column.header, column.value(row)])))
    })
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      filename: `${filenameBase}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(buffer),
    }
  }

  private async buildPdf(columns: Column[], rows: any[], filenameBase: string, title: string, filters: ReportFilters) {
    const doc = new PDFDocument({ size: 'A4', margin: 28, layout: columns.length > 6 ? 'landscape' : 'portrait' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

    doc.fontSize(16).fillColor('#0F172A').text(title)
    const rangeText = filters.from || filters.to ? ` | ${filters.from ?? 'start'} to ${filters.to ?? 'now'}` : ''
    doc.fontSize(9).fillColor('#64748B').text(`Generated ${new Date().toISOString()}${rangeText} | ${rows.length} record(s)`)
    doc.moveDown(0.8)

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const colWidth = pageWidth / columns.length
    const rowHeight = 16

    const drawHeader = () => {
      const y = doc.y
      doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#0F172A')
      let x = doc.page.margins.left
      columns.forEach((column) => {
        doc.fontSize(7.5).fillColor('#FFFFFF').text(column.header, x + 3, y + 4, { width: colWidth - 6, ellipsis: true })
        x += colWidth
      })
      doc.y = y + rowHeight
    }

    drawHeader()
    rows.forEach((row, index) => {
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
        drawHeader()
      }
      const y = doc.y
      if (index % 2 === 0) {
        doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#F8FAFC')
      }
      let x = doc.page.margins.left
      columns.forEach((column) => {
        doc.fontSize(7.5).fillColor('#334155').text(String(column.value(row)), x + 3, y + 4, { width: colWidth - 6, ellipsis: true })
        x += colWidth
      })
      doc.y = y + rowHeight
    })

    if (rows.length === 0) {
      doc.moveDown(1).fontSize(10).fillColor('#94A3B8').text('No records match the selected filters.')
    }

    doc.end()
    const buffer = await done
    return { filename: `${filenameBase}.pdf`, contentType: 'application/pdf', buffer }
  }
}
