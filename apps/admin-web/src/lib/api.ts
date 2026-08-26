import { cache } from 'react'
import { cookies } from 'next/headers'
import type { AdminSessionResponse } from './admin-types'
import { adminAuthCookieName } from './admin-session'

const API_SERVER_URL = process.env.API_SERVER_URL ?? 'http://127.0.0.1:3000/api'

// React cache is scoped to the server render/request. Include the auth token in
// the cache key so identical reads inside one render collapse to one API call
// without ever sharing authenticated data between users.
const fetchAuthenticatedApi = cache(
  async (path: string, token?: string): Promise<unknown | null> => {
    try {
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

      return await response.json()
    } catch {
      return null
    }
  },
)

export async function fetchApi<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(adminAuthCookieName)?.value
  return (await fetchAuthenticatedApi(path, token)) as T | null
}

// A dashboard render can ask for the current session from both its shared
// layout and its page. Keep the named helper for call-site clarity; the lower
// level authenticated fetch cache also protects any other duplicate endpoint
// reads in the same render.
export const getAdminSession = cache(
  async (): Promise<AdminSessionResponse | null> => fetchApi<AdminSessionResponse>('/auth/me'),
)

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
