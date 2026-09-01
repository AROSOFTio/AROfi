import Link from 'next/link'
import {
  Bell,
  CreditCard,
  FileText,
  Globe,
  Lock,
  Router,
  Settings,
  Share2,
  ShieldCheck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { formatCurrency } from '@/lib/format'

type PlatformSettingsSnapshot = {
  paymentGateway?: string
  supportPhone?: string | null
  supportEmail?: string | null
  supportUrl?: string | null
  mobileMoneyFeePercent?: number
  voucherFeePercent?: number
  proMobileMoneyFeePercent?: number
  proVoucherFeePercent?: number
  proSubscriptionPriceUgx?: number
  minimumWithdrawalUgx?: number
  requireWithdrawalApproval?: boolean
  instantWithdrawalsEnabled?: boolean
  routerAutoConnectEnabled?: boolean
  freeRouterLimit?: number
  proRouterLimit?: number
  auditLoggingEnabled?: boolean
  gatewayReadiness?: {
    gatewayLabel?: string
    productionReady?: boolean
    webhookReady?: boolean
    missingConfiguration?: string[]
  }
}

async function loadSettings() {
  try {
    return await fetchApi<PlatformSettingsSnapshot>('/system/settings')
  } catch {
    return null
  }
}

const sections = [
  {
    title: 'General & Support',
    description: 'Platform identity and customer support contacts.',
    href: '/settings?tab=Business%20Profile',
    icon: <Globe size={18} />,
  },
  {
    title: 'Payments & Pricing',
    description: 'Gateway selection, plan pricing, service fees, and networks.',
    href: '/settings?tab=Payment%20%26%20Fees',
    icon: <CreditCard size={18} />,
  },
  {
    title: 'Payment API Connectors',
    description: 'Enterprise businesses can connect their own mobile-money or payment REST API.',
    href: '/admin/settings/payment-connectors',
    icon: <Globe size={18} />,
  },
  {
    title: 'Withdrawals & Risk',
    description: 'Payout limits, approval rules, fees, and safety controls.',
    href: '/settings?tab=Withdrawals',
    icon: <Wallet size={18} />,
  },
  {
    title: 'Network & Portal',
    description: 'Router limits, auto-connect rules, and portal defaults.',
    href: '/settings?tab=Router%20%26%20Portal',
    icon: <Router size={18} />,
  },
  {
    title: 'Voucher Defaults',
    description: 'Default print style and voucher presentation.',
    href: '/settings?tab=Voucher%20Printing',
    icon: <FileText size={18} />,
  },
  {
    title: 'Security & Audit',
    description: 'Audit logging, account protection, and compliance controls.',
    href: '/settings?tab=Security',
    icon: <ShieldCheck size={18} />,
  },
  {
    title: 'Team & Roles',
    description: 'Platform staff, access roles, and account permissions.',
    href: '/users?tab=staff',
    icon: <Users size={18} />,
  },
  {
    title: 'Plans & Limits',
    description: 'Feature limits, usage thresholds, and business entitlements.',
    href: '/feature-limits',
    icon: <Zap size={18} />,
  },
  {
    title: 'Alerts & Notifications',
    description: 'Operational alerts and platform notification delivery.',
    href: '/admin/notifications',
    icon: <Bell size={18} />,
  },
  {
    title: 'Referrals',
    description: 'Referral programme, partner rules, and commission settings.',
    href: '/admin/referrals',
    icon: <Share2 size={18} />,
  },
  {
    title: 'Content',
    description: 'Public website articles and platform announcements.',
    href: '/admin/blog',
    icon: <FileText size={18} />,
  },
  {
    title: 'Advanced Operations',
    description: 'Network diagnostics, remote access, and system tools.',
    href: '/admin/operations',
    icon: <Settings size={18} />,
  },
]

export const dynamic = 'force-dynamic'

export default async function PlatformSettingsCenterPage() {
  const settings = await loadSettings()
  const gatewayLabel = settings?.gatewayReadiness?.gatewayLabel ?? settings?.paymentGateway ?? 'Not selected'
  const gatewayReady = Boolean(settings?.gatewayReadiness?.productionReady)

  return (
    <div className="platform-settings-center">
      <style>{`
        .platform-settings-center{display:grid;gap:14px;font-family:"Segoe UI",SegoeUI,Arial,sans-serif}
        .psc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
        .psc-head h1{margin:0;font-size:27px;line-height:1.12;letter-spacing:-.035em;font-weight:820;color:var(--text-1)}
        .psc-head p{margin:5px 0 0;color:var(--text-3);font-size:13px}
        .psc-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .psc-summary-card{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);padding:13px;min-width:0}
        .psc-summary-card span{display:block;color:var(--text-3);font-size:9.5px;text-transform:uppercase;letter-spacing:.045em;font-weight:800}
        .psc-summary-card strong{display:block;margin-top:5px;color:var(--text-1);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .psc-summary-card small{display:block;margin-top:4px;color:var(--text-3);font-size:10.5px}
        .psc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
        .psc-card{display:flex;align-items:flex-start;gap:12px;min-height:112px;padding:14px;border:1px solid var(--border);border-radius:11px;background:var(--bg-card);text-decoration:none;color:inherit;transition:border-color .18s ease,transform .18s ease,box-shadow .18s ease}
        .psc-card:hover{border-color:rgba(37,99,235,.38);transform:translateY(-1px);box-shadow:0 5px 16px rgba(15,23,42,.06)}
        .psc-icon{display:grid;place-items:center;flex:0 0 auto;width:36px;height:36px;border-radius:10px;background:var(--surface-muted);color:var(--brand-fg,#2563eb)}
        .psc-card h2{margin:1px 0 0;font-size:13px;line-height:1.3;color:var(--text-1);font-weight:800}
        .psc-card p{margin:5px 0 0;color:var(--text-3);font-size:11.5px;line-height:1.45}
        .psc-card em{display:block;margin-top:9px;color:var(--brand-fg,#2563eb);font-size:11px;font-style:normal;font-weight:750}
        .psc-security-note{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-muted);color:var(--text-2);font-size:11.5px;line-height:1.5}
        .psc-security-note svg{flex:0 0 auto;margin-top:1px;color:var(--text-3)}
        @media(max-width:1050px){.psc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.psc-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:620px){.psc-head{flex-direction:column}.psc-grid,.psc-summary{grid-template-columns:1fr}.psc-card{min-height:auto}}
      `}</style>

      <header className="psc-head">
        <div>
          <h1>Platform Settings</h1>
          <p>One place for pricing, gateways, withdrawals, network rules, security, staff, and integrations.</p>
        </div>
        <Link href="/audit-logs" className="btn btn-ghost">Audit Trail</Link>
      </header>

      <section className="psc-summary">
        <Summary label="Active gateway" value={gatewayLabel} note={gatewayReady ? 'Production ready' : 'Setup or test required'} good={gatewayReady} />
        <Summary label="Starter fees" value={`${settings?.mobileMoneyFeePercent ?? 0}% MM · ${settings?.voucherFeePercent ?? 0}% voucher`} note="Default platform pricing" />
        <Summary label="Pro subscription" value={formatCurrency(settings?.proSubscriptionPriceUgx ?? 0)} note={`${settings?.proMobileMoneyFeePercent ?? 0}% MM · ${settings?.proVoucherFeePercent ?? 0}% voucher`} />
        <Summary label="Minimum withdrawal" value={formatCurrency(settings?.minimumWithdrawalUgx ?? 0)} note={settings?.requireWithdrawalApproval ? 'Approval enabled' : 'Automatic when eligible'} />
      </section>

      <section className="psc-grid">
        {sections.map((section) => (
          <Link href={section.href} className="psc-card" key={section.title}>
            <span className="psc-icon">{section.icon}</span>
            <span>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
              <em>Open settings →</em>
            </span>
          </Link>
        ))}
      </section>

      <div className="psc-security-note">
        <Lock size={16} />
        <span>Built-in platform gateway secrets remain in server environment variables. Enterprise Bring Your Own API credentials are encrypted server-side and are never returned to the browser after they are saved.</span>
      </div>
    </div>
  )
}

function Summary({ label, value, note, good }: { label: string; value: string; note: string; good?: boolean }) {
  return (
    <article className="psc-summary-card">
      <span>{label}</span>
      <strong style={good === undefined ? undefined : { color: good ? '#15803d' : '#b45309' }}>{value}</strong>
      <small>{note}</small>
    </article>
  )
}
