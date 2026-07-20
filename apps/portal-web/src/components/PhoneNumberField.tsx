'use client'

import { useEffect, useRef, useState } from 'react'
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'

type PhoneNumberFieldProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  autoFocus?: boolean
  className?: string
  label?: string
  name?: string
  ugandaOnly?: boolean
  mobileOnly?: boolean
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const allCountries = getCountries()

function normalize(country: CountryCode, value: string) {
  const digits = value.replace(/\D/g, '').replace(/^0+/, '')
  return digits ? `+${getCountryCallingCode(country)}${digits}` : ''
}

export function PhoneNumberField({
  value,
  onChange,
  required = false,
  autoFocus = false,
  className = '',
  label = 'Phone number',
  name,
  ugandaOnly = false,
  mobileOnly = false,
}: PhoneNumberFieldProps) {
  const parsedValue = value.startsWith('+') ? parsePhoneNumberFromString(value) : undefined
  const [country, setCountry] = useState<CountryCode>(parsedValue?.country ?? 'UG')
  const [nationalNumber, setNationalNumber] = useState(parsedValue?.nationalNumber ?? value)
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = parsePhoneNumberFromString(normalize(country, nationalNumber))
  const error = !nationalNumber
    ? required ? 'Enter a phone number.' : ''
    : !parsed || !parsed.isPossible() || !parsed.isValid()
      ? 'Enter a valid phone number for the selected country.'
      : mobileOnly && parsed.getType() !== 'MOBILE'
        ? 'Enter a valid mobile phone number.'
      : ''

  useEffect(() => {
    inputRef.current?.setCustomValidity(error)
  }, [error])

  useEffect(() => {
    const normalized = normalize(country, nationalNumber)
    if (!value || value === normalized) return
    const next = parsePhoneNumberFromString(value)
    if (next?.country) {
      setCountry(next.country)
      setNationalNumber(next.nationalNumber)
    }
  }, [value])

  const countries = ugandaOnly ? (['UG'] as CountryCode[]) : allCountries

  return (
    <div className="grid grid-cols-[minmax(112px,0.42fr)_minmax(0,1fr)] gap-2 max-[430px]:grid-cols-1">
      {name && <input type="hidden" name={name} value={normalize(country, nationalNumber)} />}
      <select
        value={country}
        onChange={(event) => {
          const nextCountry = event.target.value as CountryCode
          setCountry(nextCountry)
          onChange(normalize(nextCountry, nationalNumber))
        }}
        className={className}
        aria-label="Country code"
      >
        {countries.map((code) => (
          <option key={code} value={code}>{countryNames.of(code) ?? code} (+{getCountryCallingCode(code)})</option>
        ))}
      </select>
      <input
        ref={inputRef}
        value={nationalNumber}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d\s()-]/g, '')
          setNationalNumber(next)
          onChange(normalize(country, next))
        }}
        onBlur={() => setTouched(true)}
        placeholder="771 234 567"
        inputMode="tel"
        type="tel"
        required={required}
        autoFocus={autoFocus}
        autoComplete="tel-national"
        aria-label={label}
        aria-invalid={Boolean(touched && error)}
        className={className}
      />
      {touched && error && <span className="col-span-full text-xs font-semibold text-red-700" role="alert">{error}</span>}
    </div>
  )
}
