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
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put('./', res.clone())); return res }).catch(() => caches.match('./')),
    )
    return
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()))
      return res
    })),
  )
})
