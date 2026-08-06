'use client'

import { useMemo, useState, type CSSProperties } from 'react'

type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks'

const UNIT_MINUTES: Record<DurationUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
}

const UNIT_LABELS: Record<DurationUnit, string> = {
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  weeks: 'Weeks',
}

function decompose(totalMinutes: number): { amount: string; unit: DurationUnit } {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return { amount: '', unit: 'hours' }
  }
  if (totalMinutes % UNIT_MINUTES.weeks === 0) {
    return { amount: String(totalMinutes / UNIT_MINUTES.weeks), unit: 'weeks' }
  }
  if (totalMinutes % UNIT_MINUTES.days === 0) {
    return { amount: String(totalMinutes / UNIT_MINUTES.days), unit: 'days' }
  }
  if (totalMinutes % UNIT_MINUTES.hours === 0) {
    return { amount: String(totalMinutes / UNIT_MINUTES.hours), unit: 'hours' }
  }
  return { amount: String(totalMinutes), unit: 'minutes' }
}

function durationSummary(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 'Enter a duration above'
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} total`
  if (totalMinutes < 1440 && totalMinutes % 60 === 0) {
    const hours = totalMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'} total`
  }
  if (totalMinutes % 1440 === 0) {
    const days = totalMinutes / 1440
    return `${days} day${days === 1 ? '' : 's'} total`
  }
  return `${totalMinutes.toLocaleString()} minutes total`
}

export function DurationInput({
  valueMinutes,
  onChangeMinutes,
  inputClassName,
  selectClassName,
  fieldStyle,
}: {
  valueMinutes: string
  onChangeMinutes: (minutes: string) => void
  inputClassName?: string
  selectClassName?: string
  fieldStyle?: CSSProperties
}) {
  const [{ amount, unit }, setState] = useState(() => decompose(Number.parseInt(valueMinutes, 10)))
  const totalMinutes = Number.parseInt(valueMinutes, 10)
  const summary = useMemo(() => durationSummary(totalMinutes), [totalMinutes])

  function emit(nextAmount: string, nextUnit: DurationUnit) {
    const parsedAmount = Number.parseFloat(nextAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      onChangeMinutes('')
      return
    }
    onChangeMinutes(String(Math.round(parsedAmount * UNIT_MINUTES[nextUnit])))
  }

  return (
    <div className="clear-duration-input">
      <style>{`
        .clear-duration-input { width: 100%; }
        .clear-duration-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(132px, .72fr); gap: 10px; }
        .clear-duration-field { display: block; min-width: 0; }
        .clear-duration-caption { display: block; margin: 0 0 5px; color: var(--text-muted); font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
        .clear-duration-control { width: 100% !important; min-width: 0; min-height: 50px !important; color: var(--text-primary) !important; background: var(--surface) !important; font-size: 17px !important; font-weight: 750 !important; line-height: 1.2 !important; opacity: 1 !important; }
        .clear-duration-control[type='number'] { font-size: 20px !important; }
        .clear-duration-summary { margin-top: 7px; color: var(--brand-fg); font-size: 12px; font-weight: 700; }
        @media (max-width: 520px) {
          .clear-duration-fields { grid-template-columns: 1fr; }
          .clear-duration-control { min-height: 52px !important; font-size: 17px !important; }
          .clear-duration-control[type='number'] { font-size: 22px !important; }
        }
      `}</style>
      <div className="clear-duration-fields">
        <label className="clear-duration-field">
          <span className="clear-duration-caption">Number</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step="any"
            className={`${inputClassName ?? ''} clear-duration-control`.trim()}
            value={amount}
            placeholder="Enter number"
            onChange={(event) => {
              setState({ amount: event.target.value, unit })
              emit(event.target.value, unit)
            }}
            style={fieldStyle}
            required
          />
        </label>
        <label className="clear-duration-field">
          <span className="clear-duration-caption">Time unit</span>
          <select
            className={`${selectClassName ?? ''} clear-duration-control`.trim()}
            value={unit}
            onChange={(event) => {
              const nextUnit = event.target.value as DurationUnit
              setState({ amount, unit: nextUnit })
              emit(amount, nextUnit)
            }}
            style={fieldStyle}
            aria-label="Duration unit"
          >
            {(Object.keys(UNIT_LABELS) as DurationUnit[]).map((option) => (
              <option key={option} value={option}>{UNIT_LABELS[option]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="clear-duration-summary" aria-live="polite">{summary}</div>
    </div>
  )
}
