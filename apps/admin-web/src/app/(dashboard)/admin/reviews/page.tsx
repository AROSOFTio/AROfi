import Link from 'next/link'
import { Mail, ShieldCheck, Wallet } from 'lucide-react'
import type { PlatformWithdrawalsResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'

type ComplianceReview = {
  id: string
  status?: string
  createdAt?: string
  tenant?: { id?: string; name?: string } | null
  business?: { id?: string; name?: string } | null
}

type EmailReview = {
  id: string
  status?: string
  createdAt?: string
  requestedEmail?: string | null
  currentEmail?: string | null
  tenant?: { id?: string; name?: string } | null
  user?: { email?: string | null; tenant?: { name?: string } | null } | null
}

async function safeFetch<T>(path: string): Promise<T | null> {
  try {
    return await fetchApi<T>(path)
  } catch {
    return null
  }
}

export const dynamic = 'force-dynamic'

export default async function ReviewsAndApprovalsPage() {
  const [compliance, emails, withdrawals] = await Promise.all([
    safeFetch<ComplianceReview[]>('/compliance/requests?status=PENDING_REVIEW'),
    safeFetch<EmailReview[]>('/auth/email-change-requests?status=PENDING'),
    safeFetch<PlatformWithdrawalsResponse>('/wallets/withdrawals/all'),
  ])

  const complianceItems = compliance ?? []
  const emailItems = emails ?? []
  const payoutItems = (withdrawals?.items ?? []).filter((item) => !['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED'].includes(item.status)).slice(0, 6)
  const payoutCount =
    (withdrawals?.summary.pendingReview ?? 0) +
    (withdrawals?.summary.pendingPayoutNumbers ?? 0) +
    (withdrawals?.summary.pendingNumberChanges ?? 0)
  const totalPending = complianceItems.length + emailItems.length + payoutCount

  return (
    <div className="review-center">
      <style>{`
        .review-center{display:grid;gap:14px;font-family:"Segoe UI",SegoeUI,Arial,sans-serif}
        .review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
        .review-head h1{margin:0;font-size:27px;line-height:1.12;letter-spacing:-.035em;font-weight:820;color:var(--text-1)}
        .review-head p{margin:5px 0 0;color:var(--text-3);font-size:13px}
        .review-total{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg-card);font-size:11.5px;color:var(--text-3)}
        .review-total strong{font-size:16px;color:${totalPending > 0 ? '#b45309' : '#15803d'}}
        .review-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;align-items:start}
        .review-card{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);overflow:hidden;min-width:0}
        .review-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 13px;border-bottom:1px solid var(--border)}
        .review-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--text-1)}
        .review-count{display:grid;place-items:center;min-width:26px;height:24px;padding:0 7px;border-radius:999px;background:var(--surface-muted);color:var(--text-1);font-size:11px;font-weight:800}
        .review-list{display:grid}
        .review-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-top:1px solid var(--border);text-decoration:none;color:var(--text-2)}
        .review-row:first-child{border-top:0}.review-row:hover{background:var(--surface-muted)}
        .review-row strong{display:block;color:var(--text-1);font-size:12px}
        .review-row small{display:block;margin-top:2px;color:var(--text-3);font-size:10.5px}
        .review-row em{font-style:normal;font-size:10.5px;font-weight:750;color:var(--text-2);white-space:nowrap}
        .review-empty{padding:30px 14px;text-align:center;color:var(--text-3);font-size:12px}
        .review-open{display:flex;justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--border)}
        @media(max-width:1000px){.review-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:650px){.review-head{flex-direction:column}.review-grid{grid-template-columns:1fr}}
      `}</style>

      <header className="review-head">
        <div>
          <h1>Reviews & Approvals</h1>
          <p>Compliance, account changes, payout numbers, and withdrawals in one queue.</p>
        </div>
        <div className="review-total"><strong>{totalPending}</strong><span>pending actions</span></div>
      </header>

      <section className="review-grid">
        <ReviewCard title="Compliance" icon={<ShieldCheck size={17} />} count={complianceItems.length} href="/admin/compliance-reviews">
          {complianceItems.length === 0 ? <Empty /> : complianceItems.slice(0, 6).map((item) => (
            <Link href="/admin/compliance-reviews" className="review-row" key={item.id}>
              <span><strong>{item.tenant?.name ?? item.business?.name ?? 'Business review'}</strong><small>{item.status ?? 'Pending review'}</small></span>
              <em>{item.createdAt ? formatDate(item.createdAt) : 'Pending'}</em>
            </Link>
          ))}
        </ReviewCard>

        <ReviewCard title="Email changes" icon={<Mail size={17} />} count={emailItems.length} href="/admin/email-approvals">
          {emailItems.length === 0 ? <Empty /> : emailItems.slice(0, 6).map((item) => (
            <Link href="/admin/email-approvals" className="review-row" key={item.id}>
              <span><strong>{item.tenant?.name ?? item.user?.tenant?.name ?? item.user?.email ?? 'Account change'}</strong><small>{item.requestedEmail ?? item.currentEmail ?? 'Email approval'}</small></span>
              <em>{item.createdAt ? formatDate(item.createdAt) : 'Pending'}</em>
            </Link>
          ))}
        </ReviewCard>

        <ReviewCard title="Payouts" icon={<Wallet size={17} />} count={payoutCount} href="/disbursements">
          {payoutItems.length === 0 ? <Empty /> : payoutItems.map((item) => (
            <Link href="/disbursements" className="review-row" key={item.id}>
              <span><strong>{item.tenant.name}</strong><small>{item.reference} · {item.status.toLowerCase().replace(/_/g, ' ')}</small></span>
              <em>{formatCurrency(item.amountUgx)}</em>
            </Link>
          ))}
        </ReviewCard>
      </section>
    </div>
  )
}

function ReviewCard({ title, icon, count, href, children }: { title: string; icon: React.ReactNode; count: number; href: string; children: React.ReactNode }) {
  return (
    <article className="review-card">
      <div className="review-card-head"><span className="review-title">{icon}{title}</span><span className="review-count">{count}</span></div>
      <div className="review-list">{children}</div>
      <div className="review-open"><Link href={href} className="btn btn-ghost btn-sm">Open queue</Link></div>
    </article>
  )
}

function Empty() {
  return <div className="review-empty">No pending items.</div>
}
