import { SupportTicketResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function SupportPage() {
  const data = await fetchApi<SupportTicketResponse>('/system/support-tickets')
  const tickets = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Support</h1>
          <p className="page-subtitle">Ticket operations for customer incidents, payment escalations, and network issue tracking.</p>
        </div>
        <button className="btn btn-primary">+ New Ticket</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total', value: `${data?.summary.totalTickets ?? 0}`, color: 'blue' },
          { label: 'Open', value: `${data?.summary.open ?? 0}`, color: 'amber' },
          { label: 'In Progress', value: `${data?.summary.inProgress ?? 0}`, color: 'purple' },
          { label: 'Critical', value: `${data?.summary.critical ?? 0}`, color: 'green' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {!data && (
        <div className="card">
          <div className="empty-state">
            <p>Support ticket data is unavailable right now. Confirm API connectivity and retry.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Ticket Queue</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Tenant</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Messages</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>No support tickets are currently logged.</p>
                    </div>
                  </td>
                </tr>
              )}
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ticket.reference}</td>
                  <td>{ticket.tenant?.name ?? 'N/A'}</td>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ticket.subject}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ticket.category}</div>
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(ticket.priority)}>{ticket.priority.toLowerCase()}</span>
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(ticket.status)}>{ticket.status.toLowerCase()}</span>
                  </td>
                  <td>{ticket.assignedTo ?? 'Unassigned'}</td>
                  <td>{ticket._count.messages}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(ticket.latestResponseAt ?? ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Conversation Snippets</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Author</th>
                <th>Message</th>
                <th>Visibility</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {tickets.flatMap((ticket) => ticket.messages.slice(-1).map((message) => ({ ticket, message }))).length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No support message activity yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {tickets.flatMap((ticket) =>
                ticket.messages.slice(-1).map((message) => (
                  <tr key={message.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ticket.reference}</td>
                    <td>
                      <div>{message.authorName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{message.authorRole}</div>
                    </td>
                    <td>{message.body}</td>
                    <td>
                      <span className={getStatusBadgeClass(message.isInternal ? 'WARNING' : 'INFO')}>
                        {message.isInternal ? 'internal' : 'customer'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDate(message.createdAt)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
