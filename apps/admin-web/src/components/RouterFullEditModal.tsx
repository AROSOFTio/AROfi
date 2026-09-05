'use client'

import { useMemo, useState } from 'react'
import { clientPatchApi } from '@/lib/client-api'
import { PhoneNumberField } from '@/components/PhoneNumberField'

type RouterFullEditModalProps = {
  router: any
  groups: any[]
  hotspots: any[]
  onClose: () => void
  onSaved: () => void | Promise<void>
}

export default function RouterFullEditModal({ router, groups, hotspots, onClose, onSaved }: RouterFullEditModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: router.name ?? '',
    identity: router.identity ?? '',
    siteLabel: router.siteLabel ?? '',
    locationText: router.locationText ?? '',
    ispName: router.ispName ?? '',
    managerName: router.managerName ?? '',
    managerPhone: router.managerPhone ?? '',
    groupId: router.group?.id ?? router.groupId ?? '',
    hotspotId: router.hotspot?.id ?? router.hotspotId ?? '',
    host: router.host ?? '',
    apiPort: String(router.apiPort ?? 8728),
    connectionMode: (router.connectionMode ?? 'ROUTEROS_API') as 'ROUTEROS_API' | 'ROUTEROS_API_SSL',
    username: router.username ?? 'admin',
    password: '',
    model: router.model ?? '',
    serialNumber: router.serialNumber ?? '',
    routerOsVersion: router.routerOsVersion ?? '',
    radiusNasIpAddress: router.radiusNasIpAddress ?? '',
    hotspotServerName: router.hotspotServerName ?? 'hs-AroFi',
    portalWalledGardenHosts: Array.isArray(router.portalWalledGardenHosts)
      ? router.portalWalledGardenHosts.join(', ')
      : '',
    ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled !== false,
    scriptMode: (router.lastScriptMode ?? 'FRESH_FULL_CAPTIVE_WIFI') as
      | 'SAFE_EXISTING_ROUTER'
      | 'FRESH_FULL_CAPTIVE_WIFI',
  })

  const tenantId = router.tenant?.id ?? router.tenantId
  const availableGroups = useMemo(
    () => groups.filter((group) => !tenantId || group.tenant?.id === tenantId),
    [groups, tenantId],
  )
  const availableHotspots = useMemo(
    () => hotspots.filter((hotspot) => !tenantId || hotspot.tenant?.id === tenantId),
    [hotspots, tenantId],
  )

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!form.name.trim()) {
      setError('Router name is required.')
      return
    }
    if (!form.siteLabel.trim()) {
      setError('Wi-Fi / site name is required.')
      return
    }
    if (!form.host.trim()) {
      setError('Router host is required.')
      return
    }
    if (!form.username.trim()) {
      setError('RouterOS API username is required.')
      return
    }

    const apiPort = Number.parseInt(form.apiPort, 10)
    if (!Number.isFinite(apiPort) || apiPort < 1 || apiPort > 65535) {
      setError('API port must be between 1 and 65535.')
      return
    }

    setSaving(true)
    try {
      const portalWalledGardenHosts = form.portalWalledGardenHosts
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean)
        .slice(0, 12)

      await clientPatchApi(`/routers/${router.id}`, {
        name: form.name.trim(),
        identity: form.identity.trim() || null,
        siteLabel: form.siteLabel.trim(),
        locationText: form.locationText.trim() || null,
        ispName: form.ispName.trim() || null,
        managerName: form.managerName.trim() || null,
        managerPhone: form.managerPhone.trim() || null,
        groupId: form.groupId || null,
        hotspotId: form.hotspotId || null,
        host: form.host.trim(),
        apiPort,
        connectionMode: form.connectionMode,
        username: form.username.trim(),
        password: form.password.trim() || undefined,
        model: form.model.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        routerOsVersion: form.routerOsVersion.trim() || null,
        radiusNasIpAddress: form.radiusNasIpAddress.trim() || null,
        hotspotServerName: form.hotspotServerName.trim() || null,
        portalWalledGardenHosts,
        ttlAntiTetheringEnabled: form.ttlAntiTetheringEnabled,
        scriptMode: form.scriptMode,
      })

      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update router.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div
        className="modal-card"
        style={{ width: 'min(900px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Edit Router</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '5px 0 0' }}>
              Everything entered during onboarding can be changed here. The router ID, registration key/code and platform RADIUS secret stay protected.
            </p>
          </div>
          <button type="button" className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose} disabled={saving}>×</button>
        </div>

        <form onSubmit={save} style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Router Name</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Wi-Fi / Site Name (SSID)</label>
              <input className="form-input" value={form.siteLabel} onChange={(e) => setForm((p) => ({ ...p, siteLabel: e.target.value }))} required />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Re-run Get Setup Script after saving to apply an SSID change on MikroTik.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Router Identity</label>
              <input className="form-input" value={form.identity} onChange={(e) => setForm((p) => ({ ...p, identity: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Physical Location</label>
              <input className="form-input" value={form.locationText} onChange={(e) => setForm((p) => ({ ...p, locationText: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Internet Provider (ISP)</label>
              <input className="form-input" value={form.ispName} onChange={(e) => setForm((p) => ({ ...p, ispName: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact / Site Manager</label>
              <input className="form-input" value={form.managerName} onChange={(e) => setForm((p) => ({ ...p, managerName: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Phone</label>
              <PhoneNumberField value={form.managerPhone} onChange={(value) => setForm((p) => ({ ...p, managerPhone: value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Router Group</label>
              <select className="form-input" value={form.groupId} onChange={(e) => setForm((p) => ({ ...p, groupId: e.target.value }))}>
                <option value="">No group</option>
                {availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Linked Hotspot Site</label>
              <select className="form-input" value={form.hotspotId} onChange={(e) => setForm((p) => ({ ...p, hotspotId: e.target.value }))}>
                <option value="">No linked hotspot</option>
                {availableHotspots.map((hotspot) => <option key={hotspot.id} value={hotspot.id}>{hotspot.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h4 style={{ fontSize: 13, margin: '0 0 12px', fontWeight: 700 }}>RouterOS / Network Settings</h4>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Host / Management Address</label>
                <input className="form-input" value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">API Port</label>
                <input className="form-input" type="number" min={1} max={65535} value={form.apiPort} onChange={(e) => setForm((p) => ({ ...p, apiPort: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Connection Mode</label>
                <select className="form-input" value={form.connectionMode} onChange={(e) => setForm((p) => ({ ...p, connectionMode: e.target.value as 'ROUTEROS_API' | 'ROUTEROS_API_SSL' }))}>
                  <option value="ROUTEROS_API">RouterOS API</option>
                  <option value="ROUTEROS_API_SSL">RouterOS API SSL</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">API Username</label>
                <input className="form-input" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">New API Password</label>
                <input className="form-input" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="Leave blank to keep current password" />
              </div>
              <div className="form-group">
                <label className="form-label">RADIUS / NAS Address</label>
                <input className="form-input" value={form.radiusNasIpAddress} onChange={(e) => setForm((p) => ({ ...p, radiusNasIpAddress: e.target.value }))} placeholder="Usually the router public/VPN address" />
              </div>
              <div className="form-group">
                <label className="form-label">Hotspot Server Name</label>
                <input className="form-input" value={form.hotspotServerName} onChange={(e) => setForm((p) => ({ ...p, hotspotServerName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Setup Mode</label>
                <select className="form-input" value={form.scriptMode} onChange={(e) => setForm((p) => ({ ...p, scriptMode: e.target.value as 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_CAPTIVE_WIFI' }))}>
                  <option value="FRESH_FULL_CAPTIVE_WIFI">Create Customer Wi-Fi</option>
                  <option value="SAFE_EXISTING_ROUTER">Existing Hotspot Setup</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h4 style={{ fontSize: 13, margin: '0 0 12px', fontWeight: 700 }}>Hardware / Portal Details</h4>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Model</label>
                <input className="form-input" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Serial Number</label>
                <input className="form-input" value={form.serialNumber} onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">RouterOS Version</label>
                <input className="form-input" value={form.routerOsVersion} onChange={(e) => setForm((p) => ({ ...p, routerOsVersion: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Portal / Walled Garden Hosts</label>
                <input className="form-input" value={form.portalWalledGardenHosts} onChange={(e) => setForm((p) => ({ ...p, portalWalledGardenHosts: e.target.value }))} placeholder="arofi.net, api.arofi.net" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.ttlAntiTetheringEnabled} onChange={(e) => setForm((p) => ({ ...p, ttlAntiTetheringEnabled: e.target.checked }))} />
                Enable TTL Anti-Tethering
              </label>
            </div>
          </div>

          <div style={{ padding: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-muted)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Protected values such as the router database ID, registration key/code, remote token and platform RADIUS shared secret cannot be renamed. This prevents a normal edit from breaking authentication or historical records.
          </div>

          {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save All Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
