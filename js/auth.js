import { ALLOWED_USERS, ADMIN_NAME, ADMIN_CODE, ADMIN_CODE_STORAGE_KEY, USERS_DATABASE } from './config.js'

let currentUser = null

export async function initAuth() {
    const authScreen = document.getElementById('auth-screen')
    const mainScreen = document.getElementById('main-screen')

    const savedUser = localStorage.getItem('currentUser')
    if (savedUser) {
        try {
            const userData = JSON.parse(savedUser)
            if (ALLOWED_USERS.includes(userData.name)) {
                currentUser = userData
                await handleSuccessfulLogin(currentUser)
                authScreen.classList.remove('active')
                mainScreen.classList.add('active')
                return currentUser
            }
        } catch (e) {
            localStorage.removeItem('currentUser')
        }
    }

    setupTypeLogin()

    return new Promise((resolve) => {
        window.resolveAuth = resolve
    })
}

function setupTypeLogin() {
    const input = document.getElementById('nickname-input')
    const loginBtn = document.getElementById('type-login-btn')
    const messageBox = document.getElementById('login-message')
    const container = document.getElementById('auth-container')

    if (!input || !loginBtn) return

    loginBtn.addEventListener('click', () => {
        const name = input.value.trim()
        if (name) attemptLogin(name)
    })

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim()
            if (name) attemptLogin(name)
        }
    })

    input.addEventListener('input', () => {
        if (messageBox) {
            messageBox.style.display = 'none'
            messageBox.className = 'login-message'
        }
    })

    async function attemptLogin(name) {
        const messageBox = document.getElementById('login-message')
        const loginBtn = document.getElementById('type-login-btn')
        const input = document.getElementById('nickname-input')
        const container = document.getElementById('auth-container')

        if (messageBox) {
            messageBox.style.display = 'none'
            messageBox.className = 'login-message'
        }

        if (!ALLOWED_USERS.includes(name)) {
            if (messageBox) {
                messageBox.textContent = '❌ این اسم توی لیست نیست'
                messageBox.className = 'login-message error'
                messageBox.style.display = 'block'
            }

            if (container) {
                container.classList.add('shake')
                setTimeout(() => container.classList.remove('shake'), 500)
            }

            if (input) {
                setTimeout(() => {
                    input.value = ''
                    input.focus()
                }, 1000)
            }

            return
        }

        // ===== ادمین: کد ورود =====
        if (name === ADMIN_NAME) {
            const storedCode = localStorage.getItem(ADMIN_CODE_STORAGE_KEY) || ADMIN_CODE
            if (typeof window.showPrompt === 'function') {
                const entered = await window.showPrompt('🔐 کد ورود ادمین؟')
                if (entered !== storedCode || entered === null) {
                    if (messageBox) {
                        messageBox.textContent = '❌ کد ورود اشتباهه'
                        messageBox.className = 'login-message error'
                        messageBox.style.display = 'block'
                    }
                    if (container) {
                        container.classList.add('shake')
                        setTimeout(() => container.classList.remove('shake'), 500)
                    }
                    if (input) {
                        setTimeout(() => { input.value = ''; input.focus() }, 600)
                    }
                    return
                }
            }
        }

        const userInfo = USERS_DATABASE[name] || {
            id: 'user_' + Date.now(),
            name: name,
            avatar: '👤',
            role: 'member',
            color: '#6c5ce7'
        }

        currentUser = {
            ...userInfo,
            loginTime: new Date().toISOString()
        }

        localStorage.setItem('currentUser', JSON.stringify(currentUser))

        if (messageBox) {
            const av = currentUser.avatar
            let avatarHTML = av
            if (av && (av.includes('/') || av.includes('.'))) {
                avatarHTML = `<img src="${av}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">`
            }
            messageBox.innerHTML = `${avatarHTML} خوش اومدی ${name}`
            messageBox.className = 'login-message success'
            messageBox.style.display = 'block'
        }

        if (loginBtn) {
            loginBtn.disabled = true
            loginBtn.textContent = 'در حال ورود...'
        }

        await new Promise(resolve => setTimeout(resolve, 800))

        const authScreen = document.getElementById('auth-screen')
        const mainScreen = document.getElementById('main-screen')

        if (authScreen) authScreen.classList.remove('active')
        if (mainScreen) mainScreen.classList.add('active')

        markUserOnline(currentUser)

        if (window.resolveAuth) {
            window.resolveAuth(currentUser)
        }

        return currentUser
    }
}

function markUserOnline(user) {
    const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}')
    onlineUsers[user.name] = {
        ...user,
        lastSeen: new Date().toISOString()
    }
    localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers))
}

export async function handleSuccessfulLogin(user) {
    markUserOnline(user)
}

export function getCurrentUser() {
    return currentUser || JSON.parse(localStorage.getItem('currentUser'))
}

export function isAdmin() {
    const user = getCurrentUser()
    return user?.name === ADMIN_NAME
}

export function logout() {
    const user = getCurrentUser()
    if (user) {
        const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}')
        delete onlineUsers[user.name]
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers))
    }

    localStorage.removeItem('currentUser')
    location.reload()
}
export function getUserAvatar(user) {
    if (!user || !user.avatar) return '👤'

    const av = user.avatar

    // اگه ایموجی یا متن سادست
    if (!av.includes('/') && !av.includes('.') && !av.includes('assets')) {
        return av
    }

    // اگه مسیر عکسه - تگ img برمیگردونه
    return `<img src="${av}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`
}

window.addEventListener('beforeunload', () => {
    const user = getCurrentUser()
    if (user) {
        const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}')
        delete onlineUsers[user.name]
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers))
    }
})
