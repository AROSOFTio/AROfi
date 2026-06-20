'use client'

const STEPS = [
  {
    key: 'script',
    label: 'Script generated',
    description: 'Run the one-line command in WinBox Terminal',
    done: (s: string) => !['PENDING', 'NOT_STARTED'].includes(s),
  },
  {
    key: 'heartbeat',
    label: 'Router heartbeat received',
    description: 'Router is online and calling home',
    done: (s: string) =>
      !['SCRIPT_GENERATED', 'WAITING_FOR_ROUTER', 'PENDING', 'NOT_STARTED'].includes(s),
  },
  {
    key: 'radius',
    label: 'First RADIUS packet seen',
    description: 'Connect a device and complete a purchase to verify',
    done: (s: string) =>
      ['RADIUS_SEEN', 'ACCOUNTING_SEEN', 'VERIFIED_ONLINE'].includes(s),
  },
  {
    key: 'verified',
    label: 'Router HEALTHY',
    description: 'All systems go — sessions and plans are live',
    done: (s: string) => s === 'VERIFIED_ONLINE',
  },
]

export function RouterOnboardingSteps({ onboardingStatus }: { onboardingStatus: string }) {
  if (onboardingStatus === 'VERIFIED_ONLINE') return null

  return (
    <div
      style={{
        border: '1px solid var(--blue-mid, #3b82f6)',
        background: 'var(--blue-bg, #eff6ff)',
        borderRadius: 8,
        padding: '12px 16px',
        marginTop: 10,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--blue-fg, #1d4ed8)',
          marginBottom: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Setup progress
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STEPS.map((step, i) => {
          const done = step.done(onboardingStatus)
          const active = !done && (i === 0 || STEPS[i - 1].done(onboardingStatus))
          return (
            <li key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span
                style={{
                  marginTop: 1,
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  background: done
                    ? 'var(--success-fg, #16a34a)'
                    : active
                      ? 'var(--blue-fg, #1d4ed8)'
                      : 'var(--border, #e2e8f0)',
                  color: done || active ? '#fff' : 'var(--text-3, #94a3b8)',
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    margin: 0,
                    color: done
                      ? 'var(--text-3, #94a3b8)'
                      : active
                        ? 'var(--text-1, #0f172a)'
                        : 'var(--text-3, #94a3b8)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {step.label}
                </p>
                {active && (
                  <p style={{ fontSize: 12, color: 'var(--blue-fg, #1d4ed8)', margin: '2px 0 0' }}>
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
