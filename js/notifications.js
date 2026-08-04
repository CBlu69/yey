// js/notifications.js — نوتیفیکیشن (منشن، تسویه، پیام جدید، رویداد)
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

let channel = null
let beenInteractive = false

export function initNotifications() {
    requestPermission()
    watchNotifications()
}

async function requestPermission() {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return
    try {
        const result = await Notification.requestPermission()
        beenInteractive = true
        if (result === 'granted') {
            window.showToast?.('🔔 نوتیفیکیشن فعال شد', 'success')
        }
    } catch (e) { }
}

export function notificationGranted() {
    return 'Notification' in window && Notification.permission === 'granted'
}

// ============ تماشای جدول نوتیفیکیشن‌ها (تولیدشده توسط سرور) ============
function watchNotifications() {
    const cu = getCurrentUser()
    if (!cu || channel) return

    channel = supabase.channel('my-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
            const n = payload.new
            if (!n || String(n.user_id) !== String(cu.id)) return

            // جلوگیری از تکرار (کلید یکتا)
            const recent = JSON.parse(localStorage.getItem('yey-notif-recent') || '[]')
            const key = n.notif_key || ('n-' + n.id)
            if (recent.includes(key)) return
            recent.unshift(key)
            localStorage.setItem('yey-notif-recent', JSON.stringify(recent.slice(0, 20)))

            handleNotification(n)
        })
        .subscribe()

    // نوتیفیکیشن‌های خوانده‌نشده هنگام شروع
    markAllRead()
}

async function markAllRead() {
    const cu = getCurrentUser()
    if (!cu) return
    try {
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', String(cu.id))
    } catch (e) { }
}

function handleNotification(n) {
    const type = n.notif_type || 'message'
    const title = n.title || 'اعلان جدید'
    const body = n.body || ''
    const icon = n.icon || '💬'

    const important = type === 'mention' || type === 'settlement' || type === 'event'
    const pageHidden = document.visibilityState === 'hidden'

    // همیشه یک توست آرام در اپ
    window.showToast?.(`${icon} ${body}`, type === 'mention' ? 'warning' : 'info')

    // نوتیفیکیشن سیستمی: page مخفی یا پیام‌های مهم
    if (pageHidden || important || !document.hasFocus()) {
        if (notificationGranted()) {
            try {
                const notif = new Notification(title, {
                    body,
                    icon: icon,
                    tag: keyForTag(n),
                    silent: !important
                })
                notif.onclick = () => {
                    window.focus()
                    try {
                        const tab = (n.link || '').replace('/#', '')
                        const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`)
                        if (btn) btn.click()
                    } catch (e) { }
                    notif.close()
                }
            } catch (e) { }
        }
    }
}

function keyForTag(n) {
    return (n.notif_key || n.id).replace(/\s+/g, '-')
}

// ============ نوتیفیکیشن دستی (مثلاً از تقویم / اعلان محلی) ============
export function notifyLocal(title, body, type = 'info', icon = '💬') {
    handleNotification({ title, body, notif_type: type, icon, notif_key: 'local-' + Date.now() })
}

// ============ متدوب پشتیبانی از push در سرویس‌ورکر (آماده برای آینده) ============
export function subscribeToPush() {
    if (!notificationGranted()) return
    if (!('serviceWorker' in navigator)) return
    // برای push واقعیِ پس‌زمینه به یک سرور + VAPID key نیاز داری.
    // این تابع فقط آماده‌سازی اشتراک‌گذاری pushManager هست.
    navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
            if (sub) return
            // summer: applicationServerKey از پرامتر سربرگ شما
            console.log('👷 PushManager آماده است (بدون VAPID key فعلاً).')
        }).catch(() => { })
    })
}