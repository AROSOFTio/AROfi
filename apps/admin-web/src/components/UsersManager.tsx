'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { UsersOverviewResponse } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientDeleteApi, clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, formatMegabytes, formatRoleName, getRoleDescription, getStatusBadgeClass } from '@/lib/format'
import CustomerDetailModal from '@/components/CustomerDetailModal'

type UserFormState = {
  firstName: string
  lastName: string
  email: string
  password: string
  roleName: string
}

const preferredTenantRoles = ['VendorAdmin', 'WifiAdmin', 'VoucherAgent', 'FinanceManager', 'Support', 'ReadOnlySupport', 'NetworkOperator']

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
  const searchParams = useSearchParams()
  const [data, setData] = useState(initialData)
  const [activeTab, setActiveTab] = useState<'staff' | 'customers'>('staff')
  const [customers, setCustomers] = useState<CustomerDirectory | null>(null)
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UsersOverviewResponse['users'][number] | null>(null)
  const [editForm, setEditForm] = useState<UserFormState>({ firstName: '', lastName: '', email: '', password: '', roleName: 'WifiAdmin' })
  const [detailReference, setDetailReference] = useState<string | null>(null)
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

  function beginEditUser(user: UsersOverviewResponse['users'][number]) {
    setEditingUser(user)
    setEditForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      password: '',
      roleName: user.role.name,
    })
    setError(null)
  }

  async function refreshUsers() {
    setData(await clientFetchApi<UsersOverviewResponse>('/users'))
  }

  async function submitEditUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    setIsSubmitting(true)
    setError(null)
    setProcessText('Updating staff user.')
    try {
      await clientPatchApi(`/users/${editingUser.id}`, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        roleName: editForm.roleName,
        password: editForm.password || undefined,
      })
      await refreshUsers()
      setEditingUser(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update staff user')
    } finally {
      setIsSubmitting(false)
      setProcessText('')
    }
  }

  async function toggleUserActive(user: UsersOverviewResponse['users'][number]) {
    setIsSubmitting(true)
    setError(null)
    try {
      await clientPostApi(`/users/${user.id}/${user.isActive ? 'deactivate' : 'activate'}`, {})
      await refreshUsers()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update user status')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function deleteUser(user: UsersOverviewResponse['users'][number]) {
    if (!window.confirm('Delete this staff user? This disables their login access.')) return
    setIsSubmitting(true)
    setError(null)
    try {
      await clientDeleteApi(`/users/${user.id}`)
      await refreshUsers()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete staff user')
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'customers') {
      void openCustomers()
    } else if (tab === 'staff') {
      setActiveTab('staff')
    }
  }, [searchParams])

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
          <p className="page-subtitle">Create staff accounts with scoped access for WiFi admins, voucher agents, finance, and support.</p>
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
          <span className="card-title">Staff Directory</span>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No staff users have been created yet.</p>
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
                  <td>{formatRoleName(user.role.name)}</td>
                  <td>{user.role.permissions.includes('ALL') ? 'All permissions' : `${user.role.permissions.length} permissions`}</td>
                  <td><span className={getStatusBadgeClass(user.isActive ? 'ACTIVE' : 'INACTIVE')}>{user.isActive ? 'active' : 'inactive'}</span></td>
                  <td style={{ fontSize: 12 }}>{formatDate(user.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-ghost" onClick={() => beginEditUser(user)}>Edit</button>
                      <button type="button" className="btn btn-ghost" onClick={() => void toggleUserActive(user)} disabled={isSubmitting}>
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger-fg)' }} onClick={() => void deleteUser(user)} disabled={isSubmitting}>Delete</button>
                    </div>
                  </td>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(customers?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={8}>
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
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{customer.customerReference && customer.customerReference !== customer.phoneNumber ? customer.customerReference : 'Identified by phone number'}</div>
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
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setDetailReference(customer.phoneNumber || customer.customerReference || customer.id)}
                    >
                      View Details
                    </button>
                  </td>
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
            <div className="modal-kicker">Business Access</div>
            <h2 className="modal-title">Add Staff User</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <Field label="First Name" value={form.firstName} onChange={(value) => setForm((previous) => ({ ...previous, firstName: value }))} required />
                <Field label="Last Name" value={form.lastName} onChange={(value) => setForm((previous) => ({ ...previous, lastName: value }))} required />
                <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((previous) => ({ ...previous, email: value }))} required />
                <Field label="Temporary Password" type="password" value={form.password} onChange={(value) => setForm((previous) => ({ ...previous, password: value }))} required />
              </div>
              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Role</label>
                <select
                  className="form-input"
                  value={form.roleName}
                  onChange={(event) => setForm((previous) => ({ ...previous, roleName: event.target.value }))}
                  required
                >
                  {roles.filter((role) => role.name !== 'SuperAdmin').map((role) => (
                    <option key={role.id} value={role.name}>{formatRoleName(role.name)}</option>
                  ))}
                </select>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35, margin: '6px 0 0' }}>
                  {getRoleDescription(form.roleName)}
                </p>
                <div style={{ display: 'none', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 2 }}>
                  {roles.filter((role) => role.name !== 'SuperAdmin').map((role) => {
                    const selected = form.roleName === role.name
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setForm((previous) => ({ ...previous, roleName: role.name }))}
                        style={{
                          textAlign: 'left',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: selected ? '2px solid var(--arofi-theme-accent)' : '1px solid var(--border)',
                          background: selected ? 'var(--arofi-theme-accent-soft-2)' : 'var(--bg-card)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <strong style={{ fontSize: 13.5, color: 'var(--text-1)' }}>{formatRoleName(role.name)}</strong>
                          {selected && <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--arofi-theme-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, flexShrink: 0 }}>✓</span>}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35 }}>{getRoleDescription(role.name)}</span>
                      </button>
                    )
                  })}
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

      {editingUser && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button className="modal-close" type="button" onClick={() => setEditingUser(null)} disabled={isSubmitting}>Close</button>
            <div className="modal-kicker">Business Access</div>
            <h2 className="modal-title">Edit Staff User</h2>
            <form onSubmit={submitEditUser}>
              <div className="form-grid">
                <Field label="First Name" value={editForm.firstName} onChange={(value) => setEditForm((previous) => ({ ...previous, firstName: value }))} required />
                <Field label="Last Name" value={editForm.lastName} onChange={(value) => setEditForm((previous) => ({ ...previous, lastName: value }))} required />
                <Field label="Email" type="email" value={editForm.email} onChange={(value) => setEditForm((previous) => ({ ...previous, email: value }))} required />
                <Field label="New Password" type="password" value={editForm.password} onChange={(value) => setEditForm((previous) => ({ ...previous, password: value }))} />
              </div>
              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Role</label>
                <select
                  className="form-input"
                  value={editForm.roleName}
                  onChange={(event) => setEditForm((previous) => ({ ...previous, roleName: event.target.value }))}
                  required
                >
                  {roles.filter((role) => role.name !== 'SuperAdmin').map((role) => (
                    <option key={role.id} value={role.name}>{formatRoleName(role.name)}</option>
                  ))}
                </select>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35, margin: '6px 0 0' }}>
                  {getRoleDescription(editForm.roleName)}
                </p>
              </div>
              <FormProcessStatus busy={isSubmitting} error={error} text={processText || 'Updating staff user.'} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="secondary-button" type="button" onClick={() => setEditingUser(null)} disabled={isSubmitting}>Cancel</button>
                <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailReference && <CustomerDetailModal reference={detailReference} onClose={() => setDetailReference(null)} />}
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
