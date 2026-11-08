/*
 * InWIF service worker.
 * Makes the wallet installable and shows a friendly page when offline.
 * It deliberately caches NOTHING else — no app code, no data — so every launch
 * runs the latest, verified version of InWIF straight from the network.
 */
const CACHE = 'inwif-offline-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  // Only page navigations get the offline fallback; everything else goes to the network untouched.
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)))
})
