import Link from 'next/link'
import { Activity, Building2, CreditCard, LifeBuoy, Router, Search, Users } from 'lucide-react'
import type {
  BillingOverviewResponse,
  PaymentOverviewResponse,
  RouterOverviewResponse,
  SessionOverviewResponse,
  SystemOverviewResponse,
  TenantOverviewResponse,
} from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'

type SearchResult = {
  key: string
  kind: string
  title: string
  subtitle: string
  status?: string
  href: string
}

async function safeFetch<T>(path: string): Promise<T | null> {
  try {
    return await fetchApi<T>(path)
  } catch {
    return null
  }
}

export const dynamic = 'force-dynamic'

export default async function PlatformOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const query = (await searchParams)?.q?.trim() ?? ''
  const normalized = query.toLowerCase()
  const [tenants, routers, billing, payments, sessions, system] = await Promise.all([
    safeFetch<TenantOverviewResponse>('/tenants'),
    safeFetch<RouterOverviewResponse>('/routers/overview'),
    safeFetch<BillingOverviewResponse>('/billing/overview'),
    safeFetch<PaymentOverviewResponse>('/payments/overview'),
    safeFetch<SessionOverviewResponse>('/sessions/overview'),
    safeFetch<SystemOverviewResponse>('/system/overview'),
  ])

  const results: SearchResult[] = []
  if (normalized) {
    for (const business of tenants?.items ?? []) {
      const haystack = [business.name, business.domain, business.supportPhone, business.supportEmail, business.id].filter(Boolean).join(' ').toLowerCase()
      if (haystack.includes(normalized)) {
        results.push({
          key: `business-${business.id}`,
          kind: 'Business',
          title: business.name,
          subtitle: business.supportPhone ?? business.supportEmail ?? business.domain ?? 'Business workspace',
          status: business.status?.accountActive === false ? 'Suspended' : 'Active',
          href: `/businesses/${business.id}`,
        })
      }
    }

    for (const router of routers?.routers ?? []) {
      const haystack = [router.name, router.identity, router.host, router.locationText, router.siteLabel, router.tenant.name, router.id].filter(Boolean).join(' ').toLowerCase()
      if (haystack.includes(normalized)) {
        results.push({
          key: `router-${router.id}`,
          kind: 'Router',
          title: router.name,
          subtitle: `${router.tenant.name} · ${router.locationText ?? router.siteLabel ?? router.host}`,
          status: router.liveState ?? router.status,
          href: `/admin/settings/routers?routerId=${encodeURIComponent(router.id)}`,
        })
      }
    }

    for (const payment of payments?.payments ?? []) {
      const haystack = [payment.externalReference, payment.providerReference, payment.phoneNumber, payment.customerReference, payment.tenant.name, payment.package.name, payment.id].filter(Boolean).join(' ').toLowerCase()
      if (haystack.includes(normalized)) {
        results.push({
          key: `payment-${payment.id}`,
          kind: 'Payment',
          title: payment.externalReference,
          subtitle: `${payment.tenant.name} · ${payment.phoneNumber} · ${formatCurrency(payment.amountUgx)}`,
          status: payment.status,
          href: `/payments?search=${encodeURIComponent(payment.externalReference)}`,
        })
      }
    }

    for (const transaction of billing?.recentTransactions ?? []) {
      const haystack = [transaction.externalReference, transaction.customerReference, transaction.voucher?.code, transaction.tenant.name, transaction.package?.name, transaction.id].filter(Boolean).join(' ').toLowerCase()
      if (haystack.includes(normalized)) {
        results.push({
          key: `transaction-${transaction.id}`,
          kind: 'Transaction',
          title: transaction.externalReference ?? transaction.voucher?.code ?? transaction.id,
          subtitle: `${transaction.tenant.name} · ${transaction.channel.replace(/_/g, ' ')} · ${formatCurrency(transaction.grossAmountUgx)}`,
          status: transaction.status,
          href: `/transactions?search=${encodeURIComponent(transaction.externalReference ?? transaction.id)}`,
        })
      }
    }

    for (const session of [...(sessions?.activeSessions ?? []), ...(sessions?.recentSessions ?? [])]) {
      const haystack = [session.username, session.phoneNumber, session.customerReference, session.macAddress, session.ipAddress, session.router?.name, session.tenant.name, session.id].filter(Boolean).join(' ').toLowerCase()
      if (haystack.includes(normalized)) {
        results.push({
          key: `session-${session.id}`,
          kind: 'Session',
          title: session.phoneNumber ?? session.username ?? session.macAddress ?? 'Customer session',
          subtitle: `${session.tenant.name} · ${session.router?.name ?? 'Unknown router'} · ${session.packageName}`,
          status: session.status,
          href: `/sessions?search=${encodeURIComponent(session.phoneNumber ?? session.username ?? session.id)}`,
        })
      }
    }

    for (const ticket of system?.support.items ?? []) {
      const haystack = [ticket.reference, ticket.subject, ticket.phoneNumber, ticket.email, ticket.tenant?.name, ticket.category, ticket.id].filter(Boolean).join(' ').toLowerCase()
      if (haystack.includes(normalized)) {
        results.push({
          key: `ticket-${ticket.id}`,
          kind: 'Support ticket',
          title: `${ticket.reference} · ${ticket.subject}`,
          subtitle: `${ticket.tenant?.name ?? 'Platform'} · ${ticket.category}`,
          status: ticket.status,
          href: `/support?search=${encodeURIComponent(ticket.reference)}`,
        })
      }
    }
  }

  const uniqueResults = Array.from(new Map(results.map((item) => [item.key, item])).values()).slice(0, 40)
  const offlineRouters = (routers?.routers ?? []).filter((item) => item.liveState === 'OFFLINE' || item.liveState === 'STALE').length
  const failedPayments = payments?.summary.failedPayments ?? 0
  const rejectedAuth = sessions?.summary.rejectedAuthToday ?? 0
  const openTickets = system?.support.summary.open ?? 0

  return (
    <div className="operations-center">
      <style>{`
        .operations-center{display:grid;gap:14px;font-family:"Segoe UI",SegoeUI,Arial,sans-serif}
        .ops-head h1{margin:0;font-size:27px;line-height:1.12;letter-spacing:-.035em;font-weight:820;color:var(--text-1)}
        .ops-head p{margin:5px 0 0;color:var(--text-3);font-size:13px}
        .ops-search{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid var(--border);border-radius:11px;background:var(--bg-card)}
        .ops-search svg{margin-left:4px;color:var(--text-3);flex:0 0 auto}
        .ops-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text-1);font:inherit;font-size:13px;padding:4px}
        .ops-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .ops-status-card{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);text-decoration:none;color:inherit}
        .ops-status-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--surface-muted);color:var(--brand-fg,#2563eb);flex:0 0 auto}
        .ops-status-card span{display:block;color:var(--text-3);font-size:10.5px}
        .ops-status-card strong{display:block;margin-top:2px;color:var(--text-1);font-size:18px}
        .ops-results{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);overflow:hidden}
        .ops-results-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)}
        .ops-results-head strong{font-size:13px;color:var(--text-1)}
        .ops-results-head span{font-size:11px;color:var(--text-3)}
        .ops-result{display:grid;grid-template-columns:100px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 14px;border-top:1px solid var(--border);text-decoration:none;color:inherit}
        .ops-result:first-child{border-top:0}.ops-result:hover{background:var(--surface-muted)}
        .ops-kind{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-fg,#2563eb)}
        .ops-result strong{display:block;font-size:12.5px;color:var(--text-1)}
        .ops-result small{display:block;margin-top:3px;color:var(--text-3);font-size:10.5px}
        .ops-result em{font-size:10.5px;font-style:normal;font-weight:750;color:var(--text-2);white-space:nowrap}
        .ops-empty{padding:38px 16px;text-align:center;color:var(--text-3);font-size:12.5px}
        .ops-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .ops-quick-card{display:block;padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);text-decoration:none;color:inherit}
        .ops-quick-card strong{display:block;color:var(--text-1);font-size:13px}.ops-quick-card span{display:block;margin-top:4px;color:var(--text-3);font-size:11.5px;line-height:1.4}
        @media(max-width:900px){.ops-status{grid-template-columns:repeat(2,minmax(0,1fr))}.ops-quick{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){.ops-search{align-items:stretch;flex-wrap:wrap}.ops-search input{width:calc(100% - 36px)}.ops-search .btn{width:100%}.ops-result{grid-template-columns:1fr auto}.ops-kind{grid-column:1/-1}.ops-status,.ops-quick{grid-template-columns:1fr}}
      `}</style>

      <header className="ops-head">
        <h1>Troubleshooting Center</h1>
        <p>Find a business, router, payment, transaction, customer session, voucher reference, or support ticket.</p>
      </header>

      <form className="ops-search" method="get">
        <Search size={18} />
        <input name="q" defaultValue={query} placeholder="Phone, voucher, transaction, router, business, MAC address, or ticket" autoComplete="off" />
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      <section className="ops-status">
        <Status href="/admin/settings/routers" label="Router problems" value={offlineRouters} icon={<Router size={16} />} />
        <Status href="/payments" label="Failed payments" value={failedPayments} icon={<CreditCard size={16} />} />
        <Status href="/sessions" label="Rejected logins today" value={rejectedAuth} icon={<Activity size={16} />} />
        <Status href="/support" label="Open tickets" value={openTickets} icon={<LifeBuoy size={16} />} />
      </section>

      {query ? (
        <section className="ops-results">
          <div className="ops-results-head"><strong>Search results</strong><span>{uniqueResults.length} matches for “{query}”</span></div>
          {uniqueResults.length === 0 ? (
            <div className="ops-empty">No matching platform records were found in the current operational data.</div>
          ) : uniqueResults.map((item) => (
            <Link href={item.href} className="ops-result" key={item.key}>
              <span className="ops-kind">{item.kind}</span>
              <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
              <em>{item.status?.toLowerCase().replace(/_/g, ' ') ?? 'Open'}</em>
            </Link>
          ))}
        </section>
      ) : (
        <section className="ops-quick">
          <Quick href="/payments" title="Payment diagnosis" text="Review payment status, provider references, callbacks, and activation results." />
          <Quick href="/admin/router" title="Network diagnosis" text="Review router heartbeat, RADIUS signals, outages, sessions, and compensation." />
          <Quick href="/support" title="Support context" text="Open tickets and connect the customer report to its payment or network record." />
          <Quick href="/transactions" title="Transaction lookup" text={`Review recent billing records. Last refresh ${formatDate(new Date().toISOString())}.`} />
          <Quick href="/sessions" title="Customer sessions" text="Search active and recent sessions by phone, username, MAC address, or router." />
          <Quick href="/businesses" title="Business workspace" text="Open a business to review sales, payments, routers, customers, and support." />
        </section>
      )}
    </div>
  )
}

function Status({ href, label, value, icon }: { href: string; label: string; value: number; icon: React.ReactNode }) {
  return (
    <Link href={href} className="ops-status-card">
      <span className="ops-status-icon">{icon}</span>
      <span><span>{label}</span><strong>{value}</strong></span>
    </Link>
  )
}

function Quick({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} className="ops-quick-card"><strong>{title}</strong><span>{text}</span></Link>
}
