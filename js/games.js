// js/games.js
import { ALLOWED_USERS, USERS_DATABASE } from './config.js'
import { getCurrentUser } from './auth.js'

// ============ تابع کمکی آواتار ============
function getAvatarHTML(avatar) {
    if (!avatar) return '👤'
    if (avatar.includes('/') || avatar.includes('.png') || avatar.includes('.jpg') || avatar.includes('.jpeg') || avatar.includes('.gif')) {
        return `<img src="${avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
    }
    return avatar
}

// ============ گرفتن لیست همه بازیکن‌ها ============
function getAllPlayers() {
    return ALLOWED_USERS.map(name => ({
        id: USERS_DATABASE[name]?.id || name,
        name,
        avatar: USERS_DATABASE[name]?.avatar || '👤',
        color: USERS_DATABASE[name]?.color || '#d4a017'
    }))
}

// ============ مودال انتخاب بازیکن ============
function showPlayerSelector(title, callback, minPlayers = 2) {
    const allPlayers = getAllPlayers()
    
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
        <div class="custom-modal player-selector-modal" style="min-width:360px;max-width:450px;">
            <span class="modal-icon" style="font-size:40px;display:block;">👥</span>
            <div class="modal-title" style="font-size:20px;margin-bottom:4px;">${title}</div>
            <div class="modal-message">بازیکن‌ها رو انتخاب کن</div>
            
            <div class="player-check-list">
                ${allPlayers.map(p => `
                    <label class="player-check-item">
                        <input type="checkbox" class="player-checkbox" value="${p.name}" checked>
                        <span class="player-check-avatar">${getAvatarHTML(p.avatar)}</span>
                        <span class="player-check-name">${p.name}</span>
                    </label>`).join('')}
            </div>
            
            <div class="modal-buttons" style="margin-top:16px;">
                <button class="modal-btn cancel" id="select-all-btn">✅ انتخاب همه</button>
                <button class="modal-btn primary" id="confirm-players-btn">🎮 شروع بازی</button>
            </div>
            <button class="modal-btn cancel" id="ps-close" style="margin-top:8px;width:100%;">بستن</button>
        </div>`
    document.body.appendChild(overlay)

    const checkboxes = overlay.querySelectorAll('.player-checkbox')
    const confirmBtn = overlay.querySelector('#confirm-players-btn')

    overlay.querySelector('#select-all-btn').addEventListener('click', () => {
        const allChecked = [...checkboxes].every(c => c.checked)
        checkboxes.forEach(c => c.checked = !allChecked)
        overlay.querySelector('#select-all-btn').textContent = allChecked ? '✅ انتخاب همه' : '❌ هیچکدوم'
    })

    confirmBtn.addEventListener('click', () => {
        const selected = []
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const p = allPlayers.find(p => p.name === cb.value)
                if (p) selected.push(p)
            }
        })
        
        if (selected.length < minPlayers) {
            window.showToast?.(`حداقل ${minPlayers} نفر لازمه!`, 'warning')
            return
        }
        
        overlay.remove()
        callback(selected)
    })

    overlay.querySelector('#ps-close').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
}

// ============ init ============
export function initGames(user) {
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => {
            const gameName = card.dataset.game
            if (gameName === 'bottle') showPlayerSelector('🍾 چرخوندن بطری', openBottleGame)
            if (gameName === 'truth-dare') showPlayerSelector('🔥 حقیقت یا جرأت', openTruthDareGame)
            if (gameName === 'spy') showPlayerSelector('🕵️ اسپای', openSpyGame, 3)
        })
    })
}

