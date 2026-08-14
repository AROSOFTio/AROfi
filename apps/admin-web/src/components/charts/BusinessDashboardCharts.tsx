"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type SalesChannel = {
  name: string
  value: number
  color: string
}

type RevenuePoint = {
  date: string
  netEarningsUgx: number
  voucherGrossUgx: number
}

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return `${Math.round(value)}`
}

function dateLabel(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function BusinessSalesChannelChart({ channels }: { channels: SalesChannel[] }) {
  const visible = channels.filter((item) => item.value > 0)
  const total = visible.reduce((sum, item) => sum + item.value, 0)

  if (total <= 0) {
    return <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>No sales in this range.</div>
  }

  return (
    <div style={{ width: '100%', minHeight: 230 }}>
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie data={visible} dataKey="value" nameKey="name" cx="42%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
            {visible.map((item) => <Cell key={item.name} fill={item.color} />)}
          </Pie>
          <Tooltip formatter={(value) => [`UGX ${Number(value ?? 0).toLocaleString()}`, 'Sales']} />
          <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: 11, lineHeight: '24px' }} />
          <text x="42%" y="47%" textAnchor="middle" dominantBaseline="middle" fill="var(--text-3)" fontSize="11">Total</text>
          <text x="42%" y="56%" textAnchor="middle" dominantBaseline="middle" fill="var(--text-1)" fontSize="15" fontWeight="800">UGX {compact(total)}</text>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BusinessDailyEarningsChart({ data }: { data: RevenuePoint[] }) {
  if (!data?.length) {
    return <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>No daily sales data for this period.</div>
  }

  const rows = data.map((item) => ({ ...item, label: dateLabel(item.date) }))

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={rows} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => `UGX ${Number(value ?? 0).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="netEarningsUgx" name="Net Earnings" fill="var(--arofi-theme-accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line type="monotone" dataKey="voucherGrossUgx" name="Voucher Sales" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
      </BarChart>
    </ResponsiveContainer>
  )
}
