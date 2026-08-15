import { escapeCsvCell } from './csv'

describe('escapeCsvCell', () => {
  it('quotes normal values and doubles embedded quotes', () => {
    expect(escapeCsvCell('AroFi "Agent"')).toBe('"AroFi ""Agent"""')
    expect(escapeCsvCell(10000)).toBe('"10000"')
  })

  it.each([
    '=HYPERLINK("https://example.invalid","click")',
    '+1+1',
    '-2+3',
    '@SUM(1,2)',
    ' =1+1',
    '\t=1+1',
  ])('neutralizes spreadsheet formula-like text: %s', (value) => {
    expect(escapeCsvCell(value).startsWith('"\'')).toBe(true)
  })

  it('does not change the stored meaning of ordinary negative numeric values', () => {
    expect(escapeCsvCell(-500)).toBe('"-500"')
  })
})
