// js/expenses.js - کامل با قابلیت تسویه
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { ALLOWED_USERS, USERS_DATABASE } from './config.js'

export function initExpenses(user) {
    const expensesList = document.getElementById('expenses-list')
    const expenseForm = document.getElementById('expense-form')
    const balanceSummary = document.getElementById('balance-summary')
    const settlementsList = document.getElementById('settlements-list')

    if (!expensesList || !expenseForm) return

    loadGroupMembers()
    loadExpenses()
    loadSettlements()

    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault()

        // غیرفعال کردن required
        document.getElementById('expense-desc').required = false
        document.getElementById('expense-amount').required = false
        document.getElementById('expense-paid-by').required = false

        const desc = document.getElementById('expense-desc').value.trim()
        const amount = document.getElementById('expense-amount').value.trim()
        const paidBy = document.getElementById('expense-paid-by').value
        const currentUser = getCurrentUser()

        if (!desc || !amount || !paidBy) {
            window.showToast('لطفاً همه فیلدها رو پر کن', 'warning')
            return
        }

        const payerInfo = USERS_DATABASE[paidBy] || { avatar: '👤', color: '#6c5ce7' }

        const { error } = await supabase
            .from('expenses')
            .insert([{
                description: desc,
                amount: parseInt(amount),
                paid_by: paidBy,
                paid_by_avatar: payerInfo.avatar,
                paid_by_color: payerInfo.color,
                user_id: currentUser?.id,
                user_name: currentUser?.name,
                created_at: new Date().toISOString()
            }])

        if (error) {
            window.showToast('خطا در ثبت هزینه', 'error')
        } else {
            window.showToast(`${payerInfo.avatar} ${desc} ثبت شد ✅`, 'success')
            expenseForm.reset()
            loadExpenses()
            loadSettlements()
        }
    })

    function loadGroupMembers() {
        const select = document.getElementById('expense-paid-by')
        if (!select) return

        select.innerHTML = '<option value="">👤 کی پرداخت کرد؟</option>'

        ALLOWED_USERS.forEach(name => {
            const userInfo = USERS_DATABASE[name] || { avatar: '👤', color: '#6c5ce7' }
            select.innerHTML += `
                <option value="${name}">${userInfo.avatar} ${name}</option>
            `
        })
    }

    async function loadExpenses() {
        const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)

        if (expError) return

        const { data: settlements } = await supabase
            .from('settlements')
            .select('*')

        expensesList.innerHTML = ''

        if (!expenses || expenses.length === 0) {
            expensesList.innerHTML = `
                <div style="text-align:center; color:#9d9dab; padding:40px;">
                    <span style="font-size:48px; display:block; margin-bottom:12px;">💰</span>
                    <p style="font-size:16px; font-weight:500;">هنوز هزینه‌ای ثبت نشده</p>
                </div>
            `
        } else {
            expenses.forEach(exp => {
                const div = document.createElement('div')
                div.className = 'expense-card'
                div.id = `expense-${exp.id}`

                const date = new Date(exp.created_at).toLocaleDateString('fa-IR', {
                    month: 'long',
                    day: 'numeric'
                })

                const icon = getExpenseIcon(exp.description)
                const perPerson = Math.floor(exp.amount / ALLOWED_USERS.length)
                const currentUser = getCurrentUser()
                const isPayer = exp.paid_by === currentUser?.name

                const expenseSettlements = (settlements || []).filter(s => s.expense_id === exp.id)
                const settledUsers = expenseSettlements.map(s => s.from_user)
                const totalSettled = expenseSettlements.reduce((sum, s) => sum + s.amount, 0)
                const remaining = exp.amount - totalSettled

                div.innerHTML = `
                    <div class="expense-left">
                        <div class="expense-icon-box" style="background:${exp.paid_by_color || '#6c5ce7'}20;">
                            ${icon}
                        </div>
                        <div class="expense-info">
                            <div class="expense-desc">${exp.description}</div>
                            <div class="expense-meta">
                                <span class="expense-payer">${exp.paid_by_avatar || '👤'} ${exp.paid_by} پرداخت کرد</span>
                                <span>📅 ${date}</span>
                                <span>👥 هر نفر ${perPerson.toLocaleString()} تومان</span>
                            </div>
                            ${settledUsers.length > 0 ? `
                                <div class="settled-badges">
                                    ${expenseSettlements.map(s => `
                                        <span class="settled-badge" title="${s.from_user} تسویه کرد">
                                            ${s.from_user_avatar || '👤'} ✓
                                        </span>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="expense-right">
                        <div class="expense-amount">${exp.amount.toLocaleString()}</div>
                        <div class="expense-unit">تومان</div>
                        
                        ${!isPayer && !settledUsers.includes(currentUser?.name) ? `
                            <button class="settle-btn" onclick="window.settleExpense(${exp.id}, '${exp.paid_by}', ${perPerson})">
                                💳 تسویه کن
                            </button>
                        ` : isPayer ? `
                            <div class="settlement-status ${remaining === 0 ? 'fully-settled' : 'partial-settled'}">
                                ${remaining === 0 ? '✅ تسویه کامل' : `⏳ ${remaining.toLocaleString()} باقی`}
                            </div>
                        ` : settledUsers.includes(currentUser?.name) ? `
                            <div class="settlement-status fully-settled">
                                ✅ تسویه شدی
                            </div>
                        ` : ''}
                    </div>
                `

                expensesList.appendChild(div)
            })
        }

        calculateBalances(expenses || [], settlements || [])
    }

    window.settleExpense = async (expenseId, toUser, amount) => {
        const currentUser = getCurrentUser()
        if (!currentUser) return

        const confirmed = await window.showConfirm(
            `می‌خوای ${amount.toLocaleString()} تومان به ${toUser} پرداخت کنی؟`,
            'تسویه حساب'
        )

        if (!confirmed) return

        const { error } = await supabase
            .from('settlements')
            .insert([{
                expense_id: expenseId,
                from_user: currentUser.name,
                from_user_avatar: currentUser.avatar || '👤',
                to_user: toUser,
                amount: amount,
                created_at: new Date().toISOString()
            }])

        if (error) {
            window.showToast('خطا در تسویه', 'error')
        } else {
            window.showToast(`✅ ${amount.toLocaleString()} تومان تسویه شد`, 'success')
            loadExpenses()
            loadSettlements()
        }
    }

    async function loadSettlements() {
        if (!settlementsList) return

        const { data, error } = await supabase
            .from('settlements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) return

        if (!data || data.length === 0) {
            settlementsList.innerHTML = ''
        } else {
            settlementsList.innerHTML = `
                <h3 style="margin:20px 0 12px;">💳 تاریخچه تسویه‌ها</h3>
                ${data.map(s => {
                    const date = new Date(s.created_at).toLocaleDateString('fa-IR', {
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                    return `
                        <div class="settlement-row">
                            <span>${s.from_user_avatar || '👤'} ${s.from_user}</span>
                            <span style="color:#9d9dab;">➔</span>
                            <span>${s.to_user}</span>
                            <span class="settlement-amount">${s.amount.toLocaleString()} تومان</span>
                            <span style="font-size:11px; color:var(--text-tertiary);">${date}</span>
                        </div>
                    `
                }).join('')}
            `
        }
    }

    function calculateBalances(expenses, settlements) {
        if (!balanceSummary) return

        if (expenses.length === 0) {
            balanceSummary.innerHTML = ''
            return
        }

        const balances = {}
        ALLOWED_USERS.forEach(name => {
            balances[name] = 0
        })

        expenses.forEach(exp => {
            const perPerson = Math.floor(exp.amount / ALLOWED_USERS.length)
            ALLOWED_USERS.forEach(name => {
                if (name === exp.paid_by) {
                    balances[name] += exp.amount - perPerson
                } else {
                    balances[name] -= perPerson
                }
            })
        })

        settlements.forEach(s => {
            balances[s.from_user] += s.amount
            balances[s.to_user] -= s.amount
        })

        const creditors = []
        const debtors = []
        const settled = []

        ALLOWED_USERS.forEach(name => {
            const userInfo = USERS_DATABASE[name] || { avatar: '👤', color: '#6c5ce7' }
            if (balances[name] > 500) {
                creditors.push({ ...userInfo, name, balance: balances[name] })
            } else if (balances[name] < -500) {
                debtors.push({ ...userInfo, name, balance: Math.abs(balances[name]) })
            } else {
                settled.push({ ...userInfo, name, balance: 0 })
            }
        })

        balanceSummary.innerHTML = `
            <h3 style="margin-bottom:16px; font-size:18px;">📊 تراز حساب‌ها</h3>
            ${creditors.length > 0 ? `
                <div class="balance-section">
                    <div class="balance-section-title" style="color:#2ed573;">🟢 طلبکارها</div>
                    ${creditors.map(c => `
                        <div class="balance-row">
                            <div class="balance-user">
                                <span class="balance-avatar" style="background:${c.color};">${c.avatar}</span>
                                <span>${c.name}</span>
                            </div>
                            <div class="balance-amount positive">+${c.balance.toLocaleString()}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${debtors.length > 0 ? `
                <div class="balance-section">
                    <div class="balance-section-title" style="color:#ff4757;">🔴 بدهکارها</div>
                    ${debtors.map(d => `
                        <div class="balance-row">
                            <div class="balance-user">
                                <span class="balance-avatar" style="background:${d.color};">${d.avatar}</span>
                                <span>${d.name}</span>
                            </div>
                            <div class="balance-amount negative">-${d.balance.toLocaleString()}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${settled.length > 0 ? `
                <div class="balance-section">
                    <div class="balance-section-title" style="color:#9d9dab;">⚪ تسویه شده</div>
                    ${settled.map(s => `
                        <div class="balance-row">
                            <div class="balance-user">
                                <span class="balance-avatar" style="background:${s.color};">${s.avatar}</span>
                                <span>${s.name}</span>
                            </div>
                            <div class="balance-amount neutral">✓</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `
    }

    function getExpenseIcon(desc) {
        const d = desc.toLowerCase()
        if (d.includes('غذا') || d.includes('رستوران') || d.includes('ناهار') || d.includes('شام')) return '🍽️'
        if (d.includes('کافه') || d.includes('قهوه') || d.includes('چای')) return '☕'
        if (d.includes('پیتزا') || d.includes('فست فود')) return '🍕'
        if (d.includes('سفر') || d.includes('مسافرت') || d.includes('بنزین')) return '🚗'
        if (d.includes('سینما') || d.includes('فیلم') || d.includes('بلیط')) return '🎬'
        if (d.includes('خرید') || d.includes('سوپر') || d.includes('مایحتاج')) return '🛒'
        if (d.includes('قبض') || d.includes('شارژ') || d.includes('اینترنت')) return '📱'
        if (d.includes('بازی') || d.includes('گیم')) return '🎮'
        if (d.includes('کادو') || d.includes('هدیه')) return '🎁'
        return '💸'
    }
}