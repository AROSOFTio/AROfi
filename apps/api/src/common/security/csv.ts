const SPREADSHEET_FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/
const LEADING_CONTROL_CHARACTER = /^[\t\r\n]/

/**
 * Encode one CSV cell and neutralize spreadsheet formula injection.
 *
 * Merely quoting a CSV value does NOT stop Excel/Sheets from evaluating a
 * cell beginning with =, +, -, or @. Prefixing a user-controlled formula-like
 * string with a single quote makes spreadsheet applications treat it as text.
 * The quote is part of the CSV value and does not alter the stored database
 * value.
 */
export function escapeCsvCell(value: string | number | null | undefined) {
  let raw = value == null ? '' : String(value)

  if (
    typeof value === 'string' &&
    (SPREADSHEET_FORMULA_PREFIX.test(raw) || LEADING_CONTROL_CHARACTER.test(raw))
  ) {
    raw = `'${raw}`
  }

  return `"${raw.replace(/"/g, '""')}"`
}
