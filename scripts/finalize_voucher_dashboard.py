#!/usr/bin/env python3
"""Final correctness pass for the voucher dashboard.

Runs after apply_voucher_dashboard_patches.py and keeps the compact UI while:
- showing Live only when the SSE connection is actually open;
- composing batch/agent/location filters without overwriting each other;
- calculating agent cash accountability as gross less commission and historical
  completed settlement coverage (platform fees are a business/platform charge,
  not cash the field agent is allowed to retain).
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / 'apps/admin-web/src/components/VoucherSalesDashboard.tsx'
SERVICE = ROOT / 'apps/api/src/modules/agents/voucher-dashboard.service.ts'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


client = CLIENT.read_text()
client = replace_once(
    client,
    """      const next = await clientFetchApi<VoucherDashboardData>(`/voucher-dashboard?${query}`)
      setData(next)
      setStreamState('live')""",
    """      const next = await clientFetchApi<VoucherDashboardData>(`/voucher-dashboard?${query}`)
      setData(next)""",
    'poll must not impersonate SSE live state',
)
client = replace_once(
    client,
    """  useRealtimeEvents((event) => {
    lastEventAt.current = Date.now()
    setStreamState('live')
    window.setTimeout(() => void load(true), 120)
  }, ['voucher.redeemed'])""",
    """  useRealtimeEvents((event) => {
    lastEventAt.current = Date.now()
    window.setTimeout(() => void load(true), 120)
  }, ['voucher.redeemed'], (state) => {
    setStreamState(state === 'open' ? 'live' : 'reconnecting')
  })""",
    'actual SSE connection state',
)
CLIENT.write_text(client)

service = SERVICE.read_text()
old_where = """    const baseSalesWhere: Prisma.BillingTransactionWhereInput = {
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
"""
new_where = """    const salesConstraints: Prisma.BillingTransactionWhereInput[] = []
    if (filters.batchId) {
      salesConstraints.push({ voucher: { is: { batchId: filters.batchId } } })
    }
    if (filters.agentId) {
      salesConstraints.push({
        OR: [
          { agentId: filters.agentId },
          { voucher: { is: { batch: { is: { agentId: filters.agentId } } } } },
        ],
      })
    }
    if (filters.territory) {
      salesConstraints.push({
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
      })
    }

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
      ...(salesConstraints.length > 0 ? { AND: salesConstraints } : {}),
    }
"""
service = replace_once(service, old_where, new_where, 'composable voucher sales filters')
service = replace_once(
    service,
    """        agent.grossSalesUgx - agent.platformFeesUgx - agent.commissionUgx - agent.settledGrossUgx,""",
    """        agent.grossSalesUgx - agent.commissionUgx - agent.settledGrossUgx,""",
    'cash accountability formula',
)
SERVICE.write_text(service)

print('Voucher dashboard final correctness pass applied.')
