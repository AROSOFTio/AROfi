// Many self-onboarded routers (especially ones on a static WAN IP, or freshly
// reset) have no DNS servers configured, so the very first `/tool fetch` by
// hostname fails with "unable to resolve hostname" before AROFi's own script
// ever runs. Bootstrap public DNS first (only if none is already set, so we
// never clobber an operator's existing resolver) so install commands work for
// any router out of the box.
export const DNS_BOOTSTRAP = ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; '

export function absoluteApiOrigin(configuredApiUrl?: string | null, browserOrigin?: string) {
  const configured = configuredApiUrl?.trim()
  const origin = browserOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://arofi.net')
  if (!configured) return `${origin}/api`
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '')
  return `${origin}${configured.startsWith('/') ? configured : `/${configured}`}`.replace(/\/$/, '')
}

export function buildRemoteAccessInstallCommand(remoteToken: string | null | undefined, origin?: string) {
  const apiOrigin = absoluteApiOrigin(process.env.NEXT_PUBLIC_API_URL, origin)
  return `${DNS_BOOTSTRAP}:do { /file remove [find name="vpn.rsc"] } on-error={}; /tool fetch url="${apiOrigin}/mikrotik/remote-access/install/${remoteToken || ''}" check-certificate=no dst-path="vpn.rsc" mode=https; :delay 4s; :local f [/file find name="vpn.rsc"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :put "AROFi remote access downloaded. Installing..."; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /file remove "vpn.rsc"; :put "AROFi remote access installed." } else={ :put "ERROR: remote access file is empty. Re-paste when WAN is stable."; /file remove $f } } else={ :put "ERROR: remote access file was not downloaded. Re-paste when WAN is stable." }`
}

export function buildSetupFallbackCommand(registrationKey: string) {
  return `${DNS_BOOTSTRAP}:do { /file remove [find name="arofi-setup.rsc"] } on-error={}; /tool fetch url="https://arofi.net/api/mikrotik/script/${registrationKey}" dst-path="arofi-setup.rsc" mode=https; :delay 4s; :local f [/file find name="arofi-setup.rsc"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :put "AROFi setup downloaded. Installing..."; :delay 2s; /import file-name="arofi-setup.rsc"; :delay 1s; /file remove "arofi-setup.rsc"; :put "AROFi setup installed." } else={ :put "ERROR: AROFi setup file is empty. Re-paste when WAN is stable."; /file remove $f } } else={ :put "ERROR: AROFi setup file was not downloaded. Re-paste when WAN is stable." }`
}
