export default function DashboardLoading() {
  return (
    <div aria-label="Loading page" aria-live="polite" style={{ padding: '18px 20px' }}>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          zIndex: 2000,
          overflow: 'hidden',
          background: 'rgba(37, 99, 235, 0.12)',
        }}
      >
        <div className="arofi-route-progress" />
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div className="arofi-loading-block" style={{ width: 'min(360px, 72%)', height: 30 }} />
        <div className="arofi-loading-block" style={{ width: 'min(560px, 92%)', height: 15 }} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
            marginTop: 8,
          }}
        >
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="arofi-loading-block" style={{ height: 108, borderRadius: 12 }} />
          ))}
        </div>
        <div className="arofi-loading-block" style={{ height: 260, borderRadius: 12, marginTop: 4 }} />
      </div>

      <style>{`
        .arofi-loading-block {
          background: linear-gradient(90deg, rgba(148,163,184,.13), rgba(148,163,184,.25), rgba(148,163,184,.13));
          background-size: 220% 100%;
          border: 1px solid rgba(148,163,184,.14);
          border-radius: 8px;
          animation: arofi-loading-shimmer 1.15s ease-in-out infinite;
        }
        .arofi-route-progress {
          width: 42%;
          height: 100%;
          background: #2563eb;
          animation: arofi-route-progress 1s ease-in-out infinite;
        }
        @keyframes arofi-loading-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes arofi-route-progress {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(340%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .arofi-loading-block,
          .arofi-route-progress { animation: none; }
        }
      `}</style>
    </div>
  )
}
