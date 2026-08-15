#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const target = path.join(root, 'apps/api/src/modules/agents/agent-accounting.service.ts')

let source = fs.readFileSync(target, 'utf8')

const rules = [
  {
    from: '[DisbursementStatus.PENDING, DisbursementStatus.PROCESSING, DisbursementStatus.PENDING_APPROVAL].includes(item.status)',
    to: '([DisbursementStatus.PENDING, DisbursementStatus.PROCESSING, DisbursementStatus.PENDING_APPROVAL] as DisbursementStatus[]).includes(item.status)',
    expected: 1,
  },
  {
    from: '[PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.EXPIRED].includes(status)',
    to: '([PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.EXPIRED] as PaymentStatus[]).includes(status)',
    expected: 3,
  },
  {
    from: '[DisbursementStatus.FAILED, DisbursementStatus.CANCELLED, DisbursementStatus.REVERSED].includes(disbursement.status)',
    to: '([DisbursementStatus.FAILED, DisbursementStatus.CANCELLED, DisbursementStatus.REVERSED] as DisbursementStatus[]).includes(disbursement.status)',
    expected: 1,
  },
]

let changed = false
for (const rule of rules) {
  const count = source.split(rule.from).length - 1
  if (count === 0) {
    if (!source.includes(rule.to)) {
      throw new Error(`Agent accounting compatibility marker missing: ${rule.from}`)
    }
    continue
  }
  if (count !== rule.expected) {
    throw new Error(`Expected ${rule.expected} occurrence(s) of Agent accounting status check, found ${count}: ${rule.from}`)
  }
  source = source.split(rule.from).join(rule.to)
  changed = true
}

if (changed) {
  fs.writeFileSync(target, source)
  console.log('Agent accounting enum status checks normalized for TypeScript.')
} else {
  console.log('Agent accounting enum status checks already normalized.')
}
