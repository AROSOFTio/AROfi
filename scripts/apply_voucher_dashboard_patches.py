#!/usr/bin/env python3
"""Insert voucher intelligence without changing the existing dashboard top.

The same guarded pass also normalizes imports that differ between the browser
and CommonJS API builds.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / 'apps/admin-web/src/components/DashboardHome.tsx'
CLIENT = ROOT / 'apps/admin-web/src/components/VoucherSalesDashboard.tsx'
SERVICE = ROOT / 'apps/api/src/modules/agents/voucher-dashboard.service.ts'

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

print('Voucher sales dashboard inserted and build compatibility normalized.')
