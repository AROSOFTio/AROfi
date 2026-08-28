#!/usr/bin/env python3
"""Insert voucher intelligence without changing the existing dashboard top.

This guarded pass also normalizes build imports, adds expiring-stock metrics on
legacy voucher-metric implementations, and makes dashboard links open a
pre-filtered professional report.

The Agent voucher metrics service has since been optimized to use grouped
queries instead of materializing voucher rows.  The older expiring-soon source
rewrite depended on that materialized-row implementation, so this script now
applies that optional rewrite only when the legacy shape is present.  The
remaining dashboard/report patches stay idempotent on both source layouts.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / 'apps/admin-web/src/components/DashboardHome.tsx'
CLIENT = ROOT / 'apps/admin-web/src/components/VoucherSalesDashboard.tsx'
SERVICE = ROOT / 'apps/api/src/modules/agents/voucher-dashboard.service.ts'
METRICS = ROOT / 'apps/api/src/modules/agents/agent-voucher-metrics.service.ts'
REPORT = ROOT / 'apps/admin-web/src/components/AgentVoucherAccountabilityReport.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# Vendor dashboard placement: directly below the existing top/wallet area.
text = DASHBOARD.read_text()
import_line = "import VoucherSalesDashboard from '@/components/VoucherSalesDashboard'\n"
import_marker = "import { DashboardAutoRefresh } from '@/components/DashboardAutoRefresh'\n"
if import_line not in text:
    if text.count(import_marker) != 1:
        raise RuntimeError('Dashboard import marker not found exactly once')
    text = text.replace(import_marker, import_marker + import_line, 1)

insertion = """      <VoucherSalesDashboard />

