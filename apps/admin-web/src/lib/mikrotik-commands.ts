// Many self-onboarded routers (especially ones on a static WAN IP, or freshly
// reset) have no DNS servers configured, so the very first `/tool fetch` by
// hostname fails with "unable to resolve hostname" before AROFi's own script
// ever runs. Bootstrap public DNS first (only if none is already set, so we
// never clobber an operator's existing resolver) so install commands work for
// any router out of the box.
export const DNS_BOOTSTRAP = ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; '

export function buildRemoteAccessInstallCommand(remoteToken: string | null | undefined, origin?: string) {
  const host = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://app.arofi.net')
  return `${DNS_BOOTSTRAP}/tool fetch url="${host}/api/mikrotik/remote-access/install/${remoteToken || ''}" check-certificate=no dst-path="vpn.rsc" mode=https; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /file remove "vpn.rsc"`
}

export function buildSetupFallbackCommand(registrationKey: string) {
  return `${DNS_BOOTSTRAP}/tool fetch url="https://app.arofi.net/api/mikrotik/script/${registrationKey}" dst-path="arofi-setup.rsc" mode=https; /import file-name="arofi-setup.rsc"; /file remove "arofi-setup.rsc"`
}
