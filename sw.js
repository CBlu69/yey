const CACHE_NAME = 'yey-v1'
const urlsToCache = ['/', '/index.html', '/css/style.css', '/js/app.js', '/js/auth.js', '/js/chat.js', '/js/map.js', '/js/games.js', '/js/expenses.js', '/js/memories.js', '/js/supabase.js', '/js/config.js', '/manifest.json']

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache).catch(() => {})))
    self.skipWaiting()
})

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))))
    self.clients.claim()
})

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        return res
    }).catch(() => cached)))
})