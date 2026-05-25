'use client'

import { useMemo, useState } from 'react'
import type { UsersOverviewResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, formatMegabytes, getStatusBadgeClass } from '@/lib/format'

type UserFormState = {
  firstName: string
  lastName: string
  email: string
  password: string
  roleName: string
}

const preferredTenantRoles = ['WifiAdmin', 'VoucherAgent', 'FinanceManager', 'ReadOnlySupport', 'Support', 'NetworkOperator', 'Finance', 'VendorAdmin']

type CustomerDirectory = {
  summary: {
    totalCustomers: number
    activeCustomers: number
    totalSpentUgx: number
  }
  items: Array<{
    id: string
    phoneNumber: string
    customerReference?: string | null
    activePackage?: { id: string; name: string; code: string } | null
    lastPayment?: { id: string; amountUgx: number; status: string; network: string; createdAt: string } | null
    totalSpentUgx: number
    dataUsedMb: number
    status: 'active' | 'expired'
    lastSeen?: string | null
  }>
}

export default function UsersManager({ initialData }: { initialData: UsersOverviewResponse | null }) {
  const [data, setData] = useState(initialData)
  const [activeTab, setActiveTab] = useState<'staff' | 'customers'>('staff')
  const [customers, setCustomers] = useState<CustomerDirectory | null>(null)
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processText, setProcessText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const roles = useMemo(() => {
    const availableRoles = data?.roles ?? []
    return [...availableRoles].sort((a, b) => {
      const aIndex = preferredTenantRoles.indexOf(a.name)
      const bIndex = preferredTenantRoles.indexOf(b.name)
      if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
  }, [data?.roles])
  const [form, setForm] = useState<UserFormState>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    roleName: 'WifiAdmin',
  })

  const users = data?.users ?? []

  async function openCustomers() {
    setActiveTab('customers')
    if (customers || isLoadingCustomers) return
    setIsLoadingCustomers(true)
    setError(null)
    try {
      setCustomers(await clientFetchApi<CustomerDirectory>('/users/customers'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load customers')
    } finally {
      setIsLoadingCustomers(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setProcessText('Creating staff user and assigning role permissions.')
    setError(null)

    try {
      const createdUser = await clientPostApi<UsersOverviewResponse['users'][number]>('/users', form)
      setProcessText('Refreshing user directory.')
      setData((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          users: [createdUser, ...previous.users],
        }
      })
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        roleName: roles[0]?.name ?? 'WifiAdmin',
      })
      setIsModalOpen(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create user')
    } finally {
      setIsSubmitting(false)
      setProcessText('')
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users & Roles</h1>
          <p className="page-subtitle">Create tenant staff accounts with scoped access for WiFi admins, voucher agents, finance, and support.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => { setError(null); setProcessText(''); setIsModalOpen(true) }}>
          + Add User
        </button>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 18 }}>
        <button type="button" className={`tab-button ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')}>Staff</button>
        <button type="button" className={`tab-button ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => void openCustomers()}>Customers</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {(activeTab === 'staff'
          ? [
              { label: 'Staff Users', value: `${users.length}`, color: 'blue' },
              { label: 'Roles Available', value: `${roles.length}`, color: 'green' },
              { label: 'Active Users', value: `${users.filter((user) => user.isActive).length}`, color: 'amber' },
            ]
          : [
              { label: 'Customers', value: `${customers?.summary.totalCustomers ?? 0}`, color: 'blue' },
              { label: 'Active Customers', value: `${customers?.summary.activeCustomers ?? 0}`, color: 'green' },
              { label: 'Total Spent', value: formatCurrency(customers?.summary.totalSpentUgx ?? 0), color: 'amber' },
            ]).map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {activeTab === 'staff' && <div className="card">
        <div className="card-header">
          <span className="card-title">Tenant User Directory</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No tenant staff users have been created yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{user.email}</div>
                  </td>
                  <td>{user.role.name}</td>
                  <td>{user.role.permissions.includes('ALL') ? 'All permissions' : `${user.role.permissions.length} permissions`}</td>
                  <td><span className={getStatusBadgeClass(user.isActive ? 'ACTIVE' : 'INACTIVE')}>{user.isActive ? 'active' : 'inactive'}</span></td>
                  <td style={{ fontSize: 12 }}>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {activeTab === 'customers' && <div className="card">
        <div className="card-header">
          <span className="card-title">Customer Directory</span>
          {isLoadingCustomers && <span className="badge badge-info">Loading</span>}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Active Package</th>
                <th>Last Payment</th>
                <th>Total Spent</th>
                <th>Data Used</th>
                <th>Status</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {(customers?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No customers yet. Customer records appear after payment, voucher redemption, or network sessions.</p>
                    </div>
                  </td>
                </tr>
              )}
              {customers?.items.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div style={{ fontWeight: 800 }}>{customer.phoneNumber || customer.customerReference || 'Customer'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{customer.customerReference ?? 'No reference'}</div>
                  </td>
                  <td>{customer.activePackage?.name ?? 'None active'}</td>
                  <td>
                    {customer.lastPayment
                      ? `${customer.lastPayment.network} ${formatCurrency(customer.lastPayment.amountUgx)}`
                      : 'No payment'}
                  </td>
                  <td>{formatCurrency(customer.totalSpentUgx)}</td>
                  <td>{formatMegabytes(customer.dataUsedMb)}</td>
                  <td><span className={getStatusBadgeClass(customer.status)}>{customer.status}</span></td>
                  <td style={{ fontSize: 12 }}>{customer.lastSeen ? formatDate(customer.lastSeen) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {isModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button className="modal-close" type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Close</button>
            <div className="modal-kicker">Tenant Access</div>
            <h2 className="modal-title">Add Staff User</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <Field label="First Name" value={form.firstName} onChange={(value) => setForm((previous) => ({ ...previous, firstName: value }))} required />
                <Field label="Last Name" value={form.lastName} onChange={(value) => setForm((previous) => ({ ...previous, lastName: value }))} required />
                <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((previous) => ({ ...previous, email: value }))} required />
                <Field label="Temporary Password" type="password" value={form.password} onChange={(value) => setForm((previous) => ({ ...previous, password: value }))} required />
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={form.roleName} onChange={(event) => setForm((previous) => ({ ...previous, roleName: event.target.value }))}>
                    {roles.filter((role) => role.name !== 'SuperAdmin').map((role) => (
                      <option key={role.id} value={role.name}>{role.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <FormProcessStatus busy={isSubmitting} error={error} text={processText || 'Creating user. This modal closes after the account is saved.'} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="secondary-button" type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</button>
                <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating user...' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </div>
  )
}