// ==================== 🍾 بطری ====================
function openBottleGame(players) {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
        <div class="custom-modal bottle-modal">
            <div class="modal-title" style="font-size:22px; margin-bottom:4px;">🍾 چرخوندن بطری</div>
            <div class="modal-message">بچرخون ببینیم کی انتخاب میشه!</div>
            <div class="bottle-container">
                <div class="bottle" id="bottle"><span class="bottle-emoji">🍾</span></div>
                <div class="bottle-shadow"></div>
            </div>
            <div id="bottle-result" class="bottle-result"><span class="result-text">آماده‌ای؟</span></div>
            <div class="modal-buttons" style="margin-top:20px;">
                <button class="modal-btn primary" id="spin-btn">🎯 بچرخون</button>
                <button class="modal-btn cancel" id="bottle-close">بستن</button>
            </div>
            <div class="players-circle" id="players-circle">
                ${players.map((p, i) => `
                    <div class="player-dot" style="--angle:${(i/players.length)*360}deg;--color:${p.color};" title="${p.name}">
                        <span class="player-avatar">${getAvatarHTML(p.avatar)}</span>
                        <span class="player-name">${p.name}</span>
                    </div>`).join('')}
            </div>
        </div>`
    document.body.appendChild(overlay)

    const bottle = overlay.querySelector('#bottle')
    const resultDiv = overlay.querySelector('#bottle-result')
    const resultText = overlay.querySelector('.result-text')
    const spinBtn = overlay.querySelector('#spin-btn')
    let isSpinning = false

    overlay.querySelector('#bottle-close').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })

    spinBtn.addEventListener('click', () => {
        if (isSpinning) return
        isSpinning = true
        const randomIndex = Math.floor(Math.random() * players.length)
        const selected = players[randomIndex]
        const totalRotation = (5 * 360) + (360 - (randomIndex / players.length) * 360) + Math.floor(Math.random() * 30)

        bottle.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
        bottle.style.transform = `rotate(${totalRotation}deg)`
        spinBtn.disabled = true; spinBtn.textContent = '⏳ در حال چرخش...'; spinBtn.style.opacity = '0.7'
        resultDiv.classList.remove('show')

        setTimeout(() => {
            bottle.style.transition = 'transform 0.3s ease'
            resultText.innerHTML = `<span class="selected-avatar">${getAvatarHTML(selected.avatar)}</span><span class="selected-name">${selected.name}</span><span class="selected-label">انتخاب شد! 🎉</span>`
            resultDiv.classList.add('show')
            spinBtn.disabled = false; spinBtn.textContent = '🔄 دوباره بچرخون'; spinBtn.style.opacity = '1'
            isSpinning = false
            if (navigator.vibrate) navigator.vibrate([100, 50, 100])
        }, 3200)
    })
}

// ==================== 🔥 حقیقت یا جرأت ====================
const truths = [
    'آخرین باری که دروغ گفتی کی بود و چی بود؟', 'بزرگترین ترست چیه که به کسی نگفتی؟',
    'اگه یه روز نامرئی بشی اولین کاری که می‌کنی چیه؟', 'خجالت‌آورترین اتفاق زندگیت چی بوده؟',
    'تا حالا عاشق کی شدی که بهش نگفتی؟', 'آخرین باری که گریه کردی کی بود و چرا؟',
    'مخفی‌ترین استعدادت چیه؟', 'بدترین فکری که تا حالا به ذهنت رسیده چی بوده؟',
    'از کی تو این جمع بیشتر از همه خوشت میاد؟', 'احمقانه‌ترین کاری که تا حالا کردی چی بوده؟',
    'تا حالا کسی رو مخفیانه چک کردی؟ کی رو؟', 'اگه فقط ۲۴ ساعت از عمرت مونده باشه چیکار می‌کنی؟',
    'از کدوم عادت خودت بیشتر از همه بدت میاد؟', 'اگه بتونی یه قانون تو کشور عوض کنی چی رو عوض می‌کنی؟',
    'گرون‌ترین چیزی که تا حالا خریدی و پشیمون شدی چی بوده؟', 'اگه یه حیوون بودی چی بودی و چرا؟'
]

const dares = [
    'یه آهنگ با صدای بلند بخون 🎤', 'با لهجه یه شهر دیگه ۱ دقیقه حرف بزن 🗣️',
    '۲۰ ثانیه با یه پا بشین و پاشو 🦵', 'چشماتو ببند و با یه نفر دیگه دست بده 🤝',
    'یه لیوان آب رو یه نفس بخور 💧', 'اسم همه رو برعکس بگو 🔄',
    'یه جوک تعریف کن، اگه کسی نخندید جریمه میشی 😂', 'با دست چپ یه جمله بنویس ✍️',
    'یه دقیقه مثل ربات حرف بزن 🤖', 'برو بیرون و با اولین چیزی که می‌بینی سلفی بگیر 🤳',
    'صدای یه حیوون رو دربیار 🐔', 'چشم بسته ۱۰ قدم راه برو 🚶',
    'بدون لبخند ۳۰ ثانیه به همه زل بزن 😶', 'شکم‌ت رو نشون بده (اگه راضی نیستی جریمه: ۱۰ شنا) 💪',
    'رقص محلی دربیار 💃', 'یه بیت فری‌استایل بگو 🎵'
]

function openTruthDareGame(players) {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
        <div class="custom-modal truth-dare-modal" style="min-width:380px;max-width:500px;">
            <span class="modal-icon" style="font-size:48px;display:block;">🔥</span>
            <div class="modal-title" style="font-size:22px;margin-bottom:4px;">حقیقت یا جرأت</div>
            <div class="modal-message">یکی رو انتخاب کن، بعد ببین چی درمیاد!</div>
            
            <div class="modal-buttons" style="flex-wrap:wrap;gap:8px;margin-bottom:16px;">
                ${players.map(p => `
                    <button class="modal-btn player-select-btn" data-player="${p.name}" 
                            style="background:${p.color}20;color:#fff;border:1px solid ${p.color}40;display:flex;align-items:center;gap:8px;">
                        <span style="width:28px;height:28px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:16px;">${getAvatarHTML(p.avatar)}</span>
                        ${p.name}
                    </button>`).join('')}
            </div>
            
            <div id="td-choice" style="display:none;">
                <div class="modal-message">حقیقت یا جرأت؟</div>
                <div class="modal-buttons">
                    <button class="modal-btn primary" id="td-truth">💬 حقیقت</button>
                    <button class="modal-btn danger" id="td-dare">⚡ جرأت</button>
                </div>
            </div>
            
            <div id="td-result" style="display:none;margin-top:16px;padding:20px;background:var(--bg-tertiary);border-radius:16px;font-size:18px;font-weight:600;text-align:center;line-height:1.8;"></div>
            
            <button class="modal-btn cancel" id="td-close" style="margin-top:16px;">بستن</button>
        </div>`
    document.body.appendChild(overlay)

    const choiceDiv = overlay.querySelector('#td-choice')
    const resultDiv = overlay.querySelector('#td-result')
    let selectedPlayer = null

    overlay.querySelectorAll('.player-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedPlayer = btn.dataset.player
            overlay.querySelector('.modal-message').textContent = `🎯 ${selectedPlayer} انتخاب شد!`
            overlay.querySelectorAll('.player-select-btn').forEach(b => b.style.opacity = '0.5')
            btn.style.opacity = '1'
            btn.style.boxShadow = '0 0 12px rgba(212,160,23,0.5)'
            choiceDiv.style.display = 'block'
        })
    })

    overlay.querySelector('#td-truth').addEventListener('click', () => {
        const q = truths[Math.floor(Math.random() * truths.length)]
        resultDiv.innerHTML = `💬 <span style="color:#d4a017;">${selectedPlayer}</span>، حقیقت:<br><br>"${q}"`
        resultDiv.style.display = 'block'
        choiceDiv.style.display = 'none'
    })

    overlay.querySelector('#td-dare').addEventListener('click', () => {
        const d = dares[Math.floor(Math.random() * dares.length)]
        resultDiv.innerHTML = `⚡ <span style="color:#ff4757;">${selectedPlayer}</span>، جرأت:<br><br>"${d}"`
        resultDiv.style.display = 'block'
        choiceDiv.style.display = 'none'
    })

    overlay.querySelector('#td-close').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
}

