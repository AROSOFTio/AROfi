"use client"

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

type RouterUsage = {
  id: string
  name: string
  activeSessions: number
  totalSessions: number
  totalDataMb: number
}

function fmtMb(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(0)} MB`
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: "var(--bg-card, #fff)",
      border: "1px solid var(--border, #e4e4e7)",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 12,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-1, #050505)" }}>{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ color: entry.color, marginBottom: 2 }}>
          {entry.name}: <strong>{entry.name === "Data Used" ? fmtMb(entry.value) : entry.value}</strong>
        </div>
      ))}
    </div>
  )
}

export function RouterUsageChart({ data }: { data: RouterUsage[] }) {
  if (!data?.length) {
    return (
      <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3, #9aa3b2)", fontSize: 13 }}>
        No router usage data
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => b.totalDataMb - a.totalDataMb).slice(0, 8)

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={sorted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={24}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e4e4e7)" strokeOpacity={0.5} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--text-3, #9aa3b2)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={fmtMb}
          tick={{ fontSize: 11, fill: "var(--text-3, #9aa3b2)" }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="totalDataMb" name="Data Used" radius={[4, 4, 0, 0]}>
          {sorted.map((_, index) => (
            <Cell key={index} fill={index === 0 ? "#155DFC" : `hsl(219, 80%, ${55 + index * 5}%)`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
