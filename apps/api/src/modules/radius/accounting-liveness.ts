export const ACCOUNTING_LIVE_WINDOW_SECONDS = Math.max(
  1,
  Number.parseInt(process.env.ACCOUNTING_LIVE_WINDOW_SECONDS ?? '60', 10) || 60,
)

export function accountingLiveCutoff(now = new Date()) {
  return new Date(now.getTime() - ACCOUNTING_LIVE_WINDOW_SECONDS * 1000)
}

export function latestAccountingSignal(input: {
  acctupdatetime?: Date | null
  acctstarttime?: Date | null
}) {
  return input.acctupdatetime ?? input.acctstarttime ?? null
}

export function isLiveAccountingRow(input: {
  acctstoptime?: Date | null
  acctupdatetime?: Date | null
  acctstarttime?: Date | null
}, now = new Date()) {
  if (input.acctstoptime) {
    return false
  }
  const signalAt = latestAccountingSignal(input)
  return Boolean(signalAt && signalAt.getTime() >= accountingLiveCutoff(now).getTime())
}