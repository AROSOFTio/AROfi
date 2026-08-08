const LOCAL_WIFI_SUFFIX = '.wifi'

/**
 * Build the one authoritative local HotSpot hostname used by MikroTik DNS,
 * printed voucher QR codes, PDF previews and the captive login URL.
 *
 * This is deliberately a local HTTP hostname. It resolves only through the
 * venue MikroTik while the customer is connected to that venue's Wi-Fi.
 */
export function buildTenantHotspotDomain(tenantName?: string | null) {
  const slug = (tenantName ?? '')
    .replace(/^arofi(?:\s+wifi)?(?:\s+tenant)?[\s:_-]*/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40)

  return `${slug || 'arofi'}${LOCAL_WIFI_SUFFIX}`
}

export function buildVoucherHotspotUrl(
  voucherCode: string,
  hotspotDomain?: string | null,
) {
  const normalizedHost = (hotspotDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')

  const safeHost = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.wifi$/i.test(normalizedHost)
    ? normalizedHost
    : buildTenantHotspotDomain()

  return `http://${safeHost}/login?voucher=${encodeURIComponent(
    voucherCode.trim().toUpperCase(),
  )}`
}
