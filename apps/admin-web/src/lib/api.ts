import { cookies } from 'next/headers'
import { adminAuthCookieName } from './admin-session'

const API_SERVER_URL = process.env.API_SERVER_URL ?? 'http://127.0.0.1:3000/api'

export async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const token = (await cookies()).get(adminAuthCookieName)?.value
    const response = await fetch(`${API_SERVER_URL}${path}`, {
      cache: 'no-store',
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

// Unauthenticated, ISR-cacheable fetch for public SEO pages (blog index,
// post detail, sitemap) — unlike fetchApi above, this never sends the admin
// auth cookie and lets Next revalidate the response on a timer instead of
// forcing `no-store` on every request.
export async function fetchPublicApi<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  try {
    const response = await fetch(`${API_SERVER_URL}${path}`, {
      next: { revalidate: revalidateSeconds },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}
