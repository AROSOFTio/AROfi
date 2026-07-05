import { endAdminSession } from './admin-session'

type ApiErrorPayload = {
  message?: string | string[]
}

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

// Authentication is cookie-based: the HttpOnly access cookie rides along on
// every request via credentials: 'include'. No token is ever readable (or
// attachable) from JavaScript.
//
// The access token is short-lived by design (see apps/api auth.module.ts).
// Dedupe concurrent refresh attempts so N simultaneous 401s only trigger one
// /auth/refresh call, not N of them racing each other.
let refreshInFlight: Promise<boolean> | null = null

export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // Success = the API rotated the refresh token and set a fresh
        // HttpOnly access cookie on this response. Nothing to store here.
        const response = await fetch(`${browserApiBase}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        return response.ok
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
        headers: {
          'Content-Type': 'application/json',
        },
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
      body: formData,
    })
  return parseResponse<T>(await doFetch(), doFetch)
}

export async function clientPatchApi<T>(path: string, payload: unknown): Promise<T> {
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  return parseResponse<T>(await doFetch(), doFetch)
}

export async function clientDeleteApi<T>(path: string): Promise<T> {
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  return parseResponse<T>(await doFetch(), doFetch)
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
    void endAdminSession()

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
