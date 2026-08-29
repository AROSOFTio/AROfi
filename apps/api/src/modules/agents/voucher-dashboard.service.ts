import { Injectable } from '@nestjs/common'
import {
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  Prisma,
  SettlementStatus,
  VoucherStatus,
} from '@prisma/client'
import * as ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { PrismaService } from '../../prisma.service'

export type VoucherDashboardFilters = {
  from?: string
  to?: string
  agentId?: string
  territory?: string
  packageId?: string
  batchId?: string
}

type DashboardAgent = {
  agentId: string
  code: string
  name: string
  territory: string
  stock: number
  stockValueUgx: number
  sales: number
  grossSalesUgx: number
  platformFeesUgx: number
  commissionUgx: number
  settledGrossUgx: number
  cashDueUgx: number
  expired: number
  voided: number
  expiringSoon: number
  lastSaleAt: string | null
}

type DashboardLocation = {
  location: string
  agents: number
  stock: number
  sales: number
  grossSalesUgx: number
  cashDueUgx: number
}

@Injectable()
export class VoucherDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId?: string, filters: VoucherDashboardFilters = {}) {
    const now = new Date()
    const range = this.resolveRange(filters.from, filters.to, now)
    const previousRange = this.previousRange(range.from, range.to)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000)

    const baseSalesWhere: Prisma.BillingTransactionWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      type: {
        in: [
          BillingTransactionType.VOUCHER_SALE,
          BillingTransactionType.VOUCHER_REDEMPTION,
        ],
      },
      status: BillingTransactionStatus.COMPLETED,
      grossAmountUgx: { gt: 0 },
      ...(filters.packageId ? { packageId: filters.packageId } : {}),
      ...(filters.batchId ? { voucher: { is: { batchId: filters.batchId } } } : {}),
      ...(filters.agentId
        ? {
            OR: [
              { agentId: filters.agentId },
              { voucher: { is: { batch: { is: { agentId: filters.agentId } } } } },
            ],
          }
        : {}),
      ...(filters.territory
        ? {
            voucher: {
              is: {
                batch: {
                  is: {
                    agent: {
                      is: {
                        territory: { contains: filters.territory, mode: 'insensitive' },
                      },
                    },
                  },
                },
              },
            },
          }
        : {}),
    }

    const batchWhere: Prisma.VoucherBatchWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(filters.packageId ? { packageId: filters.packageId } : {}),
      ...(filters.batchId ? { id: filters.batchId } : {}),
      ...(filters.agentId ? { agentId: filters.agentId } : {}),
      ...(filters.territory
        ? {
            agent: {
              is: { territory: { contains: filters.territory, mode: 'insensitive' } },
            },
          }
        : {}),
    }

    const [
      sales,
      previousSales,
      batches,
      commissionsByAgent,
      completedSettlementsByAgent,
      overdueSettlements,
    ] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: {
          ...baseSalesWhere,
          createdAt: { gte: range.from, lte: range.to },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          grossAmountUgx: true,
          feeAmountUgx: true,
          netAmountUgx: true,
          tenant: { select: { name: true } },
          package: { select: { id: true, name: true } },
          agent: { select: { id: true, code: true, name: true, territory: true } },
          voucher: {
            select: {
              code: true,
              batch: {
                select: {
                  id: true,
                  batchNumber: true,
                  agent: { select: { id: true, code: true, name: true, territory: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.billingTransaction.aggregate({
        where: {
          ...baseSalesWhere,
          createdAt: { gte: previousRange.from, lte: previousRange.to },
        },
        _sum: { grossAmountUgx: true },
        _count: { _all: true },
      }),
      this.prisma.voucherBatch.findMany({
        where: batchWhere,
        select: {
          id: true,
          batchNumber: true,
          agentId: true,
          faceValueUgx: true,
          agent: { select: { id: true, code: true, name: true, territory: true } },
          package: { select: { id: true, name: true, code: true } },
          vouchers: {
            select: { status: true, expiresAt: true, faceValueUgx: true },
          },
        },
      }),
      this.prisma.agentCommission.groupBy({
        by: ['agentId'],
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(filters.agentId ? { agentId: filters.agentId } : {}),
          status: { not: CommissionStatus.REVERSED },
          createdAt: { gte: range.from, lte: range.to },
        },
        _sum: { amountUgx: true },
      }),
      this.prisma.settlement.groupBy({
        by: ['agentId'],
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(filters.agentId ? { agentId: filters.agentId } : {}),
          status: SettlementStatus.COMPLETED,
          periodEnd: { gte: range.from, lte: range.to },
        },
        _sum: { grossSalesUgx: true },
      }),
      this.prisma.settlement.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(filters.agentId ? { agentId: filters.agentId } : {}),
          status: { in: [SettlementStatus.READY, SettlementStatus.PROCESSING] },
          periodEnd: { lt: now },
        },
      }),
    ])

    const agentMap = new Map<string, DashboardAgent>()
    const locationMap = new Map<string, DashboardLocation>()

    const ensureAgent = (agent: { id: string; code: string; name: string; territory: string | null }) => {
      const existing = agentMap.get(agent.id)
      if (existing) return existing
      const created: DashboardAgent = {
        agentId: agent.id,
        code: agent.code,
        name: agent.name,
        territory: agent.territory || 'Unassigned',
        stock: 0,
        stockValueUgx: 0,
        sales: 0,
        grossSalesUgx: 0,
        platformFeesUgx: 0,
        commissionUgx: 0,
        settledGrossUgx: 0,
        cashDueUgx: 0,
        expired: 0,
        voided: 0,
        expiringSoon: 0,
        lastSaleAt: null,
      }
      agentMap.set(agent.id, created)
      return created
    }

    let mainStock = 0
    let mainStockValueUgx = 0
    let mainSales = 0
    let mainSalesUgx = 0
    let expired = 0
    let voided = 0
    let expiringSoon = 0

    for (const batch of batches) {
      const agentMetric = batch.agent ? ensureAgent(batch.agent) : null
      for (const voucher of batch.vouchers) {
        const expiredByDate = Boolean(
          voucher.expiresAt &&
          voucher.expiresAt <= now &&
          voucher.status !== VoucherStatus.REDEEMED &&
          voucher.status !== VoucherStatus.VOID &&
          voucher.status !== VoucherStatus.VOIDED,
        )
        const isExpired = voucher.status === VoucherStatus.EXPIRED || expiredByDate
        const isVoided = voucher.status === VoucherStatus.VOID || voucher.status === VoucherStatus.VOIDED
        const isAvailable =
          !isExpired &&
          !isVoided &&
          (voucher.status === VoucherStatus.GENERATED || voucher.status === VoucherStatus.PRINTED)
        const isExpiringSoon = Boolean(
          isAvailable && voucher.expiresAt && voucher.expiresAt <= sevenDaysFromNow,
        )

        if (isExpired) expired += 1
        if (isVoided) voided += 1
        if (isExpiringSoon) expiringSoon += 1

        if (agentMetric) {
          if (isAvailable) {
            agentMetric.stock += 1
            agentMetric.stockValueUgx += voucher.faceValueUgx
          }
          if (isExpired) agentMetric.expired += 1
          if (isVoided) agentMetric.voided += 1
          if (isExpiringSoon) agentMetric.expiringSoon += 1
        } else if (isAvailable) {
          mainStock += 1
          mainStockValueUgx += voucher.faceValueUgx
        }
      }
    }

    for (const commission of commissionsByAgent) {
      const agent = agentMap.get(commission.agentId)
      if (agent) agent.commissionUgx = commission._sum.amountUgx ?? 0
    }
    for (const settlement of completedSettlementsByAgent) {
      const agent = agentMap.get(settlement.agentId)
      if (agent) agent.settledGrossUgx = settlement._sum.grossSalesUgx ?? 0
    }

    const recentSales = sales.slice(0, 15).map((sale) => {
      const assignedAgent = sale.voucher?.batch.agent ?? sale.agent
      const location = assignedAgent?.territory || 'Owner direct'
      if (assignedAgent) {
        const agent = ensureAgent(assignedAgent)
        agent.sales += 1
        agent.grossSalesUgx += sale.grossAmountUgx
        agent.platformFeesUgx += sale.feeAmountUgx
        if (!agent.lastSaleAt) agent.lastSaleAt = sale.createdAt.toISOString()
      } else {
        mainSales += 1
        mainSalesUgx += sale.grossAmountUgx
      }

      const locationKey = assignedAgent?.territory?.trim() || 'Owner direct'
      const locationMetric = locationMap.get(locationKey) ?? {
        location: locationKey,
        agents: 0,
        stock: 0,
        sales: 0,
        grossSalesUgx: 0,
        cashDueUgx: 0,
      }
      locationMetric.sales += 1
      locationMetric.grossSalesUgx += sale.grossAmountUgx
      locationMap.set(locationKey, locationMetric)

      return {
        id: sale.id,
        createdAt: sale.createdAt.toISOString(),
        amountUgx: sale.grossAmountUgx,
        netUgx: sale.netAmountUgx,
        voucherCode: sale.voucher?.code ?? null,
        batchId: sale.voucher?.batch.id ?? null,
        batchNumber: sale.voucher?.batch.batchNumber ?? null,
        packageId: sale.package?.id ?? null,
        packageName: sale.package?.name ?? 'Package',
        agentId: assignedAgent?.id ?? null,
        agentName: assignedAgent?.name ?? 'Main / Owner',
        agentCode: assignedAgent?.code ?? 'MAIN',
        location,
        tenantName: sale.tenant.name,
      }
    })

    // The map above was updated only for the recent subset; apply all remaining
    // sales so period totals and rankings are complete.
    for (const sale of sales.slice(15)) {
      const assignedAgent = sale.voucher?.batch.agent ?? sale.agent
      if (assignedAgent) {
        const agent = ensureAgent(assignedAgent)
        agent.sales += 1
        agent.grossSalesUgx += sale.grossAmountUgx
        agent.platformFeesUgx += sale.feeAmountUgx
        if (!agent.lastSaleAt) agent.lastSaleAt = sale.createdAt.toISOString()
      } else {
        mainSales += 1
        mainSalesUgx += sale.grossAmountUgx
      }
      const locationKey = assignedAgent?.territory?.trim() || 'Owner direct'
      const locationMetric = locationMap.get(locationKey) ?? {
        location: locationKey,
        agents: 0,
        stock: 0,
        sales: 0,
        grossSalesUgx: 0,
        cashDueUgx: 0,
      }
      locationMetric.sales += 1
      locationMetric.grossSalesUgx += sale.grossAmountUgx
      locationMap.set(locationKey, locationMetric)
    }

    for (const agent of agentMap.values()) {
      agent.cashDueUgx = Math.max(
        0,
        agent.grossSalesUgx - agent.platformFeesUgx - agent.commissionUgx - agent.settledGrossUgx,
      )
      const locationMetric = locationMap.get(agent.territory) ?? {
        location: agent.territory,
        agents: 0,
        stock: 0,
        sales: 0,
        grossSalesUgx: 0,
        cashDueUgx: 0,
      }
      locationMetric.agents += 1
      locationMetric.stock += agent.stock
      locationMetric.cashDueUgx += agent.cashDueUgx
      locationMap.set(agent.territory, locationMetric)
    }

    const agents = Array.from(agentMap.values()).sort(
      (left, right) => right.grossSalesUgx - left.grossSalesUgx || right.stock - left.stock,
    )
    const locations = Array.from(locationMap.values()).sort(
      (left, right) => right.grossSalesUgx - left.grossSalesUgx || right.stock - left.stock,
    )

    const grossSalesUgx = sales.reduce((total, sale) => total + sale.grossAmountUgx, 0)
    const platformFeesUgx = sales.reduce((total, sale) => total + sale.feeAmountUgx, 0)
    const netSalesUgx = sales.reduce((total, sale) => total + sale.netAmountUgx, 0)
    const agentSalesUgx = agents.reduce((total, agent) => total + agent.grossSalesUgx, 0)
    const cashDueUgx = agents.reduce((total, agent) => total + agent.cashDueUgx, 0)
    const stock = mainStock + agents.reduce((total, agent) => total + agent.stock, 0)
    const stockValueUgx = mainStockValueUgx + agents.reduce((total, agent) => total + agent.stockValueUgx, 0)
    const previousGrossUgx = previousSales._sum.grossAmountUgx ?? 0
    const changePercent = previousGrossUgx > 0
      ? Math.round(((grossSalesUgx - previousGrossUgx) / previousGrossUgx) * 1000) / 10
      : grossSalesUgx > 0 ? 100 : 0

    const lowStockAgents = agents.filter((agent) => agent.stock > 0 && agent.stock <= 10).length
    const dormantAgents = agents.filter((agent) => agent.stock > 0 && agent.sales === 0).length

    return {
      generatedAt: now.toISOString(),
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        previousFrom: previousRange.from.toISOString(),
        previousTo: previousRange.to.toISOString(),
      },
      summary: {
        sales: sales.length,
        grossSalesUgx,
        netSalesUgx,
        platformFeesUgx,
        agentSalesUgx,
        mainSalesUgx,
        agentSales: agents.reduce((total, agent) => total + agent.sales, 0),
        mainSales,
        cashDueUgx,
        stock,
        stockValueUgx,
        agentsTracked: agents.length,
        locationsTracked: locations.length,
        changePercent,
      },
      alerts: {
        expiringSoon,
        expired,
        voided,
        lowStockAgents,
        dormantAgents,
        overdueSettlements,
      },
      recentSales,
      agents,
      locations,
    }
  }

  async exportExcel(tenantId?: string, filters: VoucherDashboardFilters = {}) {
    const report = await this.getDashboard(tenantId, filters)
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'AROFi'
    workbook.created = new Date()

    const summary = workbook.addWorksheet('Summary')
    summary.columns = [{ width: 30 }, { width: 22 }]
    summary.addRows([
      ['Voucher Sales Report', ''],
      ['From', report.range.from],
      ['To', report.range.to],
      ['Confirmed sales', report.summary.sales],
      ['Gross sales UGX', report.summary.grossSalesUgx],
      ['Agent sales UGX', report.summary.agentSalesUgx],
      ['Main sales UGX', report.summary.mainSalesUgx],
      ['Cash due UGX', report.summary.cashDueUgx],
      ['Available stock', report.summary.stock],
      ['Stock value UGX', report.summary.stockValueUgx],
      ['Expiring soon', report.alerts.expiringSoon],
      ['Expired', report.alerts.expired],
      ['Voided', report.alerts.voided],
    ])
    summary.getRow(1).font = { bold: true, size: 16 }

    const agents = workbook.addWorksheet('Agents')
    agents.columns = [
      { header: 'Agent code', key: 'code', width: 18 },
      { header: 'Agent', key: 'name', width: 24 },
      { header: 'Location', key: 'territory', width: 22 },
      { header: 'Stock', key: 'stock', width: 12 },
      { header: 'Stock value UGX', key: 'stockValueUgx', width: 18 },
      { header: 'Sales', key: 'sales', width: 12 },
      { header: 'Gross UGX', key: 'grossSalesUgx', width: 18 },
      { header: 'Commission UGX', key: 'commissionUgx', width: 18 },
      { header: 'Cash due UGX', key: 'cashDueUgx', width: 18 },
      { header: 'Last sale', key: 'lastSaleAt', width: 24 },
    ]
    agents.addRows(report.agents)
    agents.getRow(1).font = { bold: true }
    agents.views = [{ state: 'frozen', ySplit: 1 }]

    const locations = workbook.addWorksheet('Locations')
    locations.columns = [
      { header: 'Location', key: 'location', width: 24 },
      { header: 'Agents', key: 'agents', width: 12 },
      { header: 'Stock', key: 'stock', width: 12 },
      { header: 'Sales', key: 'sales', width: 12 },
      { header: 'Gross UGX', key: 'grossSalesUgx', width: 18 },
      { header: 'Cash due UGX', key: 'cashDueUgx', width: 18 },
    ]
    locations.addRows(report.locations)
    locations.getRow(1).font = { bold: true }

    const sales = workbook.addWorksheet('Recent Sales')
    sales.columns = [
      { header: 'Time', key: 'createdAt', width: 24 },
      { header: 'Agent / Owner', key: 'agentName', width: 24 },
      { header: 'Location', key: 'location', width: 22 },
      { header: 'Package', key: 'packageName', width: 20 },
      { header: 'Voucher', key: 'voucherCode', width: 20 },
      { header: 'Amount UGX', key: 'amountUgx', width: 16 },
    ]
    sales.addRows(report.recentSales)
    sales.getRow(1).font = { bold: true }

    const buffer = await workbook.xlsx.writeBuffer()
    return {
      filename: `voucher-sales-${Date.now()}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(buffer),
    }
  }

  async exportPdf(tenantId?: string, filters: VoucherDashboardFilters = {}) {
    const report = await this.getDashboard(tenantId, filters)
    const doc = new PDFDocument({ size: 'A4', margin: 38, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a').text('AROFi Voucher Sales Report')
    doc.moveDown(0.25)
    doc.font('Helvetica').fontSize(9).fillColor('#64748b')
      .text(`${new Date(report.range.from).toLocaleString()} — ${new Date(report.range.to).toLocaleString()}`)
    doc.moveDown(1)

    const cards = [
      ['Confirmed sales', String(report.summary.sales)],
      ['Gross sales', this.money(report.summary.grossSalesUgx)],
      ['Agent sales', this.money(report.summary.agentSalesUgx)],
      ['Cash due', this.money(report.summary.cashDueUgx)],
      ['Available stock', String(report.summary.stock)],
      ['Stock value', this.money(report.summary.stockValueUgx)],
    ]
    for (const [label, value] of cards) {
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(label)
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(value)
      doc.moveDown(0.45)
    }

    doc.addPage()
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('Top agents')
    doc.moveDown(0.5)
    for (const agent of report.agents.slice(0, 20)) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
        .text(`${agent.name} · ${agent.territory}`)
      doc.font('Helvetica').fontSize(8).fillColor('#475569')
        .text(`Sales ${agent.sales}  |  Gross ${this.money(agent.grossSalesUgx)}  |  Stock ${agent.stock}  |  Cash due ${this.money(agent.cashDueUgx)}`)
      doc.moveDown(0.45)
    }

    doc.addPage()
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('Location performance')
    doc.moveDown(0.5)
    for (const location of report.locations.slice(0, 20)) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(location.location)
      doc.font('Helvetica').fontSize(8).fillColor('#475569')
        .text(`Agents ${location.agents}  |  Sales ${location.sales}  |  Gross ${this.money(location.grossSalesUgx)}  |  Stock ${location.stock}`)
      doc.moveDown(0.45)
    }

    const complete = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
    })
    doc.end()

    return {
      filename: `voucher-sales-${Date.now()}.pdf`,
      contentType: 'application/pdf',
      buffer: await complete,
    }
  }

  private resolveRange(from: string | undefined, to: string | undefined, now: Date) {
    const parsedFrom = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const parsedTo = to ? new Date(to) : now
    const safeFrom = Number.isFinite(parsedFrom.getTime()) ? parsedFrom : new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const safeTo = Number.isFinite(parsedTo.getTime()) ? parsedTo : now
    return safeFrom <= safeTo ? { from: safeFrom, to: safeTo } : { from: safeTo, to: safeFrom }
  }

  private previousRange(from: Date, to: Date) {
    const duration = Math.max(1000, to.getTime() - from.getTime())
    return {
      from: new Date(from.getTime() - duration - 1),
      to: new Date(from.getTime() - 1),
    }
  }

  private money(value: number) {
    return `UGX ${Math.round(value).toLocaleString('en-UG')}`
  }
}
