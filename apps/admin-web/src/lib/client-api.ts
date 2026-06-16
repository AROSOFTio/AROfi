import { clearBrowserAdminSession, getBrowserAdminToken } from './admin-session'

type ApiErrorPayload = {
  message?: string | string[]
}

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

export async function clientFetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${browserApiBase}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: buildAuthHeaders(),
  })
  return parseResponse<T>(response)
}

export async function clientPostApi<T>(path: string, payload: unknown, options: { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = options.timeoutMs
    ? window.setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined

  let response: Response
  try {
    response = await fetch(`${browserApiBase}${path}`, {
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

  return parseResponse<T>(response)
}

export async function clientPatchApi<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${browserApiBase}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: buildAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
  return parseResponse<T>(response)
}

export async function clientDeleteApi<T>(path: string): Promise<T> {
  const response = await fetch(`${browserApiBase}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: buildAuthHeaders(),
  })
  return parseResponse<T>(response)
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

async function parseResponse<T>(response: Response): Promise<T> {
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
