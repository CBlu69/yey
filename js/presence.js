// js/presence.js — حضور زنده (آنلاین/آفلاین واقعی روی سرور)
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { ALLOWED_USERS, USERS_DATABASE, ADMIN_NAME } from './config.js'

const ONLINE_WINDOW = 90 * 1000      // ۹۰ ثانیه بعد از آخرین heartbeat یعنی آفلاین
const HEARTBEAT_MS = 25000           // هر ۲۵ ثانیه heartbeat

let presenceMap = {}
let heartbeatTimer = null
let dotTimer = null
let channel = null
let membersModalOpen = false

export function initPresence() {
    const user = getCurrentUser()
    if (!user) return

    heartbeat()
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS)

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) heartbeat()
    })
    window.addEventListener('beforeunload', () => reportOffline())
    navigator.connection?.addEventListener?.('change', () => { if (navigator.onLine) heartbeat() })

    watch()
    renderDots()
    dotTimer = setInterval(() => { renderDots(); updateMembersModal() }, 5000)
}

async function heartbeat() {
    const cu = getCurrentUser()
    if (!cu || !navigator.onLine) return
    try {
        await supabase.from('user_presence').upsert({
            user_id: String(cu.id),
            user_name: cu.name,
            user_avatar: cu.avatar || '👤',
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
    } catch (e) { }
}

function reportOffline() {
    const cu = getCurrentUser()
    if (!cu) return
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    try {
        void supabase.from('user_presence').upsert({
            user_id: String(cu.id), user_name: cu.name, last_seen: old
        }, { onConflict: 'user_id' })
    } catch (e) { }
}

// ============ دیتای حضور ============
export function isOnline(userId) {
    if (!userId) return false
    const row = presenceMap[String(userId)]
    if (!row || !row.last_seen) return false
    return (Date.now() - new Date(row.last_seen).getTime()) < ONLINE_WINDOW
}

export function getPresenceFor(userId) {
    return presenceMap[String(userId)] || null
}

export function getOnlineCount() {
    return ALLOWED_USERS.filter(n => USERS_DATABASE[n] && isOnline(USERS_DATABASE[n].id)).length
}

// ============ ریل‌تایم ============
function watch() {
    if (channel) return
    channel = supabase.channel('user-presence-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => {
            refreshPresence(() => {
                renderDots()
                updateMembersModal()
                window.dispatchEvent(new CustomEvent('presence-update'))
            })
        })
        .subscribe()
    refreshPresence()
}

async function refreshPresence(cb) {
    try {
        const { data } = await supabase.from('user_presence').select('*')
        const map = {}
        ;(data || []).forEach(r => { map[String(r.user_id)] = r })
        presenceMap = map
    } catch (e) { }
    if (typeof cb === 'function') cb()
}

// ============ نقطه آنلاین روی تب‌های چت ============
export function renderDots() {
    document.querySelectorAll('.chat-tab[data-user]').forEach(tab => {
        const uid = tab.dataset.user
        tab.querySelector('.presence-dot')?.remove()
        const dot = document.createElement('span')
        dot.className = 'presence-dot'
        dot.classList.toggle('online', isOnline(uid))
        dot.title = isOnline(uid) ? 'آنلاین' : 'آفلاین'
        tab.appendChild(dot)
    })
}

// ============ مودال اعضا + پروفایل ============
window.showMembers = function () {
    refreshPresence(() => {
        membersModalOpen = true
        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.id = 'members-modal'
        overlay.innerHTML = `
            <div class="custom-modal members-modal" style="max-width:440px;">
                <span class="modal-icon">👥</span>
                <div class="modal-title">اعضای گروه</div>
                <div class="modal-message">حضور زنده همه اعضا</div>
                <div id="members-list" style="max-height:60vh;overflow-y:auto;">
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">بستن</button>
                </div>
            </div>`
        document.body.appendChild(overlay)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { overlay.remove(); membersModalOpen = false }
        })
        overlay.querySelector('.modal-btn.cancel').addEventListener('click', () => { overlay.remove(); membersModalOpen = false })
        updateMembersModal()
    })
}

function lastSeenFarsi(row) {
    if (!row || !row.last_seen) return 'هرگز'
    const diff = Date.now() - new Date(row.last_seen).getTime()
    if (diff < 60 * 1000) return 'همین الان'
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' دقیقه پیش'
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' ساعت پیش'
    return new Date(row.last_seen).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' })
}

function updateMembersModal() {
    const list = document.getElementById('members-list')
    if (!list) return
    const cu = getCurrentUser()

    const rows = ALLOWED_USERS.map(name => {
        const info = USERS_DATABASE[name]
        if (!info) return ''
        const online = isOnline(info.id)
        const row = getPresenceFor(info.id)
        const isMe = name === cu?.name
        const role = name === ADMIN_NAME ? 'ادمین' : 'عضو'
        const av = info.avatar || '👤'
        const avImg = (String(av).includes('/') || String(av).includes('.'))
            ? `<img src="${av}">` : av
        return `
            <div class="member-row">
                <div class="member-avatar presence-dot-wrap">
                    ${online ? `<span class="presence-dot online"></span>` : `<span class="presence-dot offline"></span>`}
                    <span class="member-avatar-img">${avImg}</span>
                </div>
                <div class="member-info">
                    <div class="member-name">${name} ${isMe ? '<span class="member-me">(تو)</span>' : ''}</div>
                    <div class="member-status ${online ? 'on' : ''}">
                        ${online ? '🟢 آنلاین' : '⚪ آفلاین · ' + lastSeenFarsi(row)}
                    </div>
                </div>
                <span class="member-role">${role === 'ادمین' ? '👑 ادمین' : ''}</span>
            </div>`
    }).join('')

    list.innerHTML = rows || '<div style="color:var(--text-tertiary);padding:20px;">عضو دیگری نیست</div>'
}

window.addEventListener('beforeunload', () => { membersModalOpen = false })