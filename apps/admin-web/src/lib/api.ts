const API_SERVER_URL = process.env.API_SERVER_URL ?? 'http://127.0.0.1:3000/api'

export async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_SERVER_URL}${path}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}
