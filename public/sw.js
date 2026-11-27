const CACHE = 'paddl-__BUILD__'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png']))
      // First visit: nothing is running yet, so there is nothing to interrupt, so start working straight away
      // (this is what makes the app available offline). An update waits for the host instead (see 'message').
      .then(() => (self.registration.active ? undefined : self.skipWaiting())),
  )
})

// The app asks the waiting worker to take over only when the host chooses to reload.
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  // Copy a good response into the cache. The copy MUST be taken before the response is handed to the page: once the page
  // starts reading the body, cloning it fails, and (as this used to be written) every put silently failed, so the
  // JavaScript and CSS were never stored for offline use. Only successful responses are kept, so a 404 page from a
  // mistyped address can never replace the app. waitUntil keeps the worker alive until the write has finished.
  const keep = (key, res) => {
    if (!res || !res.ok) return
    const copy = res.clone()
    e.waitUntil(caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {}))
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => { keep('./', res); return res }).catch(() => caches.match('./')),
    )
    return
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => { keep(req, res); return res })),
  )
})
