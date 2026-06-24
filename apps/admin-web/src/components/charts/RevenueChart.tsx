"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type ChartPoint = {
  date: string
  grossSalesUgx: number
  platformFeesUgx: number
  netEarningsUgx: number
  mobileMoneyGrossUgx: number
  voucherGrossUgx: number
}

function fmtK(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: "var(--bg-card, #fff)",
      border: "1px solid var(--border, #e4e4e7)",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 12,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    }}>
      <p style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-1, #050505)" }}>{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: entry.color, marginBottom: 2 }}>
          <span>{entry.name}</span>
          <span style={{ fontWeight: 600 }}>UGX {fmtK(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function RevenueChart({ data }: { data: ChartPoint[] }) {
  if (!data?.length) {
    return (
      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3, #9aa3b2)", fontSize: 13 }}>
        No revenue data for this period
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    date: fmtDate(d.date),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradFee" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e4e4e7)" strokeOpacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--text-3, #9aa3b2)" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={fmtK}
          tick={{ fontSize: 11, fill: "var(--text-3, #9aa3b2)" }}
          tickLine={false}
          axisLine={false}
          width={46}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value) => <span style={{ color: "var(--text-2, #5f6673)" }}>{value}</span>}
        />
        <Area type="monotone" dataKey="grossSalesUgx" name="Gross Sales" stroke="#2563EB" fill="url(#gradGross)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="netEarningsUgx" name="Net Earnings" stroke="#16a34a" fill="url(#gradNet)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="platformFeesUgx" name="Platform Fees" stroke="#f59e0b" fill="url(#gradFee)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
