#!/usr/bin/env python3
"""Apply guarded CSV export security hardening.

This transform touches only CSV serialization code in payment, agent, and
voucher reporting. It does not alter RADIUS, MikroTik/router provisioning,
captive portal behavior, payment routing, CoA/disconnect, or remote access.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_once(path: str, old: str, new: str, label: str) -> None:
    text = read(path)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one source match, found {count}")
    write(path, text.replace(old, new, 1))


def add_import_once(path: str, marker: str, import_line: str, label: str) -> None:
    text = read(path)
    if import_line in text:
        return
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one import marker, found {count}")
    write(path, text.replace(marker, marker + import_line, 1))


# Payments export ------------------------------------------------------------
payments = 'apps/api/src/modules/payments/payments.service.ts'
add_import_once(
    payments,
    "import { PrismaService } from '../../prisma.service'\n",
    "import { escapeCsvCell } from '../../common/security/csv'\n",
    'payments CSV import',
)
replace_once(
    payments,
    '''    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`\n''',
    "    const escape = escapeCsvCell\n",
    'payments CSV encoder',
)

# Agent disbursement export --------------------------------------------------
agents = 'apps/api/src/modules/agents/agents.service.ts'
add_import_once(
    agents,
    "import { PrismaService } from '../../prisma.service'\n",
    "import { escapeCsvCell } from '../../common/security/csv'\n",
    'agents CSV import',
)
replace_once(
    agents,
    '''    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`\n''',
    "    const escape = escapeCsvCell\n",
    'agent disbursement CSV encoder',
)

# Agent voucher accountability export ---------------------------------------
metrics = 'apps/api/src/modules/agents/agent-voucher-metrics.service.ts'
add_import_once(
    metrics,
    "import { PrismaService } from '../../prisma.service'\n",
    "import { escapeCsvCell } from '../../common/security/csv'\n",
    'agent voucher metrics CSV import',
)
replace_once(
    metrics,
    '''      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))\n''',
    "      .map((row) => row.map(escapeCsvCell).join(','))\n",
    'agent voucher metrics CSV encoder',
)

# Voucher batch export -------------------------------------------------------
vouchers = 'apps/api/src/modules/vouchers/vouchers.service.ts'
add_import_once(
    vouchers,
    "import { PrismaService } from '../../prisma.service'\n",
    "import { escapeCsvCell } from '../../common/security/csv'\n",
    'voucher CSV import',
)
replace_once(
    vouchers,
    '''        ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','),\n''',
    "        ].map(escapeCsvCell).join(','),\n",
    'voucher batch CSV encoder',
)

print('CSV export security hardening applied: spreadsheet formulas are neutralized.')
