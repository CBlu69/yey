const CACHE_NAME = 'yey-v1'

const urlsToCache = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/chat.js',
    '/js/map.js',
    '/js/games.js',
    '/js/expenses.js',
    '/js/memories.js',
    '/js/supabase.js',
    '/js/config.js',
    '/manifest.json'
]

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache).catch(err => {
                console.log('Some files not cached:', err)
            })
        })
    )
    self.skipWaiting()
})

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
            )
        })
    )
    self.clients.claim()
})

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return
    
    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
                const responseClone = response.clone()
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone)
                })
                return response
            }).catch(() => {
                return cached
            })
            
            return cached || fetchPromise
        })
    )
})