type ApiErrorPayload = {
  message?: string | string[]
}

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

export async function clientFetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${browserApiBase}${path}`, {
    cache: 'no-store',
  })
  return parseResponse<T>(response)
}

export async function clientPostApi<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${browserApiBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return parseResponse<T>(response)
}

function normalizeErrorMessage(message: string | string[] | undefined) {
  if (!message) {
    return 'Request failed'
  }

  return Array.isArray(message) ? message.join(', ') : message
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorPayload
  if (!response.ok) {
    throw new Error(normalizeErrorMessage(body.message))
  }

  return body as T
}
