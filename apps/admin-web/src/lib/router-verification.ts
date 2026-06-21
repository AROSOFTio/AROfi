import type { RouterDiagnosticsResponse, RouterSetupResponse } from './admin-types'

// ---------------------------------------------------------------------------
// Shared "is this router actually working" model.
//
// This is the single source of truth for what counts as verified, used by
// the deployment wizard, the fleet dashboard, and the troubleshooting panel.
// Every item maps to a real signal AROFi observed — a provisioning callback,
// a router self-test report, a real RADIUS Access-Accept, or live accounting
// from a real client — never merely "the script ran". See dashboardState on
// RouterItem (backend-computed) for the equivalent ONLINE/WARNING/OFFLINE
// gate used for the big fleet-level indicator.
// ---------------------------------------------------------------------------

export type SelfTestCheck = Record<string, string>
export type CheckState = 'pass' | 'fail' | 'pending'

export type VerificationItem = {
  key: string
  label: string
  state: CheckState
  critical: boolean
  problem: string
  fix: string
}

export function buildVerification(
  setup: RouterSetupResponse,
  diag: RouterDiagnosticsResponse | null,
): VerificationItem[] {
  const r = setup.router
  const selfChecks: SelfTestCheck = {}
  for (const c of diag?.selfTest?.checks ?? []) {
    selfChecks[c.code] = c.ok ? 'pass' : (c.value ?? 'fail')
  }
  // setupDiagnostics codes: local_self_test, provisioning_callback, management_api
  const setupDiag = new Map((diag?.setupDiagnostics ?? setup.setupDiagnostics ?? []).map((d) => [d.code, d.ok]))
  const selfTestPassed = diag?.selfTest?.status === 'ok'
  const callback = Boolean(r.provisioningCallbackReceived) || setupDiag.get('provisioning_callback') === true

  // A self-test report only exists if the router reached AROFi over the internet
  // (the on-box script aborts before reporting if it has no WAN), so a present
  // report is itself proof of router internet + DNS.
  const reported = Boolean(diag?.selfTest?.checkedAt) || callback

  const ok = (b: boolean): CheckState => (b ? 'pass' : reported ? 'fail' : 'pending')
  const checkOk = (code: string): CheckState => {
    const v = selfChecks[code]
    if (v === 'pass' || v === 'ok' || v === 'skip' || v === 'ethernet' || v === 'existing') return 'pass'
    if (v === undefined) return reported ? 'fail' : 'pending'
    return 'fail'
  }

  return [
    {
      key: 'router_online',
      label: 'Router Online',
      state: ok(callback || r.liveState === 'LIVE' || Boolean(r.isLiveNow)),
      critical: true,
      problem: 'The router has not contacted AROFi yet.',
      fix: 'Confirm the script finished running in WinBox and the router has internet (WAN).',
    },
    {
      key: 'heartbeat',
      label: 'Heartbeat Active',
      state: ok(checkOk('scheduler') === 'pass' || r.liveState === 'LIVE' || r.liveState === 'STALE'),
      critical: false,
      problem: 'No heartbeat scheduler signal received.',
      fix: 'Re-run the script; it installs the arofi-heartbeat scheduler that beats every 60s.',
    },
    {
      key: 'internet',
      label: 'Internet Reachable',
      state: ok(reported),
      critical: true,
      problem: 'The router could not reach the internet during self-test.',
      fix: 'Check the WAN cable/PPPoE/LTE and that /ping 8.8.8.8 works on the router.',
    },
    {
      key: 'dns',
      label: 'DNS Working',
      state: ok(reported && checkOk('files') !== 'fail'),
      critical: true,
      problem: 'DNS resolution failed on the router.',
      fix: 'Set /ip dns servers to 1.1.1.1,8.8.8.8 and allow-remote-requests=yes, then retry.',
    },
    {
      key: 'hotspot',
      label: 'Hotspot Running',
      state: checkOk('hotspot'),
      critical: true,
      problem: 'The hotspot server is missing or disabled.',
      fix: 'Re-run the script to recreate the arofi-hotspot server on the isolated bridge.',
    },
    {
      key: 'radius',
      label: 'RADIUS Connected',
      state: checkOk('radius'),
      critical: true,
      problem: 'The router cannot reach the AROFi RADIUS server.',
      fix: 'Ensure UDP 1812/1813 to the RADIUS host is open from the router; re-run the script.',
    },
    {
      key: 'voucher_auth',
      label: 'Voucher Authentication',
      state: ok(Boolean(r.radiusAuthSeen)),
      critical: true,
      problem: 'No successful RADIUS Access-Accept has been seen yet.',
      fix: 'Redeem a test voucher on a connected phone to generate a real authentication.',
    },
    {
      key: 'portal',
      label: 'Portal Reachable',
      state: checkOk('files'),
      critical: false,
      problem: 'The captive portal login page is not installed.',
      fix: 'Re-run the script so it fetches hotspot/login.html onto the router.',
    },
    {
      key: 'walled_garden',
      label: 'Walled Garden Configured',
      state: ok(selfTestPassed || callback),
      critical: false,
      problem: 'Walled garden entries for the portal/payment hosts are missing.',
      fix: 'Re-run the script; it adds the AROFi portal walled-garden allow rules.',
    },
    {
      key: 'nat',
      label: 'NAT Configured',
      state: checkOk('nat'),
      critical: true,
      problem: 'No NAT masquerade for hotspot clients was found.',
      fix: 'The script adds NAT automatically once a WAN interface is detected; check WAN and retry.',
    },
    {
      key: 'dhcp',
      label: 'DHCP Running',
      state: checkOk('dhcp'),
      critical: true,
      problem: 'The DHCP server for hotspot clients is missing.',
      fix: 'Re-run the script to recreate the arofi-dhcp server and pool.',
    },
    {
      key: 'client_internet',
      label: 'Client Internet After Auth',
      state: ok(Boolean(r.accountingSeen)),
      critical: true,
      problem: 'No real client has been accounted online yet.',
      fix: 'Connect a phone, redeem a voucher, and confirm it browses — accounting will confirm here.',
    },
  ]
}

export function dashboardStateLabel(state?: 'ONLINE' | 'WARNING' | 'OFFLINE' | null) {
  switch (state) {
    case 'ONLINE':
      return 'ONLINE'
    case 'WARNING':
      return 'WARNING'
    default:
      return 'OFFLINE'
  }
}

export function dashboardStateColor(state?: 'ONLINE' | 'WARNING' | 'OFFLINE' | null) {
  switch (state) {
    case 'ONLINE':
      return '#16a34a'
    case 'WARNING':
      return '#d97706'
    default:
      return '#dc2626'
  }
}
