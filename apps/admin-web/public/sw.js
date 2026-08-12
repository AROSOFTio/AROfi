const CACHE_NAME = 'arofi-admin-v5-assets'
const APP_SHELL = ['/brand/arofi-logo-blue.svg', '/brand/arofi-mark-blue.svg', '/brand/arofi-favicon-v2.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  if (
    url.pathname === '/' ||
    url.pathname === '/login' ||
    url.pathname === '/dashboard' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/')
  ) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined)
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/login'))),
  )
})
