'use client'

import { useState, type CSSProperties } from 'react'

type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks'

const UNIT_MINUTES: Record<DurationUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
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

// Lets admins enter a duration in whichever unit makes sense (e.g. "6" + "Hours")
// instead of pre-calculating minutes by hand. Internally still emits minutes,
// since that's what the API stores. Pass a `key` from the parent that changes
// when switching edit targets (e.g. editingId) so this remounts with a fresh
// decomposition instead of fighting the controlled minutes value while typing.
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

  function emit(nextAmount: string, nextUnit: DurationUnit) {
    const parsedAmount = Number.parseFloat(nextAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      onChangeMinutes('')
      return
    }

    onChangeMinutes(String(Math.round(parsedAmount * UNIT_MINUTES[nextUnit])))
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="number"
        min={1}
        step="any"
        className={inputClassName}
        value={amount}
        onChange={(event) => {
          setState({ amount: event.target.value, unit })
          emit(event.target.value, unit)
        }}
        style={{ ...fieldStyle, flex: 1 }}
        required
      />
      <select
        className={selectClassName}
        value={unit}
        onChange={(event) => {
          const nextUnit = event.target.value as DurationUnit
          setState({ amount, unit: nextUnit })
          emit(amount, nextUnit)
        }}
        style={{ ...fieldStyle, width: 130 }}
      >
        <option value="minutes">Minutes</option>
        <option value="hours">Hours</option>
        <option value="days">Days</option>
        <option value="weeks">Weeks</option>
      </select>
    </div>
  )
}
