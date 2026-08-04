// sw.js — کش هوشمند: هر تغییر در فایل‌ها → نسخه جدید
// ⚠️ بعد از هر تغییر، CACHE_NAME و CACHE_BUST را عوض کن تا همه نسخه جدید بگیرند
const CACHE_NAME = 'yey-v6'
const CACHE_BUST = '20260804b'

const coreFiles = [
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
    '/js/notifications.js',
    '/js/presence.js',
    '/js/calendar.js',
    '/manifest.json'
]

// فایل‌هایی که همیشه تازه خوانده می‌شوند (نسخه‌بندی با CACHE_BUST)
const networkFirst = ['/', '/index.html', '/css/style.css', '/js/app.js', '/js/auth.js', '/js/chat.js', '/js/map.js', '/js/games.js', '/js/expenses.js', '/js/memories.js', '/js/notifications.js', '/js/presence.js', '/js/calendar.js']

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(coreFiles).catch(err => {
                console.log('Some files not cached:', err)
            })
        }).then(() => self.skipWaiting())
    )
})

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
            )
        }).then(() => self.clients.claim())
    )
})

// خبر دادن به اپ که نسخه جدید نصب شده
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

function isNetworkFirst(url) {
    const path = url.pathname + url.search
    return networkFirst.some(f => path.startsWith(f)) || (url.pathname.includes(CACHE_BUST))
}

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return

    const url = new URL(event.request.url)

    // فقط برای همین اپ (یا CDN فایل‌های دیتابیس)
    if (url.origin === location.origin && isNetworkFirst(url)) {
        // شبکه اول، کش به عنوان پشتیبان
        event.respondWith(
            fetch(event.request).then(response => {
                const clone = response.clone()
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
                return response
            }).catch(() => caches.match(event.request))
        )
        return
    }

    // کش اول (تصاویر، آیکون‌ها، CDN) — با به‌روزرسانی در پس‌زمینه
    if (url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/'))) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                const fetchPromise = fetch(event.request).then(response => {
                    const clone = response.clone()
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
                    return response
                }).catch(() => cached)
                if (cached) {
                    fetchPromise.then(() => {})
                    return cached
                }
                return fetchPromise
            })
        )
        return
    }

    // بقیه: از کش برمی‌گرده
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                const clone = response.clone()
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
                return response
            })
        })
    )
})