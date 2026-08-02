// js/games.js - بازی چرخوندن بطری 🍾
import { ALLOWED_USERS, USERS_DATABASE } from './config.js'
import { getCurrentUser } from './auth.js'

export function initGames(user) {
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => {
            const gameName = card.dataset.game
            if (gameName === 'bottle') openBottleGame()
        })
    })
}

// این تابع رو اضافه کن 👇
function getAvatarHTML(avatar) {
    if (!avatar) return '👤'
    // اگه مسیر فایله یا شامل نقطه‌ست (پسوند فایل داره)
    if (avatar.includes('/') || avatar.includes('.png') || avatar.includes('.jpg') || avatar.includes('.jpeg') || avatar.includes('.gif')) {
        return `<img src="${avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
    }
    // اگه ایموجی یا تکست سادست
    return avatar
}

function openBottleGame() {
    const currentUser = getCurrentUser()
    
    // لیست همه کاربران
    const players = ALLOWED_USERS.map(name => ({
        name,
        avatar: USERS_DATABASE[name]?.avatar || '👤',
        color: USERS_DATABASE[name]?.color || '#6c5ce7'
    }))
    
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
        <div class="custom-modal bottle-modal">
            <div class="modal-title" style="font-size:22px; margin-bottom:4px;">🍾 چرخوندن بطری</div>
            <div class="modal-message">بچرخون ببینیم کی انتخاب میشه!</div>
            
            <!-- بطری -->
            <div class="bottle-container">
                <div class="bottle" id="bottle">
                    <span class="bottle-emoji">🍾</span>
                </div>
                <div class="bottle-shadow"></div>
            </div>
            
            <!-- اسم انتخاب شده -->
            <div id="bottle-result" class="bottle-result">
                <span class="result-text">آماده‌ای؟</span>
            </div>
            
            <!-- دکمه‌ها -->
            <div class="modal-buttons" style="margin-top:20px;">
                <button class="modal-btn primary" id="spin-btn">
                    🎯 بچرخون
                </button>
                <button class="modal-btn cancel" id="bottle-close">
                    بستن
                </button>
            </div>
            
            <!-- لیست بازیکنان -->
            <div class="players-circle" id="players-circle">
                ${players.map((p, i) => `
                    <div class="player-dot" style="
                        --angle: ${(i / players.length) * 360}deg;
                        --color: ${p.color};
                    " title="${p.name}">
                        <span class="player-avatar">${getAvatarHTML(p.avatar)}</span>
                        <span class="player-name">${p.name}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `
    
    document.body.appendChild(overlay)
    
    const bottle = overlay.querySelector('#bottle')
    const resultDiv = overlay.querySelector('#bottle-result')
    const resultText = overlay.querySelector('.result-text')
    const spinBtn = overlay.querySelector('#spin-btn')
    let isSpinning = false
    
    overlay.querySelector('#bottle-close').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove()
    })
    
    spinBtn.addEventListener('click', () => {
        if (isSpinning) return
        isSpinning = true
        
        const randomIndex = Math.floor(Math.random() * players.length)
        const selectedPlayer = players[randomIndex]
        
        const spins = 5
        const targetAngle = (randomIndex / players.length) * 360
        const totalRotation = (spins * 360) + (360 - targetAngle) + Math.floor(Math.random() * 30)
        
        bottle.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
        bottle.style.transform = `rotate(${totalRotation}deg)`
        
        spinBtn.disabled = true
        spinBtn.textContent = '⏳ در حال چرخش...'
        spinBtn.style.opacity = '0.7'
        
        resultDiv.classList.remove('show')
        
        playTickSound()
        
        setTimeout(() => {
            bottle.style.transition = 'transform 0.3s ease'
            
            // اینجا هم getAvatarHTML استفاده کن 👇
            resultText.innerHTML = `
                <span class="selected-avatar">${getAvatarHTML(selectedPlayer.avatar)}</span>
                <span class="selected-name">${selectedPlayer.name}</span>
                <span class="selected-label">انتخاب شد! 🎉</span>
            `
            resultDiv.classList.add('show')
            
            highlightPlayer(randomIndex)
            
            spinBtn.disabled = false
            spinBtn.textContent = '🔄 دوباره بچرخون'
            spinBtn.style.opacity = '1'
            
            isSpinning = false
            
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100])
            }
        }, 3200)
    })
    
    function highlightPlayer(index) {
        const dots = overlay.querySelectorAll('.player-dot')
        dots.forEach((dot, i) => {
            if (i === index) {
                dot.classList.add('selected')
                dot.style.transform = `rotate(var(--angle)) translateY(-80px) scale(1.5)`
                dot.style.zIndex = '10'
                dot.querySelector('.player-name').style.opacity = '1'
            } else {
                dot.classList.remove('selected')
                dot.style.transform = `rotate(var(--angle)) translateY(-65px)`
                dot.style.zIndex = '1'
                dot.querySelector('.player-name').style.opacity = '0.5'
            }
        })
    }
    
    function playTickSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
            let tickCount = 0
            const maxTicks = 8
            
            const tickInterval = setInterval(() => {
                if (tickCount >= maxTicks) {
                    clearInterval(tickInterval)
                    return
                }
                
                const osc = audioCtx.createOscillator()
                const gain = audioCtx.createGain()
                osc.connect(gain)
                gain.connect(audioCtx.destination)
                
                osc.frequency.value = 800 + (tickCount * 100)
                gain.gain.value = 0.05
                
                osc.start()
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1)
                osc.stop(audioCtx.currentTime + 0.1)
                
                tickCount++
            }, 350)
        } catch (e) {}
    }
}