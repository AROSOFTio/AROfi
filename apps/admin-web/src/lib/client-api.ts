import { clearBrowserAdminSession, getBrowserAdminToken, setBrowserAdminSession } from './admin-session'

type ApiErrorPayload = {
  message?: string | string[]
}

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

// The access token is short-lived by design (see apps/api auth.module.ts).
// Dedupe concurrent refresh attempts so N simultaneous 401s only trigger one
// /auth/refresh call, not N of them racing each other.
let refreshInFlight: Promise<boolean> | null = null

export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${browserApiBase}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!response.ok) {
          return false
        }
        const body = await response.json().catch(() => null)
        if (typeof body?.access_token !== 'string') {
          return false
        }
        setBrowserAdminSession(body.access_token)
        return true
      } catch {
        return false
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

export async function clientFetchApi<T>(path: string): Promise<T> {
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      cache: 'no-store',
      credentials: 'include',
      headers: buildAuthHeaders(),
    })
  return parseResponse<T>(await doFetch(), doFetch)
}

export async function clientPostApi<T>(path: string, payload: unknown, options: { timeoutMs?: number } = {}): Promise<T> {
  const doFetch = async () => {
    const controller = new AbortController()
    const timeout = options.timeoutMs
      ? window.setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined

    try {
      return await fetch(`${browserApiBase}${path}`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Request timed out. Please check provider connectivity and try again.')
      }
      throw error
    } finally {
      if (timeout) {
        window.clearTimeout(timeout)
      }
    }
  }

  return parseResponse<T>(await doFetch(), doFetch)
}

export async function clientUploadApi<T>(path: string, formData: FormData): Promise<T> {
  // No Content-Type header here on purpose: the browser sets the multipart
  // boundary itself when the body is a FormData instance.
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders(),
      body: formData,
    })
  return parseResponse<T>(await doFetch(), doFetch)
}

export async function clientPatchApi<T>(path: string, payload: unknown): Promise<T> {
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: buildAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    })
  return parseResponse<T>(await doFetch(), doFetch)
}

export async function clientDeleteApi<T>(path: string): Promise<T> {
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildAuthHeaders(),
    })
  return parseResponse<T>(await doFetch(), doFetch)
}

function buildAuthHeaders(baseHeaders: Record<string, string> = {}) {
  const token = getBrowserAdminToken()

  return token
    ? {
        ...baseHeaders,
        Authorization: `Bearer ${token}`,
      }
    : baseHeaders
}

function normalizeErrorMessage(message: string | string[] | undefined) {
  if (!message) {
    return 'Request failed'
  }

  return Array.isArray(message) ? message.join(', ') : message
}

async function parseResponse<T>(response: Response, retryWith?: () => Promise<Response>): Promise<T> {
  // A 401 here means the JwtAuthGuard rejected the request before it reached
  // any handler — nothing was processed server-side, so silently refreshing
  // and replaying the exact same request once is always safe, never a
  // duplicate submission.
  if (response.status === 401 && retryWith) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return parseResponse<T>(await retryWith())
    }
  }

  const body = (await response.json().catch(() => ({}))) as ApiErrorPayload
  if (response.status === 401) {
    clearBrowserAdminSession()

    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }

    throw new Error('Session expired. Please sign in again.')
  }

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(body.message))
  }

  return body as T
}
