// Offline shell for LifeOS. Pages are network-first so a new deploy is picked up on the next
// open; hashed build assets never change, so they are served from cache once stored.
const CACHE = 'lifeos-shell-v8'
// The folder the app lives in: `/` normally, `/lifeos-web/` on GitHub Pages.
const BASE = new URL(self.registration.scope).pathname
const SHELL = BASE

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

// Safari refuses to render a navigation served from a redirected response, so only plain,
// same-origin, successful responses are stored.
function cacheable(response) {
  return response && response.ok && !response.redirected && response.type === 'basic'
}

// Copying the body drops any redirect flag Safari may still see on the stored response.
async function clean(response) {
  if (!response) return response
  const body = await response.blob()
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable(response)) {
            const copy = response.clone()
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(SHELL, copy)))
          }
          return response
        })
        .catch(async () => (await clean(await caches.match(SHELL))) || Response.error())
    )
    return
  }

  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (cacheable(response)) {
              const copy = response.clone()
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)))
            }
            return response
          })
      )
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || `${BASE}#today`
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client)
      return open ? open.navigate(target).then(() => open.focus()) : clients.openWindow(target)
    })
  )
})
