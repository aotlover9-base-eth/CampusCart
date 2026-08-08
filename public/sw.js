/*
 * CampusCart service worker.
 *
 * Deliberately conservative. Marketplace content goes stale fast — a cached
 * listing that has already sold is worse than a spinner — so this never serves
 * stale HTML or API data. It does three things:
 *
 *   1. Pre-caches the offline page and the app icons.
 *   2. Serves immutable, content-addressed uploads and build assets cache-first.
 *   3. Falls back to the offline page when a navigation fails with no network.
 *
 * API responses are never cached.
 */

const VERSION = 'v1'
const SHELL_CACHE = `campuscart-shell-${VERSION}`
const ASSET_CACHE = `campuscart-assets-${VERSION}`

const OFFLINE_URL = '/offline'

const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/icon-512.png', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individual failures shouldn't abort the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** Content-addressed or build-hashed, so a cache hit is always correct. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/brand/')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache API traffic — auth state and listing data must stay live.
  if (url.pathname.startsWith('/api/')) return

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  // Navigations: always try the network, fall back to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((hit) => hit ?? Response.error()),
      ),
    )
  }
})
