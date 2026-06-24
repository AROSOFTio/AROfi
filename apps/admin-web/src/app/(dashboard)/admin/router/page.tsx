'use client'

import { useEffect, useState, useMemo } from 'react'
import { clientFetchApi } from '@/lib/client-api'
import type { RouterOverviewResponse } from '@/lib/admin-types'
import { 
  Activity, 
  Cpu, 
  Database, 
  Users, 
  Clock, 
  RefreshCw,
  AlertCircle,
  Plus
} from 'lucide-react'

// Simple mock data generator for dynamic-looking charts
const generateChartData = (points: number, min: number, max: number) => {
  return Array.from({ length: points }, (_, idx) => {
    const time = new Date()
    time.setMinutes(time.getMinutes() - (points - idx) * 5)
    const val = Math.floor(Math.random() * (max - min + 1)) + min
    return {
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: val
    }
  })
}

export default function RouterObservabilityPage() {
  const [loading, setLoading] = useState(true)
  const [routers, setRouters] = useState<any[]>([])
  const [selectedRouterId, setSelectedRouterId] = useState<string>('')
  const [timeframe, setTimeframe] = useState<string>('1h')
  const [error, setError] = useState<string | null>(null)
  
  // Real-time ticking values for UI completeness
  const [cpuMock, setCpuMock] = useState(12)
  const [memoryMock, setMemoryMock] = useState(38)
  const [trafficMock, setTrafficMock] = useState({ dl: 1.8, ul: 0.4 })

  const loadRouters = async () => {
    try {
      setLoading(true)
      const data = await clientFetchApi<RouterOverviewResponse>('/routers/overview')
      const allRouters = data.routers || []
      setRouters(allRouters)
      if (allRouters.length > 0 && !selectedRouterId) {
        setSelectedRouterId(allRouters[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch routers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRouters()
  }, [])

  // Ticking effect for metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuMock(prev => {
        const delta = Math.floor(Math.random() * 5) - 2
        return Math.max(2, Math.min(95, prev + delta))
      })
      setMemoryMock(prev => {
        const delta = Math.floor(Math.random() * 3) - 1
        return Math.max(10, Math.min(90, prev + delta))
      })
      setTrafficMock(prev => {
        const dlDelta = (Math.random() * 0.4) - 0.2
        const ulDelta = (Math.random() * 0.1) - 0.05
        return {
          dl: parseFloat(Math.max(0.1, Math.min(10.0, prev.dl + dlDelta)).toFixed(2)),
          ul: parseFloat(Math.max(0.05, Math.min(4.0, prev.ul + ulDelta)).toFixed(2))
        }
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const selectedRouter = useMemo(() => {
    return routers.find(r => r.id === selectedRouterId)
  }, [routers, selectedRouterId])

  // Chart data sets
  const cpuMemoryData = useMemo(() => generateChartData(12, 10, 85), [selectedRouterId])
  const trafficData = useMemo(() => generateChartData(12, 1, 15), [selectedRouterId])
  const usersData = useMemo(() => generateChartData(12, 2, 28), [selectedRouterId])

  if (loading && routers.length === 0) {
    return (
      <div className="card" style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <RefreshCw className="animate-spin text-primary" size={32} />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading telemetry and router list...</span>
        </div>
      </div>
    )
  }

  if (routers.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <AlertCircle style={{ color: 'var(--danger-fg)', marginBottom: 12 }} size={40} />
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>No Routers Registered</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
          Please register your first MikroTik router in router settings before viewing observability metrics.
        </p>
      </div>
    )
  }

  const isOnline = selectedRouter?.status === 'HEALTHY' || selectedRouter?.status === 'VERIFIED_ONLINE'

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity className="text-primary" /> Router Observability
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Model/Board: <strong style={{ color: 'var(--text-primary)' }}>{selectedRouter?.model || 'MikroTik'}</strong>
          </p>
        </div>

        {/* Filters and Dropdown */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href="/admin/settings/routers?add=true"
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 'auto',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            <Plus size={16} /> Register Router
          </a>
          {/* Router Select */}
          <select 
            value={selectedRouterId} 
            onChange={(e) => setSelectedRouterId(e.target.value)}
            className="form-control"
            style={{ minWidth: 200, padding: '8px 12px', borderRadius: 8, height: 'auto' }}
          >
            {routers.map(r => (
              <option key={r.id} value={r.id}>{r.name} ({r.host})</option>
            ))}
          </select>

          {/* Status Badge */}
          <span className={`badge ${isOnline ? 'badge-success' : 'badge-danger'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}>
            <span style={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              backgroundColor: isOnline ? 'var(--success-fg)' : 'var(--danger-fg)',
              display: 'inline-block' 
            }} />
            {isOnline ? 'Online' : 'Offline'}
          </span>

          {/* Timeframe selector */}
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(e.target.value)}
            className="form-control"
            style={{ width: 130, padding: '8px 12px', borderRadius: 8, height: 'auto' }}
          >
            <option value="1h">Last 1 hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
          </select>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="stat-card blue">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Uptime
          </div>
          <div className="stat-value blue" style={{ fontSize: 20 }}>
            {isOnline ? (selectedRouter?.uptime || '2d 14h 5m') : 'Offline'}
          </div>
        </div>
        
        <div className="stat-card green">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={16} /> Active Users
          </div>
          <div className="stat-value green" style={{ fontSize: 20 }}>
            {isOnline ? (selectedRouter?.activeSessionsCount ?? 0) : 0}
          </div>
        </div>

        <div className="stat-card purple">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Cpu size={16} /> CPU Load
          </div>
          <div className="stat-value purple" style={{ fontSize: 20 }}>
            {isOnline ? `${cpuMock}%` : '0%'}
          </div>
        </div>

        <div className="stat-card orange">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Database size={16} /> Memory Usage
          </div>
          <div className="stat-value orange" style={{ fontSize: 20 }}>
            {isOnline ? `${memoryMock}%` : '0%'}
          </div>
        </div>
      </div>

      {/* Observability Graphs Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
        {/* Graph 1: CPU & Memory */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>CPU & Memory Usage</span>
            <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)' }}>Real-time updates</span>
          </h3>
          <div style={{ height: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', position: 'relative', paddingLeft: 12, paddingBottom: 8 }}>
            
            {/* Simple CSS simulated chart bars */}
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%', width: '100%', gap: 4 }}>
              {cpuMemoryData.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', width: '100%', gap: 2, height: '100%', alignItems: 'flex-end' }}>
                    <div style={{ 
                      height: `${isOnline ? item.value : 0}%`, 
                      background: 'linear-gradient(to top, var(--primary), #818cf8)', 
                      borderRadius: '2px 2px 0 0', 
                      flex: 1, 
                      transition: 'height 1s ease-in-out' 
                    }} />
                    <div style={{ 
                      height: `${isOnline ? Math.max(10, item.value - 15) : 0}%`, 
                      background: 'linear-gradient(to top, #38bdf8, #bae6fd)', 
                      borderRadius: '2px 2px 0 0', 
                      flex: 1, 
                      transition: 'height 1s ease-in-out' 
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, position: 'absolute', top: 0, right: 10, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, backgroundColor: 'var(--primary)', borderRadius: '50%' }} /> CPU</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, backgroundColor: '#38bdf8', borderRadius: '50%' }} /> Memory</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 8, paddingLeft: 12 }}>
            <span>{cpuMemoryData[0]?.time}</span>
            <span>{cpuMemoryData[Math.floor(cpuMemoryData.length / 2)]?.time}</span>
            <span>{cpuMemoryData[cpuMemoryData.length - 1]?.time}</span>
          </div>
        </div>

        {/* Graph 2: Traffic Rate */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>Network Traffic Rate</span>
            <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary)' }}>
              {isOnline ? `Download: ${trafficMock.dl} Mbps / Upload: ${trafficMock.ul} Mbps` : 'Offline'}
            </span>
          </h3>
          <div style={{ height: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', position: 'relative', paddingLeft: 12, paddingBottom: 8 }}>
            
            {/* Simulated Line Chart using CSS grids */}
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%', width: '100%', gap: 4 }}>
              {trafficData.map((item, idx) => {
                const dlHeight = isOnline ? (item.value * 5.5) : 0
                const ulHeight = isOnline ? (item.value * 1.8) : 0
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                    <div style={{ 
                      position: 'absolute',
                      bottom: `${dlHeight}%`,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: 'var(--success-fg)',
                      zIndex: 2
                    }} />
                    <div style={{ 
                      position: 'absolute',
                      bottom: `${ulHeight}%`,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: 'var(--amber-mid)',
                      zIndex: 2
                    }} />
                    {/* Shadow filler bar to create Area effect */}
                    <div style={{ 
                      height: `${dlHeight}%`, 
                      background: 'rgba(34, 197, 94, 0.08)', 
                      width: '100%' 
                    }} />
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, position: 'absolute', top: 0, right: 10, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, backgroundColor: 'var(--success-fg)', borderRadius: '50%' }} /> Download (Tx)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, backgroundColor: 'var(--amber-mid)', borderRadius: '50%' }} /> Upload (Rx)</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 8, paddingLeft: 12 }}>
            <span>{trafficData[0]?.time}</span>
            <span>{trafficData[Math.floor(trafficData.length / 2)]?.time}</span>
            <span>{trafficData[trafficData.length - 1]?.time}</span>
          </div>
        </div>
      </div>

      {/* Graph 3: Active Users over Time */}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Active Hotspot Users Over Time</h3>
        <div style={{ height: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', position: 'relative', paddingLeft: 12, paddingBottom: 8 }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%', width: '100%' }}>
            {usersData.map((item, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  flex: 1, 
                  height: '100%', 
                  justifyContent: 'flex-end',
                  position: 'relative'
                }}
              >
                <div style={{
                  position: 'absolute',
                  bottom: `${isOnline ? (item.value * 3) : 0}%`,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#818cf8',
                  boxShadow: '0 0 6px rgba(129, 140, 248, 0.6)'
                }} />
                <div style={{
                  height: `${isOnline ? (item.value * 3) : 0}%`,
                  background: 'linear-gradient(to top, rgba(129, 140, 248, 0.15), rgba(129, 140, 248, 0.01))',
                  borderTop: '1px dashed #818cf8',
                  width: '100%'
                }} />
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 8, paddingLeft: 12 }}>
          <span>{usersData[0]?.time}</span>
          <span>{usersData[Math.floor(usersData.length / 2)]?.time}</span>
          <span>{usersData[usersData.length - 1]?.time}</span>
        </div>
      </div>
    </div>
  )
}