"""
marker = """      <div className="dashboard-main-grid">
"""
if insertion not in text:
    if text.count(marker) != 1:
        raise RuntimeError(f'Vendor dashboard insertion marker expected once, found {text.count(marker)}')
    text = text.replace(marker, insertion + marker, 1)
DASHBOARD.write_text(text)

# ReactNode is imported explicitly so strict Next.js type checking does not
# depend on a global React namespace.
client_text = CLIENT.read_text()
client_text = client_text.replace(
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
    "import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'",
)
client_text = client_text.replace('icon: React.ReactNode', 'icon: ReactNode')
CLIENT.write_text(client_text)

# pdfkit is a CommonJS export. The assignment import matches the rest of the
# API and avoids a runtime `.default is not a constructor` failure.
service_text = SERVICE.read_text()
service_text = service_text.replace(
    "import PDFDocument from 'pdfkit'",
    "import PDFDocument = require('pdfkit')",
)
SERVICE.write_text(service_text)

# The original expiring-soon accountability rewrite operated on an older
# service implementation that materialized voucher rows and reduced them in
# Node.  The current optimized service groups voucher status/value in
# PostgreSQL, so those exact source markers no longer exist.  Keep the legacy
# transformation for older source states, but never fail a modern optimized
# build merely because the implementation has intentionally changed.
metrics_text = METRICS.read_text()
legacy_expiring_shape = (
    "allMetrics.reduce((total, item) => total + item.expired, 0)" in metrics_text
    and "if (voucher.status === VoucherStatus.GENERATED)" in metrics_text
)

if legacy_expiring_shape:
    metrics_text = replace_once(
        metrics_text,
        """  redeemed: number
  expired: number
  voided: number""",
        """  redeemed: number
  expired: number
  expiringSoon: number
  voided: number""",
        'metric expiring type',
    )
    metrics_text = replace_once(
        metrics_text,
        """        expired: allMetrics.reduce((total, item) => total + item.expired, 0),
        voided: allMetrics.reduce((total, item) => total + item.voided, 0),""",
        """        expired: allMetrics.reduce((total, item) => total + item.expired, 0),
        expiringSoon: allMetrics.reduce((total, item) => total + item.expiringSoon, 0),
        voided: allMetrics.reduce((total, item) => total + item.voided, 0),""",
        'summary expiring value',
    )
    metrics_text = replace_once(
        metrics_text,
        """        'redeemed',
        'expired',
        'voided',""",
        """        'redeemed',
        'expired',
        'expiringSoon',
        'voided',""",
        'csv expiring header',
    )
    metrics_text = metrics_text.replace(
        """        report.main.redeemed,
        report.main.expired,
        report.main.voided,""",
        """        report.main.redeemed,
        report.main.expired,
        report.main.expiringSoon,
        report.main.voided,""",
    )
    metrics_text = metrics_text.replace(
        """        item.redeemed,
        item.expired,
        item.voided,""",
        """        item.redeemed,
        item.expired,
        item.expiringSoon,
        item.voided,""",
    )
    metrics_text = replace_once(
        metrics_text,
        """      redeemed: 0,
      expired: 0,
      voided: 0,""",
        """      redeemed: 0,
      expired: 0,
      expiringSoon: 0,
      voided: 0,""",
        'empty metric expiring value',
    )
    metrics_text = replace_once(
        metrics_text,
        """    if (voucher.status === VoucherStatus.GENERATED) {
      metric.generated += 1""",
        """    const expiringSoonByDate =
      voucher.expiresAt !== null &&
      voucher.expiresAt > now &&
      voucher.expiresAt <= new Date(now.getTime() + 7 * 86400000) &&
      (voucher.status === VoucherStatus.GENERATED || voucher.status === VoucherStatus.PRINTED)

    if (expiringSoonByDate) {
      metric.expiringSoon += 1
    }

    if (voucher.status === VoucherStatus.GENERATED) {
      metric.generated += 1""",
        'accumulate expiring stock',
    )
    METRICS.write_text(metrics_text)
else:
    print('Voucher metrics already use the optimized grouped implementation; skipping legacy expiring-soon rewrite.')

# Read dashboard query parameters in the full report, open it immediately when
# deep-linked, filter supported exception rows, and expose all export formats.
report_text = REPORT.read_text()
report_text = replace_once(
    report_text,
    "import { FormEvent, useEffect, useMemo, useState } from 'react'",
    "import { FormEvent, useEffect, useMemo, useState } from 'react'\nimport { useSearchParams } from 'next/navigation'",
    'report search params import',
)

if legacy_expiring_shape:
    report_text = replace_once(
        report_text,
        """  redeemed: number
  expired: number
  voided: number""",
        """  redeemed: number
  expired: number
  expiringSoon: number
  voided: number""",
        'report metric expiring type',
    )
    report_text = replace_once(
        report_text,
        """    redeemed: number
    expired: number
    voided: number""",
        """    redeemed: number
    expired: number
    expiringSoon: number
    voided: number""",
        'report summary expiring type',
    )

report_text = replace_once(
    report_text,
    """export default function AgentVoucherAccountabilityReport() {
  const [open, setOpen] = useState(false)""",
    """export default function AgentVoucherAccountabilityReport() {
  const searchParams = useSearchParams()
  const urlFilters = useMemo<Filters>(() => ({
    ownerType: searchParams.get('ownerType') === 'AGENT' || searchParams.get('ownerType') === 'MAIN'
      ? searchParams.get('ownerType') as Filters['ownerType']
      : 'ALL',
    agentId: searchParams.get('agentId') ?? '',
    territory: searchParams.get('territory') ?? '',
    packageId: searchParams.get('packageId') ?? '',
    from: isoDateInput(searchParams.get('from')),
    to: isoDateInput(searchParams.get('to')),
  }), [searchParams])
  const statusFilter = (searchParams.get('status') ?? '').toUpperCase()
  const hasUrlFilters = Boolean(
    urlFilters.agentId || urlFilters.territory || urlFilters.packageId ||
    urlFilters.from || urlFilters.to || statusFilter,
  )
  const [open, setOpen] = useState(hasUrlFilters)""",
    'report deep link setup',
)
report_text = replace_once(
    report_text,
    "const [filters, setFilters] = useState<Filters>(initialFilters)",
    "const [filters, setFilters] = useState<Filters>(urlFilters)",
    'report initial URL filters',
)
report_text = replace_once(
    report_text,
    """  useEffect(() => { void loadInitial() }, [])

  async function loadInitial() {""",
    """  useEffect(() => { void loadInitial(urlFilters) }, [])

  async function loadInitial(startFilters: Filters) {""",
    'report initial load signature',
)
report_text = replace_once(
    report_text,
    """      setPackages(packageData.items ?? [])
      await loadReport(initialFilters)""",
    """      setPackages(packageData.items ?? [])
      setFilters(startFilters)
      await loadReport(startFilters)""",
    'report initial filtered request',
)

if legacy_expiring_shape:
    filtered_rows = """    for (const item of report?.items ?? []) output.push({ key: item.agentId, owner: 'Agent', code: item.agent.code, name: item.agent.name, territory: item.agent.territory ?? 'Unassigned', metric: item })
    return output.filter((row) => {
      if (statusFilter === 'EXPIRED') return row.metric.expired > 0
      if (statusFilter === 'EXPIRING') return row.metric.expiringSoon > 0
      if (statusFilter === 'VOIDED') return row.metric.voided > 0
      if (statusFilter === 'UNSOLD') return row.metric.unsold > 0
      return true
    })
  }, [report, statusFilter])"""
else:
    filtered_rows = """    for (const item of report?.items ?? []) output.push({ key: item.agentId, owner: 'Agent', code: item.agent.code, name: item.agent.name, territory: item.agent.territory ?? 'Unassigned', metric: item })
    return output.filter((row) => {
      if (statusFilter === 'EXPIRED') return row.metric.expired > 0
      if (statusFilter === 'VOIDED') return row.metric.voided > 0
      if (statusFilter === 'UNSOLD') return row.metric.unsold > 0
      return true
    })
  }, [report, statusFilter])"""

report_text = replace_once(
    report_text,
    """    for (const item of report?.items ?? []) output.push({ key: item.agentId, owner: 'Agent', code: item.agent.code, name: item.agent.name, territory: item.agent.territory ?? 'Unassigned', metric: item })
    return output
  }, [report])""",
    filtered_rows,
    'report exception filtering',
)
report_text = replace_once(
    report_text,
    """  const exportUrl = `/api/agents/voucher-metrics/export.csv?${buildQuery(filters)}`
  const summary = report?.summary""",
    """  const exportQuery = buildQuery(filters)
  const exportUrl = `/api/agents/voucher-metrics/export.csv?${exportQuery}`
  const exportExcelUrl = `/api/voucher-dashboard/export.xlsx?${exportQuery}`
  const exportPdfUrl = `/api/voucher-dashboard/export.pdf?${exportQuery}`
  const summary = report?.summary""",
    'report export URLs',
)
report_text = replace_once(
    report_text,
    """            <a className="btn btn-ghost" href={exportUrl}>Export CSV</a>""",
    """            <a className="btn btn-ghost" href={exportUrl}>CSV</a>
            <a className="btn btn-ghost" href={exportExcelUrl}>Excel</a>
            <a className="btn btn-ghost" href={exportPdfUrl}>PDF</a>""",
    'report export actions',
)
if 'function isoDateInput(' not in report_text:
    report_text += """

function isoDateInput(value: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
"""
REPORT.write_text(report_text)

print('Voucher dashboard, deep-linked reporting, and exports are ready.')
