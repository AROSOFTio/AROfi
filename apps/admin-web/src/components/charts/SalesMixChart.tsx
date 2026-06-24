"use client"

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

function fmtK(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

const COLORS = ["#2563EB", "#16a34a", "#f59e0b", "#8b5cf6"]

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{
      background: "var(--bg-card, #fff)",
      border: "1px solid var(--border, #e4e4e7)",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 12,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    }}>
      <p style={{ fontWeight: 600, color: d.payload.fill }}>{d.name}</p>
      <p style={{ color: "var(--text-2, #5f6673)" }}>UGX {fmtK(d.value)}</p>
      <p style={{ color: "var(--text-3, #9aa3b2)" }}>{d.payload.pct}% of total</p>
    </div>
  )
}

type Props = {
  mobileMoneyUgx: number
  voucherUgx: number
}

export function SalesMixChart({ mobileMoneyUgx, voucherUgx }: Props) {
  const total = mobileMoneyUgx + voucherUgx
  if (total === 0) {
    return (
      <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3, #9aa3b2)", fontSize: 13 }}>
        No sales data yet
      </div>
    )
  }

  const data = [
    { name: "Mobile Money", value: mobileMoneyUgx, pct: Math.round((mobileMoneyUgx / total) * 100) },
    { name: "Vouchers", value: voucherUgx, pct: Math.round((voucherUgx / total) * 100) },
  ].filter((d) => d.value > 0)

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={52}
          outerRadius={72}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span style={{ color: "var(--text-2, #5f6673)" }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
