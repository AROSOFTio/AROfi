// Many self-onboarded routers (especially ones on a static WAN IP, or freshly
// reset) have no DNS servers configured, so the very first `/tool fetch` by
// hostname fails with "unable to resolve hostname" before AROFi's own script
// ever runs. Bootstrap public DNS first (only if none is already set, so we
// never clobber an operator's existing resolver) so install commands work for
// any router out of the box.
export const DNS_BOOTSTRAP = ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; '

function toHttpFirstApiOrigin(apiOrigin: string) {
  return apiOrigin.replace(/^https:\/\//i, 'http://')
}

function fetchImportCommand(options: {
  httpsUrl: string
  httpUrl?: string
  fileName: string
  downloadedMessage: string
  emptyMessage: string
  missingMessage: string
  installedBlock: string
}) {
  const httpUrl = options.httpUrl || options.httpsUrl.replace(/^https:\/\//i, 'http://')
  return (
    `:do { /file remove [find name="${options.fileName}"] } on-error={}; ` +
    ':local arofiOk 0; :local arofiTry 0; ' +
    ':while (($arofiOk = 0) && ($arofiTry < 2)) do={ ' +
      ':set arofiTry ($arofiTry + 1); ' +
      `:do { /tool fetch url="${httpUrl}" dst-path="${options.fileName}"; :delay 6s; :local f [/file find name="${options.fileName}"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={}; ` +
      ':if ($arofiOk = 0) do={ ' +
        `:do { /file remove [find name="${options.fileName}"] } on-error={}; ` +
        `:do { /tool fetch url="${options.httpsUrl}" check-certificate=no dst-path="${options.fileName}"; :delay 6s; :local f [/file find name="${options.fileName}"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={} ` +
      '}; ' +
      ':if (($arofiOk = 0) && ($arofiTry < 2)) do={ :put "Retrying after router fetch cleanup..."; :delay 10s } ' +
    '}; ' +
    `:local f [/file find name="${options.fileName}"]; :if (($arofiOk = 1) && ([:len $f] > 0)) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :put "${options.downloadedMessage}"; :delay 2s; /import file-name="${options.fileName}"; :delay 1s; /file remove "${options.fileName}"; ${options.installedBlock} } else={ :put "${options.emptyMessage}"; /file remove $f } } else={ :put "${options.missingMessage}" }`
  )
}

export function absoluteApiOrigin(configuredApiUrl?: string | null, browserOrigin?: string) {
  const configured = configuredApiUrl?.trim()
  const origin = browserOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://arofi.net')
  if (!configured) return `${origin}/api`
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '')
  return `${origin}${configured.startsWith('/') ? configured : `/${configured}`}`.replace(/\/$/, '')
}

export function buildRemoteAccessInstallCommand(remoteToken: string | null | undefined, origin?: string) {
  const apiOrigin = absoluteApiOrigin(process.env.NEXT_PUBLIC_API_URL, origin)
  const path = `/mikrotik/remote-access/install/${remoteToken || ''}`
  return `${DNS_BOOTSTRAP}:global arofiRemoteAccessStatus "not-run"; :global arofiRemoteAccessMessage ""; ${fetchImportCommand({
    httpsUrl: `${apiOrigin}${path}`,
    httpUrl: `${toHttpFirstApiOrigin(apiOrigin)}${path}`,
    fileName: 'vpn.rsc',
    downloadedMessage: 'AROFi remote access downloaded. Installing...',
    emptyMessage: 'ERROR: remote access file is empty. Re-paste when WAN is stable.',
    missingMessage: 'ERROR: remote access file was not downloaded. Wait 30 seconds, confirm WAN internet, then re-paste once.',
    installedBlock:
      ':global arofiRemoteAccessStatus; :global arofiRemoteAccessMessage; :if ($arofiRemoteAccessStatus = "ok") do={ :put "AROFi remote access installed." } else={ :put ("ERROR: AROFi remote access was not installed. " . $arofiRemoteAccessMessage); :put "Fix the error above, then re-run this command." }',
  })}`
}

export function buildSetupFallbackCommand(registrationKey: string) {
  return `${DNS_BOOTSTRAP}${fetchImportCommand({
    httpsUrl: `https://arofi.net/api/mikrotik/script/${registrationKey}`,
    httpUrl: `http://arofi.net/api/mikrotik/script/${registrationKey}`,
    fileName: 'arofi-setup.rsc',
    downloadedMessage: 'AROFi setup downloaded. Installing...',
    emptyMessage: 'ERROR: AROFi setup file is empty. Re-paste when WAN is stable.',
    missingMessage: 'ERROR: AROFi setup file was not downloaded. Wait 30 seconds, confirm WAN internet, then re-paste once.',
    installedBlock: ':put "AROFi setup installed."',
  })}`
}
