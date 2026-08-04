// js/app.js
import { initAuth, getCurrentUser, logout } from './auth.js'
import { initChat } from './chat.js'
import { initMap } from './map.js'
import { initGames } from './games.js'
import { initExpenses } from './expenses.js'
import { initMemories } from './memories.js'

let currentUser = null

// ==================== تم رنگی ====================
const THEMES = ['purple', 'dark', 'blue', 'green', 'pink', 'orange']

const savedTheme = localStorage.getItem('yey-theme')
if (savedTheme && THEMES.includes(savedTheme)) {
    document.documentElement.dataset.theme = savedTheme
}

function applyTheme(theme) {
    if (THEMES.includes(theme)) {
        document.documentElement.dataset.theme = theme
        localStorage.setItem('yey-theme', theme)
    }
}

function setupThemePicker() {
    const btn = document.getElementById('theme-btn')
    if (!btn) return

    btn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme || 'purple'
        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal" style="max-width:420px;">
                <span class="modal-icon">🎨</span>
                <div class="modal-title">تم رنگی</div>
                <div class="modal-message">یه تم انتخاب کن:</div>
                <div class="theme-grid">
                    ${THEMES.map(t => `<button class="theme-swatch ${t === current ? 'active' : ''}" data-theme="${t}"></button>`).join('')}
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">بستن</button>
                </div>
            </div>`
        document.body.appendChild(overlay)

        overlay.querySelectorAll('.theme-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                applyTheme(sw.dataset.theme)
                overlay.remove()
            })
        })
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    })
}

// ==================== ریپل کلیک ====================
document.addEventListener('click', (e) => {
    const target = e.target.closest('.login-btn, .modal-btn, .chat-input button, .map-btn, .nav-item, .game-card, .upload-btn, .submit-expense-btn, .memory-view-btn, .memory-delete-btn, .voice-play-btn, .reaction-emoji, .reaction-badge, .message-menu button, .theme-swatch')
    if (!target) return
    const rect = target.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const ripple = document.createElement('span')
    ripple.className = 'ripple'
    ripple.style.width = ripple.style.height = `${size}px`
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`
    target.appendChild(ripple)
    setTimeout(() => ripple.remove(), 700)
})

// ==================== تیلت سه‌بعدی کارت‌های بازی ====================
function setupTiltEffects() {
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const r = card.getBoundingClientRect()
            const x = (e.clientX - r.left) / r.width - 0.5
            const y = (e.clientY - r.top) / r.height - 0.5
            card.style.transform = `perspective(600px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-4px)`
        })
        card.addEventListener('mouseleave', () => {
            card.style.transform = ''
        })
    })
}

// ==================== توابع جایگزین alert و confirm ====================

// جایگزین alert
window.showAlert = function (message, type = 'info') {
    return new Promise((resolve) => {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: '💬'
        }

        const titles = {
            success: 'موفق',
            error: 'خطا',
            warning: 'هشدار',
            info: 'پیام'
        }

        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal">
                <span class="modal-icon">${icons[type] || icons.info}</span>
                <div class="modal-title">${titles[type] || titles.info}</div>
                <div class="modal-message">${message}</div>
                <div class="modal-buttons">
                    <button class="modal-btn primary" id="alert-ok">باشه</button>
                </div>
            </div>
        `

        document.body.appendChild(overlay)

        const okBtn = overlay.querySelector('#alert-ok')
        okBtn.focus()

        const close = () => {
            overlay.style.animation = 'overlayOut 0.2s ease forwards'
            overlay.querySelector('.custom-modal').style.animation = 'modalOut 0.2s ease forwards'
            setTimeout(() => overlay.remove(), 200)
            resolve()
        }

        okBtn.addEventListener('click', close)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close()
        })
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                close()
                document.removeEventListener('keydown', escHandler)
            }
        })
    })
}

// جایگزین confirm
window.showConfirm = function (message, title = 'مطمئنی؟') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal">
                <span class="modal-icon">🤔</span>
                <div class="modal-title">${title}</div>
                <div class="modal-message">${message}</div>
                <div class="modal-buttons">
                    <button class="modal-btn danger" id="confirm-yes">بله</button>
                    <button class="modal-btn cancel" id="confirm-no">خیر</button>
                </div>
            </div>
        `

        document.body.appendChild(overlay)

        const yesBtn = overlay.querySelector('#confirm-yes')
        const noBtn = overlay.querySelector('#confirm-no')
        noBtn.focus()

        const close = (result) => {
            overlay.style.animation = 'overlayOut 0.2s ease forwards'
            overlay.querySelector('.custom-modal').style.animation = 'modalOut 0.2s ease forwards'
            setTimeout(() => overlay.remove(), 200)
            resolve(result)
        }

        yesBtn.addEventListener('click', () => close(true))
        noBtn.addEventListener('click', () => close(false))
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false)
        })
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                close(false)
                document.removeEventListener('keydown', escHandler)
            }
        })
    })
}

