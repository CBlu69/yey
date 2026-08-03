// sw.js - Service Worker
const CACHE_NAME = 'yey-v2'
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
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
]

// نصب
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache).catch(err => {
                console.log('بعضی فایل‌ها کش نشدن:', err)
            })
        })
    )
    self.skipWaiting()
})

// فعال‌سازی
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

// Fetch
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return
    
    // برای API و WebSocket از شبکه استفاده کن
    if (event.request.url.includes('supabase.co') || event.request.url.includes('openstreetmap.org')) {
        event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
        return
    }
    
    // بقیه: اول کش، بعد شبکه
    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
                const responseClone = response.clone()
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone)
                })
                return response
            }).catch(() => cached)
            
            return cached || fetchPromise
        })
    )
})