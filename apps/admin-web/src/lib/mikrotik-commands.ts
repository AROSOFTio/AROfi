// Many self-onboarded routers (especially ones on a static WAN IP, or freshly
// reset) have no DNS servers configured, so the very first `/tool fetch` by
// hostname can fail before AROFi's own script runs. Bootstrap public DNS only
// when no resolver exists; never replace an operator's configured DNS.
export const DNS_BOOTSTRAP = ':if ([:len [/ip dns get servers]] = 0) do={ /ip dns set servers=8.8.8.8,1.1.1.1 }; '
const AROFI_HTTP_FALLBACK_ORIGIN = 'http://95.111.234.34/api'

export function absoluteApiOrigin(configuredApiUrl?: string | null, browserOrigin?: string) {
  const configured = configuredApiUrl?.trim()
  const origin = browserOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://arofi.net')
  if (!configured) return `${origin}/api`
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '')
  return `${origin}${configured.startsWith('/') ? configured : `/${configured}`}`.replace(/\/$/, '')
}

function buildReliableRouterOsDownload(options: {
  httpsUrl: string
  httpFallbackUrl: string
  fileName: string
  retryLabel: string
  downloadedLabel: string
  installedLabel: string
  emptyError: string
  missingError: string
}) {
  const {
    httpsUrl,
    httpFallbackUrl,
    fileName,
    retryLabel,
    downloadedLabel,
    installedLabel,
    emptyError,
    missingError,
  } = options

  // HTTPS is the normal path and is attempted first. Plain HTTP is retained
  // only as a compatibility fallback for old routers whose clock/TLS stack is
  // not ready yet. This avoids a guaranteed-looking "status: failed" before a
  // healthy HTTPS success on normal RouterOS 6/7 installations.
  return `${DNS_BOOTSTRAP}:local arofiOk 0; :local attempts 0; :while ($attempts < 3) do={ :set attempts ($attempts + 1); :do { /file remove [find name="${fileName}"] } on-error={}; :do { /tool fetch url="${httpsUrl}" check-certificate=no dst-path="${fileName}" mode=https; :delay 1s; :local f [/file find name="${fileName}"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={}; :if ($arofiOk = 0) do={ :do { /file remove [find name="${fileName}"] } on-error={}; :do { /tool fetch url="${httpFallbackUrl}" dst-path="${fileName}" mode=http; :delay 1s; :local f [/file find name="${fileName}"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :set arofiOk 1 } else={ /file remove $f } } } on-error={} }; :if ($arofiOk = 1) do={ :set attempts 3 } else={ :if ($attempts < 3) do={ :put "${retryLabel}"; :delay 2s } } }; :local f [/file find name="${fileName}"]; :if ([:len $f] > 0) do={ :local sz [/file get $f size]; :if ($sz > 0) do={ :put "${downloadedLabel}"; :delay 1s; /import file-name="${fileName}"; :delay 1s; /file remove "${fileName}"; :put "${installedLabel}" } else={ :put "${emptyError}"; /file remove $f } } else={ :put "${missingError}" }`
}

export function buildRemoteAccessInstallCommand(remoteToken: string | null | undefined, origin?: string) {
  const apiOrigin = absoluteApiOrigin(process.env.NEXT_PUBLIC_API_URL, origin)
  const token = remoteToken || ''
  return buildReliableRouterOsDownload({
    httpsUrl: `${apiOrigin}/mikrotik/remote-access/install/${token}`,
    httpFallbackUrl: `${AROFI_HTTP_FALLBACK_ORIGIN}/mikrotik/remote-access/install/${token}`,
    fileName: 'vpn.rsc',
    retryLabel: 'Retrying AROFi remote access download...',
    downloadedLabel: 'AROFi remote access downloaded. Installing...',
    installedLabel: 'AROFi remote access installed.',
    emptyError: 'ERROR: remote access file is empty. Re-paste when WAN is stable.',
    missingError: 'ERROR: remote access file was not downloaded. Check WAN, then re-paste.',
  })
}

export function buildSetupFallbackCommand(registrationKey: string, origin?: string) {
  const apiOrigin = absoluteApiOrigin(process.env.NEXT_PUBLIC_API_URL, origin)
  return buildReliableRouterOsDownload({
    httpsUrl: `${apiOrigin}/mikrotik/script/${registrationKey}`,
    httpFallbackUrl: `${AROFI_HTTP_FALLBACK_ORIGIN}/mikrotik/script/${registrationKey}`,
    fileName: 'arofi-setup.rsc',
    retryLabel: 'Retrying AROFi setup download...',
    downloadedLabel: 'AROFi setup downloaded. Installing...',
    installedLabel: 'AROFi setup installed.',
    emptyError: 'ERROR: AROFi setup file is empty. Re-paste when WAN is stable.',
    missingError: 'ERROR: AROFi setup file was not downloaded. Check WAN, then re-paste.',
  })
}