// جایگزین prompt
window.showPrompt = function (message, defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal">
                <span class="modal-icon">✍️</span>
                <div class="modal-title">${message}</div>
                <div class="modal-message">
                    <input type="text" 
                           id="prompt-input" 
                           class="prompt-input" 
                           value="${defaultValue}"
                           autofocus
                           style="width:100%; padding:12px 16px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:12px; color:var(--text-primary); font-size:14px; font-family: inherit; outline:none; text-align:center;">
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn primary" id="prompt-ok">تایید</button>
                    <button class="modal-btn cancel" id="prompt-cancel">لغو</button>
                </div>
            </div>
        `

        document.body.appendChild(overlay)

        const input = overlay.querySelector('#prompt-input')
        const okBtn = overlay.querySelector('#prompt-ok')
        const cancelBtn = overlay.querySelector('#prompt-cancel')

        input.focus()
        input.select()

        const close = (result) => {
            overlay.style.animation = 'overlayOut 0.2s ease forwards'
            overlay.querySelector('.custom-modal').style.animation = 'modalOut 0.2s ease forwards'
            setTimeout(() => overlay.remove(), 200)
            resolve(result)
        }

        okBtn.addEventListener('click', () => close(input.value.trim()))
        cancelBtn.addEventListener('click', () => close(null))
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') close(input.value.trim())
        })
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(null)
        })
    })
}

// Toast notification
window.showToast = function (message, type = 'info', duration = 3000) {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: '💬'
    }

    let container = document.querySelector('.toast-container')
    if (!container) {
        container = document.createElement('div')
        container.className = 'toast-container'
        document.body.appendChild(container)
    }

    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span>${message}</span>
    `

    container.appendChild(toast)

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards'
        setTimeout(() => toast.remove(), 300)
    }, duration)
}

// ==================== مدیریت تب‌ها ====================
function handleTabs() {
    const navItems = document.querySelectorAll('.nav-item')
    const tabPanes = document.querySelectorAll('.tab-pane')

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.dataset.tab

            navItems.forEach(nav => nav.classList.remove('active'))
            item.classList.add('active')

            tabPanes.forEach(pane => pane.classList.remove('active'))

            const targetPane = document.getElementById(`tab-${tabName}`)
            if (targetPane) {
                targetPane.classList.add('active')
                if (tabName === 'map') {
                    setTimeout(() => {
                        const m = window.getMap?.()
                        if (m) {
                            m.invalidateSize()
                        }
                    }, 400)
                }
                // وقتی تب expenses باز میشه
                if (tabName === 'expenses') {
                    setTimeout(() => {
                        if (window.initExpensesTab) {
                            window.initExpensesTab(currentUser)
                        }
                    }, 200)
                }
            }
        })
    })
}
// ==================== راه‌اندازی ماژول‌ها ====================
function initAllModules(user) {
    if (!user) return

    try {
        initChat(user)
        initMap(user)
        initGames(user)
        initMemories(user)
        setupThemePicker()
        setupTiltEffects()

        // expenses رو با تاخیر صدا بزن
        setTimeout(() => {
            initExpenses(user)
        }, 300)
    } catch (error) {
        console.error('Error:', error)
    }
}
// ==================== خروج ====================
const logoutBtn = document.getElementById('logout-btn')
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        const confirmed = await window.showConfirm('می‌خوای از اپ خارج بشی؟', 'خروج از حساب')
        if (confirmed) {
            logout()
        }
    })
}

// ==================== شروع برنامه ====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        currentUser = await initAuth()

        if (currentUser) {
            handleTabs()
            initAllModules(currentUser)
        }
    } catch (error) {
        console.error('Error starting app:', error)
    }
})

// ==================== انیمیشن‌های خروج ====================
const style = document.createElement('style')
style.textContent = `
    @keyframes overlayOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
    @keyframes modalOut {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(20px) scale(0.95); }
    }
`
document.head.appendChild(style)