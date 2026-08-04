// js/expenses.js - نسخه نهایی با Real-time
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

const ALLOWED_USERS = ['مهدی', 'صادق', 'آرزو', 'دنیز']
const USERS_DATABASE = {
    'مهدی': { id: 'user_001', name: 'مهدی', avatar: 'assets/avatars/mehdi.png', color: '#6C5CE7' },
    'صادق': { id: 'user_002', name: 'صادق', avatar: 'assets/avatars/sadegh.png', color: '#c90c0c' },
    'آرزو': { id: 'user_003', name: 'آرزو', avatar: 'assets/avatars/arezo.png', color: '#0051ff' },
    'دنیز': { id: 'user_004', name: 'دنیز', avatar: 'assets/avatars/deniz.png', color: '#00f7ff' }
}

let realtimeSetup = false

export function initExpenses(user) {}

window.initExpensesTab = function (user) {
    const payerSelect = document.getElementById('expense-paid-by')
    const listDiv = document.getElementById('expenses-list')
    const formEl = document.getElementById('expense-form')
    const balanceDiv = document.getElementById('balance-summary')
    const settDiv = document.getElementById('settlements-list')
    const participantsContainer = document.getElementById('participants-container')

    if (!payerSelect || !listDiv || !formEl) return

    fillSelectAndParticipants()
    loadAllData()
    setupRealtime()

    formEl.onsubmit = async (e) => {
        e.preventDefault()
        const desc = document.getElementById('expense-desc').value.trim()
        const amount = document.getElementById('expense-amount').value.trim()
        const paidBy = payerSelect.value
        const cu = getCurrentUser()
        const checked = document.querySelectorAll('.participant-check:checked')
        const participants = Array.from(checked).map(cb => cb.value)

        if (!desc || !amount || !paidBy) return window.showToast('همه فیلدها رو پر کن', 'warning')
        if (!participants.includes(paidBy)) participants.push(paidBy)
        if (participants.length < 2) return window.showToast('حداقل ۲ نفر رو انتخاب کن', 'warning')

        const payer = USERS_DATABASE[paidBy] || { avatar: '👤', color: '#6c5ce7' }
        const { error } = await supabase.from('expenses').insert([{
            description: desc, amount: parseInt(amount), paid_by: paidBy,
            paid_by_avatar: payer.avatar, paid_by_color: payer.color,
            participants: participants, participant_count: participants.length,
            user_id: cu?.id, user_name: cu?.name, created_at: new Date().toISOString()
        }])

        if (error) return window.showToast('خطا', 'error')
        window.showToast('✅ ثبت شد', 'success')
        formEl.reset()
        const selEl = document.getElementById('expense-paid-by-selected')
        if (selEl) selEl.textContent = '👤 کی پرداخت کرد؟'
        document.querySelectorAll('.payer-option').forEach(o => o.classList.remove('selected'))
        document.querySelectorAll('.participant-check').forEach(cb => cb.checked = true)
        loadAllData()
    }

    function fillSelectAndParticipants() {
        document.querySelector('.payer-select')?.remove()
        payerSelect.innerHTML = '<option value="">👤 کی پرداخت کرد؟</option>'
        ALLOWED_USERS.forEach(name => {
            const u = USERS_DATABASE[name]
            if (!u) return
            payerSelect.innerHTML += `<option value="${name}">${name}</option>`
        })
        payerSelect.style.display = 'none'

        const dropdown = document.createElement('div')
        dropdown.className = 'payer-select'
        dropdown.innerHTML = `
            <button type="button" class="payer-select-btn" id="expense-paid-by-btn">
                <span class="payer-selected" id="expense-paid-by-selected">👤 کی پرداخت کرد؟</span>
                <span class="payer-arrow">▾</span>
            </button>
            <div class="payer-options" id="expense-paid-by-options" style="display:none;">
                ${ALLOWED_USERS.map(name => {
                    const u = USERS_DATABASE[name]
                    if (!u) return ''
                    const av = u.avatar || '👤'
                    const img = (av.includes('/') || av.includes('.')) ? `<img src="${av}">` : av
                    return `<button type="button" class="payer-option" data-value="${name}">${img} ${name}</button>`
                }).join('')}
            </div>
        `
        payerSelect.insertAdjacentElement('afterend', dropdown)

        const btn = dropdown.querySelector('.payer-select-btn')
        const options = dropdown.querySelector('.payer-options')
        const selectedEl = dropdown.querySelector('.payer-selected')

        btn.addEventListener('click', () => {
            dropdown.classList.toggle('open')
            options.style.display = dropdown.classList.contains('open') ? 'block' : 'none'
        })
        options.querySelectorAll('.payer-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const name = opt.dataset.value
                const u = USERS_DATABASE[name]
                const av = u?.avatar || '👤'
                const img = (av.includes('/') || av.includes('.')) ? `<img src="${av}">` : av
                selectedEl.innerHTML = `${img} ${name}`
                payerSelect.value = name
                dropdown.classList.remove('open')
                options.style.display = 'none'
                options.querySelectorAll('.payer-option').forEach(o => o.classList.toggle('selected', o === opt))
            })
        })
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('open')
                options.style.display = 'none'
            }
        })

        if (!participantsContainer) return
        participantsContainer.innerHTML = `
            <label class="form-label" style="margin-top:12px;">👥 کی‌ها بودن؟</label>
            <div class="participants-grid">
                ${ALLOWED_USERS.map(name => {
                    const u = USERS_DATABASE[name]
                    if (!u) return ''
                    const av = u.avatar || '👤'
                    const img = (av.includes('/') || av.includes('.')) ? `<img src="${av}">` : av
                    return `<label class="participant-label"><input type="checkbox" value="${name}" class="participant-check" checked><span class="participant-avatar">${img}</span><span>${name}</span></label>`
                }).join('')}
            </div>
            <button type="button" class="select-all-btn" id="select-all-btn">✅ انتخاب همه</button>
        `
        document.getElementById('select-all-btn').addEventListener('click', () => {
            const all = document.querySelectorAll('.participant-check:checked').length === ALLOWED_USERS.length
            document.querySelectorAll('.participant-check').forEach(cb => cb.checked = !all)
            document.getElementById('select-all-btn').textContent = all ? '✅ انتخاب همه' : '❌ هیچکدوم'
        })
    }

    async function loadAllData() {
        const { data: expenses } = await supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(100)
        const { data: settlements } = await supabase.from('settlements').select('*')

        listDiv.innerHTML = ''
        if (!expenses || expenses.length === 0) {
            listDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#9d9dab;"><span style="font-size:48px;">💰</span><p>هزینه‌ای ثبت نشده</p></div>'
            if (balanceDiv) balanceDiv.innerHTML = ''
            if (settDiv) settDiv.innerHTML = ''
            return
        }

        const cu = getCurrentUser()
        expenses.forEach(exp => {
            const parts = exp.participants || ALLOWED_USERS
            const pp = Math.floor(exp.amount / parts.length)
            const isPayer = exp.paid_by === cu?.name
            const sett = (settlements || []).filter(s => s.expense_id === exp.id)
            const settUsers = sett.map(s => s.from_user)
            const totalSett = sett.reduce((s, x) => s + x.amount, 0)
            const remaining = exp.amount - totalSett

            const payerAv = exp.paid_by_avatar || '👤'
            const payerImg = (payerAv.includes('/') || payerAv.includes('.')) ? `<img src="${payerAv}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:3px;">` : payerAv

            const partsDisplay = parts.map(name => {
                const u = USERS_DATABASE[name]
                const av = u?.avatar || '👤'
                return (av.includes('/') || av.includes('.')) ? `<img src="${av}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:middle;margin:1px;" title="${name}">` : av
            }).join(' ')

            listDiv.innerHTML += `
                <div class="expense-card">
                    <div class="expense-left">
                        <div class="expense-icon-box" style="background:${exp.paid_by_color || '#6c5ce7'}20;">${getIcon(exp.description)}</div>
                        <div class="expense-info">
                            <div class="expense-desc">${exp.description}</div>
                            <div class="expense-meta">
                                <span>${payerImg} ${exp.paid_by} پرداخت</span>
                                <span>📅 ${new Date(exp.created_at).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' })}</span>
                                <span>👥 ${parts.length} نفر</span>
                                <span>💵 ${pp.toLocaleString()} تومان</span>
                            </div>
                            <div class="expense-participants">${partsDisplay}</div>
                        </div>
                    </div>
                    <div class="expense-right">
                        <div class="expense-amount">${exp.amount.toLocaleString()}</div>
                        <div class="expense-unit">تومان</div>
                        ${!isPayer && parts.includes(cu?.name) && !settUsers.includes(cu?.name) ? `<button class="settle-btn" onclick="window.settleExp(${exp.id},'${exp.paid_by}',${pp})">💳 تسویه</button>` : isPayer ? `<span style="font-size:12px;color:${remaining === 0 ? '#2ed573' : '#ffa502'}">${remaining === 0 ? '✅' : '⏳' + remaining.toLocaleString()}</span>` : settUsers.includes(cu?.name) ? `<span style="font-size:12px;color:#2ed573;">✅</span>` : !parts.includes(cu?.name) ? `<span style="font-size:11px;color:#9d9dab;">نبودی</span>` : ''}
                    </div>
                </div>`
        })

        if (settDiv) {
            const settData = settlements || []
            settDiv.innerHTML = settData.length > 0 ? '<h3 style="margin:20px 0 12px;">💳 تاریخچه تسویه‌ها</h3>' + settData.map(s => {
                const fromAv = s.from_user_avatar || '👤'
                const fromImg = (fromAv.includes('/') || fromAv.includes('.')) ? `<img src="${fromAv}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : fromAv
                return `<div class="settlement-row"><span>${fromImg} ${s.from_user}</span><span style="color:#9d9dab;">➔</span><span>${s.to_user}</span><span class="settlement-amount">${s.amount.toLocaleString()} تومان</span></div>`
            }).join('') : ''
        }

        if (balanceDiv) {
            const bal = {}
            ALLOWED_USERS.forEach(n => bal[n] = 0)
            expenses.forEach(exp => {
                const parts = exp.participants || ALLOWED_USERS
                const pp = Math.floor(exp.amount / parts.length)
                parts.forEach(name => { bal[name] = (bal[name] || 0) + (name === exp.paid_by ? exp.amount - pp : -pp) })
            })
            const cr = [], db = [], st = []
            ALLOWED_USERS.forEach(name => {
                const u = USERS_DATABASE[name] || { avatar: '👤', color: '#6c5ce7' }
                const b = bal[name] || 0
                if (b > 500) cr.push({ ...u, name, balance: b })
                else if (b < -500) db.push({ ...u, name, balance: Math.abs(b) })
                else st.push({ ...u, name })
            })
            balanceDiv.innerHTML = '<h3 style="margin-bottom:16px;">📊 تراز حساب‌ها</h3>' +
                (cr.length ? `<div class="balance-section"><div style="color:#2ed573;">🟢 طلبکارها</div>${cr.map(c => `<div class="balance-row"><span>${(c.avatar.includes('/')||c.avatar.includes('.'))?`<img src="${c.avatar}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">`:c.avatar} ${c.name}</span><span style="color:#2ed573;">+${c.balance.toLocaleString()}</span></div>`).join('')}</div>` : '') +
                (db.length ? `<div class="balance-section"><div style="color:#ff4757;">🔴 بدهکارها</div>${db.map(d => `<div class="balance-row"><span>${(d.avatar.includes('/')||d.avatar.includes('.'))?`<img src="${d.avatar}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">`:d.avatar} ${d.name}</span><span style="color:#ff4757;">-${d.balance.toLocaleString()}</span></div>`).join('')}</div>` : '') +
                (st.length ? `<div class="balance-section"><div style="color:#9d9dab;">⚪ تسویه</div>${st.map(s => `<div class="balance-row"><span>${(s.avatar.includes('/')||s.avatar.includes('.'))?`<img src="${s.avatar}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">`:s.avatar} ${s.name}</span><span>✓</span></div>`).join('')}</div>` : '')
        }
    }

    function setupRealtime() {
        if (realtimeSetup) return
        realtimeSetup = true
        supabase.channel('expenses-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadAllData())
            .subscribe()
    }

    window.settleExp = async (id, to, amount) => {
        const cu = getCurrentUser()
        if (!cu) return
        const ok = await window.showConfirm(`${amount.toLocaleString()} تومان به ${to}؟`, 'تسویه')
        if (!ok) return
        const payload = {
            expense_id: id, from_user: cu.name, from_user_avatar: cu.avatar || '👤',
            to_user: to, amount, created_at: new Date().toISOString()
        }
        // ستون‌های جدید (برای نوتیفیکیشن تسویه) — اگر نبود با خطا دوباره بدون اون‌ها
        const toInfo = USERS_DATABASE[to]
        const withIds = { ...payload, from_user_id: String(cu.id), to_user_id: toInfo ? String(toInfo.id) : null }
        let { error } = await supabase.from('settlements').insert([withIds])
        if (error && String(error.message || '').includes('from_user_id')) {
            ;({ error } = await supabase.from('settlements').insert([payload]))
        }
        if (error) return window.showToast('خطا در تسویه', 'error')
        window.showToast('✅ تسویه شد', 'success')
        loadAllData()
    }

    function getIcon(d) {
        if (d.includes('غذا') || d.includes('رستوران')) return '🍽️'
        if (d.includes('کافه') || d.includes('قهوه')) return '☕'
        if (d.includes('پیتزا')) return '🍕'
        if (d.includes('سفر') || d.includes('بنزین')) return '🚗'
        if (d.includes('سینما')) return '🎬'
        if (d.includes('خرید')) return '🛒'
        return '💸'
    }
}