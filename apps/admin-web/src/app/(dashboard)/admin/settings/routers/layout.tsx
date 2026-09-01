import Link from 'next/link'
import { Network, Router } from 'lucide-react'

export default function RouterSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        className="card"
        style={{
          margin: 0,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--brand-soft)', color: 'var(--brand)' }}>
            <Router size={17} />
          </span>
          <div>
            <strong style={{ fontSize: 13 }}>Network hardware</strong>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>MikroTik automation plus Omada, UniFi, Reyee and standards-based RADIUS.</div>
          </div>
        </div>
        <Link href="/admin/settings/router-compatibility" className="btn btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Network size={15} /> Router Compatibility
        </Link>
      </div>
      {children}
    </div>
  )
}
