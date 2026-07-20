'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max'

type PhoneNumberFieldProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  name?: string
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  autoComplete?: string
  mobileOnly?: boolean
  ugandaOnly?: boolean
  className?: string
  placeholder?: string
  'aria-label'?: string
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const allCountries = getCountries()

function initialCountry(value: string): CountryCode {
  const parsed = value.startsWith('+') ? parsePhoneNumberFromString(value) : undefined
  return parsed?.country ?? 'UG'
}

function initialNationalNumber(value: string) {
  const parsed = value.startsWith('+') ? parsePhoneNumberFromString(value) : undefined
  return parsed?.nationalNumber ?? value
}

function normalize(country: CountryCode, nationalNumber: string) {
  const digits = nationalNumber.replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return ''
  return `+${getCountryCallingCode(country)}${digits}`
}

export function validatePhoneNumber(value: string, mobileOnly = false, ugandaOnly = false) {
  const parsed = parsePhoneNumberFromString(value)
  if (!parsed || !parsed.isPossible() || !parsed.isValid()) {
    return 'Enter a valid phone number for the selected country.'
  }
  if (ugandaOnly && parsed.country !== 'UG') {
    return 'This service currently accepts Uganda phone numbers only.'
  }
  if (mobileOnly && parsed.getType() !== 'MOBILE') {
    return 'Enter a valid mobile phone number.'
  }
  return ''
}

export function PhoneNumberField({
  value,
  defaultValue = '',
  onChange,
  name,
  required = false,
  disabled = false,
  autoFocus = false,
  autoComplete = 'tel-national',
  mobileOnly = false,
  ugandaOnly = false,
  className = 'form-input',
  placeholder = '771 234 567',
  'aria-label': ariaLabel = 'Phone number',
}: PhoneNumberFieldProps) {
  const sourceValue = value ?? defaultValue
  const [country, setCountry] = useState<CountryCode>(() => initialCountry(sourceValue))
  const [nationalNumber, setNationalNumber] = useState(() => initialNationalNumber(sourceValue))
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const countries = useMemo(() => ugandaOnly ? (['UG'] as CountryCode[]) : allCountries, [ugandaOnly])
  const normalized = normalize(country, nationalNumber)
  const validationError = normalized ? validatePhoneNumber(normalized, mobileOnly, ugandaOnly) : required ? 'Enter a phone number.' : ''

  useEffect(() => {
    if (value === undefined || value === normalized) return
    setCountry(initialCountry(value))
    setNationalNumber(initialNationalNumber(value))
  }, [value])

  useEffect(() => {
    inputRef.current?.setCustomValidity(validationError)
  }, [validationError])

  function emit(nextCountry: CountryCode, nextNationalNumber: string) {
    const next = normalize(nextCountry, nextNationalNumber)
    onChange?.(next)
  }

  return (
    <div className="phone-field">
      {name && <input type="hidden" name={name} value={normalized} />}
      <select
        className={`${className} phone-country-select`}
        value={country}
        onChange={(event) => {
          const nextCountry = event.target.value as CountryCode
          setCountry(nextCountry)
          emit(nextCountry, nationalNumber)
        }}
        disabled={disabled}
        aria-label="Country code"
      >
        {countries.map((code) => (
          <option key={code} value={code}>
            {countryNames.of(code) ?? code} (+{getCountryCallingCode(code)})
          </option>
        ))}
      </select>
      <input
        ref={inputRef}
        className={`${className} phone-national-input`}
        type="tel"
        inputMode="tel"
        value={nationalNumber}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d\s()-]/g, '')
          setNationalNumber(next)
          emit(country, next)
        }}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        aria-invalid={Boolean(touched && validationError)}
      />
      {touched && validationError && <span className="phone-field-error" role="alert">{validationError}</span>}
    </div>
  )
}
