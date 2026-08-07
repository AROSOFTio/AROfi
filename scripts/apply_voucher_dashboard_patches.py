#!/usr/bin/env python3
"""Insert the voucher intelligence block without changing the existing dashboard top."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / 'apps/admin-web/src/components/DashboardHome.tsx'

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
print('Voucher sales dashboard inserted below the existing dashboard top.')
