import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const portalPath = path.resolve(here, '../src/components/PortalCheckout.tsx')
let source = fs.readFileSync(portalPath, 'utf8').replace(/\r\n/g, '\n')

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1
  if (count === 0 && source.includes(after)) return
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one source match, found ${count}`)
  }
  source = source.replace(before, after)
}

const jsonHelper = `function isJsonResponse(response: Response) {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json')
}

async function portalApiFetch(apiPath: string, init?: RequestInit) {`

const boundedFetchHelper = `function isJsonResponse(response: Response) {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json')
}

// Captive networks can leave a browser fetch pending for tens of seconds when
// DNS/TLS or a particular API route is unreachable. That made the portal look
// blank and delayed returning-device reconnect until the browser's own network
// timeout expired. Only idempotent GET fallbacks are bounded; payment/voucher
// POST requests keep their existing single-request semantics so we never risk
// duplicating a financial action.
const PORTAL_GET_CANDIDATE_TIMEOUT_MS = 1500

async function fetchPortalCandidate(url: string, init: RequestInit | undefined, timeoutMs: number) {
  if (timeoutMs <= 0 || init?.signal) return fetch(url, init)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function portalApiFetch(apiPath: string, init?: RequestInit) {`
replaceOnce(jsonHelper, boundedFetchHelper, 'bounded captive GET helper')

const candidatesBlock = `  const candidates = [
    path,
    ...(configuredBase ? [\`${'${configuredBase}'}${'${suffix}'}\`] : []),
    ...PUBLIC_API_FALLBACKS.map((base) => \`${'${base}'}${'${suffix}'}\`),
  ].filter((url, index, all) => all.indexOf(url) === index)

  let lastError: unknown`

const boundedCandidatesBlock = `  const candidates = [
    path,
    ...(configuredBase ? [\`${'${configuredBase}'}${'${suffix}'}\`] : []),
    ...PUBLIC_API_FALLBACKS.map((base) => \`${'${base}'}${'${suffix}'}\`),
  ].filter((url, index, all) => all.indexOf(url) === index)
  const method = (init?.method ?? 'GET').toUpperCase()
  const candidateTimeoutMs = method === 'GET' ? PORTAL_GET_CANDIDATE_TIMEOUT_MS : 0

  let lastError: unknown`
replaceOnce(candidatesBlock, boundedCandidatesBlock, 'GET fallback timeout selection')

replaceOnce(
  '      const response = await fetch(url, init)',
  '      const response = await fetchPortalCandidate(url, init, candidateTimeoutMs)',
  'bounded portal candidate fetch',
)

const oldBootstrap = `  async function bootstrap() {
    const detected = mergeHotspotParams(readStoredPaymentReturn()?.hotspotParams, readHotspotParams())
    setHotspotParams(detected)
    const storedToken = typeof window === 'undefined' ? null : window.localStorage.getItem(portalStorageKey)

    if (storedToken) {
      const session = await loadPortalSession(storedToken)
      if (session) {
        await loadContext(session.customer.phoneNumber, storedToken, detected)
        setIsContextLoading(false)
        return
      }
    }

    await loadContext(undefined, undefined, detected)
    setIsContextLoading(false)
  }`

const fastBootstrap = `  async function bootstrap() {
    const detected = mergeHotspotParams(readStoredPaymentReturn()?.hotspotParams, readHotspotParams())
    setHotspotParams(detected)
    const storedToken = typeof window === 'undefined' ? null : window.localStorage.getItem(portalStorageKey)

    // Packages + returning-device detection are the captive first-paint path.
    // Never hold them behind validation of an old portal token: a slow/stale
    // session request used to leave new customers staring at an empty portal.
    const contextPromise = loadContext(undefined, undefined, detected)
      .catch(() => undefined)
      .finally(() => setIsContextLoading(false))

    // Session enrichment is useful but non-critical. Validate it in parallel;
    // if valid, refresh context with the customer's phone after packages are
    // already visible. This cannot delay first paint or returning-device login.
    if (storedToken) {
      void loadPortalSession(storedToken)
        .then((session) => {
          if (session) {
            void loadContext(session.customer.phoneNumber, storedToken, detected).catch(() => undefined)
          }
        })
        .catch(() => undefined)
    }

    await contextPromise
  }`
replaceOnce(oldBootstrap, fastBootstrap, 'non-blocking captive bootstrap')

replaceOnce(
  `        await loadContext(undefined, portalToken, hotspotParams)
        await autoSubmitHotspotLogin(reconnect)`,
  `        // RouterOS login is the critical path. Submit immediately; package/
        // session refresh can happen after the device has internet.
        autoSubmitHotspotLogin(reconnect)`,
  'trial connect-first path',
)

for (const marker of [
  'PORTAL_GET_CANDIDATE_TIMEOUT_MS = 1500',
  'fetchPortalCandidate(url, init, candidateTimeoutMs)',
  'Never hold them behind validation of an old portal token',
  'RouterOS login is the critical path. Submit immediately',
]) {
  if (!source.includes(marker)) {
    throw new Error(`captive fast-path marker missing after patch: ${marker}`)
  }
}

fs.writeFileSync(portalPath, source, 'utf8')
console.log('AROFi captive fast path applied: bounded GET fallback, immediate package paint, connect-first trial flow')
