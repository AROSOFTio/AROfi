import { ForbiddenException, Injectable } from '@nestjs/common'
import { AgentStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

type VoucherStockSummaryRow = {
  assigned: bigint
  available: bigint
  sold: bigint
  redeemed: bigint
}

type VoucherStockBatchCountRow = {
  batchId: string
  available: bigint
  sold: bigint
  redeemed: bigint
}

@Injectable()
export class AgentVoucherStockService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyStock(email: string, tenantId: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const agentSelect = {
      id: true,
      code: true,
      name: true,
      status: true,
    } satisfies Prisma.AgentSelect

    // Account emails are normalized to lowercase by the auth flow. Normalize
    // the authenticated value here too so ordinary mixed-case login input can
    // use the exact, index-friendly lookup. Keep the insensitive fallback only
    // for legacy Agent rows whose stored email casing differs.
    const agent =
      (await this.prisma.agent.findFirst({
        where: { tenantId, email: normalizedEmail },
        select: agentSelect,
      })) ??
      (await this.prisma.agent.findFirst({
        where: { tenantId, email: { equals: normalizedEmail, mode: 'insensitive' } },
        select: agentSelect,
      }))

    if (!agent) throw new ForbiddenException('This login is not linked to an Agent profile.')
    if (agent.status !== AgentStatus.ACTIVE) throw new ForbiddenException('This Agent account is not active.')

    const now = new Date()

    // The UI only renders the latest 100 assigned batches. Keep per-batch
    // status aggregation bounded to those same 100 rows instead of grouping
    // every voucher batch the Agent has ever received. Overall summary totals
    // still cover the Agent's complete stock history in a separate compact
    // aggregate row, preserving the existing response semantics.
    const [batches, summaryRows, batchCountRows] = await Promise.all([
      this.prisma.voucherBatch.findMany({
        where: { tenantId, agentId: agent.id },
        select: {
          id: true,
          batchNumber: true,
          package: { select: { id: true, name: true, code: true } },
          quantity: true,
          faceValueUgx: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.$queryRaw<VoucherStockSummaryRow[]>(Prisma.sql`
        WITH agent_batches AS (
          SELECT batches.id, batches.quantity
          FROM "VoucherBatch" AS batches
          WHERE batches."tenantId" = ${tenantId}
            AND batches."agentId" = ${agent.id}
        ),
        batch_totals AS (
          SELECT COALESCE(SUM(agent_batches.quantity), 0)::bigint AS assigned
          FROM agent_batches
        ),
        voucher_totals AS (
          SELECT
            COUNT(*) FILTER (
              WHERE vouchers.status IN ('GENERATED', 'PRINTED')
                AND (vouchers."expiresAt" IS NULL OR vouchers."expiresAt" > ${now})
            )::bigint AS available,
            COUNT(*) FILTER (
              WHERE vouchers.status = 'SOLD'
            )::bigint AS sold,
            COUNT(*) FILTER (
              WHERE vouchers.status = 'REDEEMED'
            )::bigint AS redeemed
          FROM "Voucher" AS vouchers
          INNER JOIN agent_batches ON agent_batches.id = vouchers."batchId"
          WHERE vouchers."tenantId" = ${tenantId}
            AND (
              vouchers.status IN ('SOLD', 'REDEEMED')
              OR (
                vouchers.status IN ('GENERATED', 'PRINTED')
                AND (vouchers."expiresAt" IS NULL OR vouchers."expiresAt" > ${now})
              )
            )
        )
        SELECT
          batch_totals.assigned,
          voucher_totals.available,
          voucher_totals.sold,
          voucher_totals.redeemed
        FROM batch_totals, voucher_totals
      `),
      this.prisma.$queryRaw<VoucherStockBatchCountRow[]>(Prisma.sql`
        WITH recent_batches AS (
          SELECT batches.id
          FROM "VoucherBatch" AS batches
          WHERE batches."tenantId" = ${tenantId}
            AND batches."agentId" = ${agent.id}
          ORDER BY batches."createdAt" DESC
          LIMIT 100
        )
        SELECT
          vouchers."batchId" AS "batchId",
          COUNT(*) FILTER (
            WHERE vouchers.status IN ('GENERATED', 'PRINTED')
              AND (vouchers."expiresAt" IS NULL OR vouchers."expiresAt" > ${now})
          )::bigint AS available,
          COUNT(*) FILTER (
            WHERE vouchers.status = 'SOLD'
          )::bigint AS sold,
          COUNT(*) FILTER (
            WHERE vouchers.status = 'REDEEMED'
          )::bigint AS redeemed
        FROM "Voucher" AS vouchers
        INNER JOIN recent_batches ON recent_batches.id = vouchers."batchId"
        WHERE vouchers."tenantId" = ${tenantId}
          AND (
            vouchers.status IN ('SOLD', 'REDEEMED')
            OR (
              vouchers.status IN ('GENERATED', 'PRINTED')
              AND (vouchers."expiresAt" IS NULL OR vouchers."expiresAt" > ${now})
            )
          )
        GROUP BY vouchers."batchId"
      `),
    ])

    const countsByBatch = new Map<string, { available: number; sold: number; redeemed: number }>()
    for (const row of batchCountRows) {
      countsByBatch.set(row.batchId, {
        available: Number(row.available),
        sold: Number(row.sold),
        redeemed: Number(row.redeemed),
      })
    }

    const summaryRow = summaryRows[0] ?? {
      assigned: BigInt(0),
      available: BigInt(0),
      sold: BigInt(0),
      redeemed: BigInt(0),
    }
    const summary = {
      assigned: Number(summaryRow.assigned),
      available: Number(summaryRow.available),
      sold: Number(summaryRow.sold),
      redeemed: Number(summaryRow.redeemed),
    }

    const items = batches.map((batch) => {
      const counts = countsByBatch.get(batch.id) ?? { available: 0, sold: 0, redeemed: 0 }

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        package: batch.package,
        quantity: batch.quantity,
        faceValueUgx: batch.faceValueUgx,
        available: counts.available,
        sold: counts.sold,
        redeemed: counts.redeemed,
        status: batch.status,
        createdAt: batch.createdAt,
        expiresAt: batch.expiresAt,
      }
    })

    return {
      agent: { id: agent.id, code: agent.code, name: agent.name },
      summary,
      batches: items,
    }
  }
}