// ==================== 🕵️ اسپای ====================
const spyWordPairs = [
    { word: 'پیتزا', category: 'غذا' },
    { word: 'عروسی', category: 'مراسم' },
    { word: 'فوتبال', category: 'ورزش' },
    { word: 'ساحل', category: 'طبیعت' },
    { word: 'مدرسه', category: 'مکان' },
    { word: 'تولد', category: 'جشن' },
    { word: 'خواب', category: 'روزمره' },
    { word: 'آدم برفی', category: 'زمستان' },
    { word: 'گربه', category: 'حیوان' },
    { word: 'موبایل', category: 'تکنولوژی' },
    { word: 'بازار', category: 'مکان' },
    { word: 'آرایشگاه', category: 'مکان' },
    { word: 'کنسرت', category: 'هنر' },
    { word: 'آشپزخانه', category: 'خانه' },
    { word: 'دزدی', category: 'عمومی' },
]

function openSpyGame(players) {
    const pair = spyWordPairs[Math.floor(Math.random() * spyWordPairs.length)]
    const spyIndex = Math.floor(Math.random() * players.length)

    let currentPlayerIndex = 0

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
        <div class="custom-modal spy-modal" style="min-width:380px;max-width:500px;">
            <span class="modal-icon" style="font-size:48px;display:block;">🕵️</span>
            <div class="modal-title" style="font-size:22px;margin-bottom:4px;">اسپای - جاسوس رو پیدا کن!</div>
            <div class="modal-message" id="spy-message">${players.length} نفر آماده‌ن. دستگاه رو بچرخونید تا هرکس کلمه رو ببینه.</div>
            
            <div id="spy-word-area" style="display:none;padding:24px;background:var(--bg-tertiary);border-radius:16px;margin:16px 0;text-align:center;">
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">دسته‌بندی</div>
                <div style="font-size:28px;font-weight:800;color:#d4a017;">${pair.category}</div>
                <div style="font-size:14px;color:var(--text-secondary);margin-top:16px;">کلمه:</div>
                <div style="font-size:36px;font-weight:900;letter-spacing:4px;" id="spy-word">${pair.word}</div>
                <div style="margin-top:16px;padding:8px 16px;background:#ff475720;border-radius:8px;color:#ff4757;font-size:13px;font-weight:600;" id="spy-warning" style="display:none;">⚠️ تو اسپای هستی! کلمه رو نمی‌دونی!</div>
            </div>

            <div id="spy-current-player" style="display:none;padding:16px;background:var(--bg-tertiary);border-radius:16px;margin:16px 0;text-align:center;">
                <div style="font-size:14px;color:var(--text-secondary);">نوبت</div>
                <div style="font-size:24px;font-weight:700;margin-top:4px;" id="spy-player-name"></div>
            </div>
            
            <div class="modal-buttons" style="flex-wrap:wrap;gap:8px;">
                <button class="modal-btn primary" id="spy-next-btn">👀 شروع (نفر اول کلمه رو ببینه)</button>
                <button class="modal-btn danger" id="spy-reveal-btn" style="display:none;">🔍 افشای اسپای</button>
                <button class="modal-btn cancel" id="spy-close">بستن</button>
            </div>
        </div>`
    document.body.appendChild(overlay)

    const message = overlay.querySelector('#spy-message')
    const wordArea = overlay.querySelector('#spy-word-area')
    const spyWarning = overlay.querySelector('#spy-warning')
    const currentPlayerDiv = overlay.querySelector('#spy-current-player')
    const playerName = overlay.querySelector('#spy-player-name')
    const nextBtn = overlay.querySelector('#spy-next-btn')
    const revealBtn = overlay.querySelector('#spy-reveal-btn')
    const word = overlay.querySelector('#spy-word')

    function showForPlayer(index) {
        wordArea.style.display = 'block'
        currentPlayerDiv.style.display = 'block'
        revealBtn.style.display = 'block'
        
        const p = players[index]
        playerName.innerHTML = `<span style="width:28px;height:28px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-size:16px;vertical-align:middle;margin-left:8px;">${getAvatarHTML(p.avatar)}</span> ${p.name}`

        if (index === spyIndex) {
            word.textContent = '???'
            spyWarning.style.display = 'block'
            nextBtn.textContent = '🙈 فهمیدم، مخفی کن'
            nextBtn.className = 'modal-btn danger'
        } else {
            word.textContent = pair.word
            spyWarning.style.display = 'none'
            nextBtn.textContent = '👌 فهمیدم، مخفی کن'
            nextBtn.className = 'modal-btn danger'
        }
    }

    function hideWord() {
        wordArea.style.display = 'none'
        currentPlayerDiv.style.display = 'none'
        revealBtn.style.display = 'none'
        
        if (currentPlayerIndex < players.length - 1) {
            nextBtn.textContent = `👀 نوبت ${players[currentPlayerIndex + 1].name}`
            nextBtn.className = 'modal-btn primary'
            message.textContent = 'دستگاه رو بده دست نفر بعدی. کسی دیگه نگاه نکنه! 🤫'
        } else {
            nextBtn.textContent = '🎤 حالا بحث کنین!'
            nextBtn.className = 'modal-btn primary'
            message.textContent = `🎤 همه دیدن! حالا بحث کنین. اسپای رو پیدا کنین!`
        }
    }

    nextBtn.addEventListener('click', () => {
        if (wordArea.style.display !== 'none') {
            hideWord()
            currentPlayerIndex++
            if (currentPlayerIndex >= players.length) {
                message.textContent = `🎤 بحث کنین! دسته: "${pair.category}". اسپای رو پیدا کنین!`
                nextBtn.textContent = '🔄 بازی جدید'
                nextBtn.className = 'modal-btn primary'
                nextBtn.onclick = () => {
                    overlay.remove()
                    showPlayerSelector('🕵️ اسپای', openSpyGame, 3)
                }
            }
        } else {
            showForPlayer(currentPlayerIndex)
        }
    })

    revealBtn.addEventListener('click', () => {
        window.showToast?.(`🕵️ اسپای ${players[spyIndex].name} بود!`, 'info')
        message.textContent = `🕵️ اسپای ${players[spyIndex].name} بود! کلمه: "${pair.word}"`
        wordArea.style.display = 'block'
        word.textContent = pair.word
        spyWarning.style.display = 'none'
        currentPlayerDiv.style.display = 'none'
        revealBtn.style.display = 'none'
        nextBtn.textContent = '🔄 بازی جدید'
        nextBtn.className = 'modal-btn primary'
        nextBtn.onclick = () => {
            overlay.remove()
            showPlayerSelector('🕵️ اسپای', openSpyGame, 3)
        }
    })

    overlay.querySelector('#spy-close').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
}