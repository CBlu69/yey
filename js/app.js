// js/app.js
import { initAuth, getCurrentUser, logout } from './auth.js'
import { initChat } from './chat.js'
import { initMap } from './map.js'
import { initGames } from './games.js'
import { initExpenses } from './expenses.js'
import { initMemories } from './memories.js'

let currentUser = null

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