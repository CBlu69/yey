// js/calendar.js — تقویم مشترک گروهی (رویدادها و جشن‌ها)
import { supabase } from './supabase.js'
import { getCurrentUser, isAdmin } from './auth.js'

let channel = null
let eventsCache = []
let shownMonth = null
let selectedDate = null

const TYPE_ICONS = { 'تولد': '🎂', 'جشن': '🎉', 'مناسبت': '🎊', 'سفر': '✈️', 'دیگر': '📅' }

function typeIcon(t) { return TYPE_ICONS[t] || '📅' }

export function initCalendar() {
    const grid = document.getElementById('calendar-grid')
    const list = document.getElementById('calendar-events-list')
    const addBtn = document.getElementById('add-calendar-event-btn')
    const monthLabel = document.getElementById('calendar-month-label')

    if (!grid || !list) return

    shownMonth = new Date()
    selectedDate = todayStr()

    addBtn?.addEventListener('click', openEventModal)

    loadEvents(() => { renderCalendar(); renderEventsForSelected() })
    setupRealtime()
}

function setupRealtime() {
    if (channel) return
    channel = supabase.channel('calendar-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
            loadEvents(() => { renderCalendar(); renderEventsForSelected() })
        })
        .subscribe()
}

function todayStr() {
    const now = new Date()
    return toDateStr(now.getFullYear(), now.getMonth(), now.getDate())
}

function toDateStr(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
}

async function loadEvents(cb) {
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true })
    eventsCache = data || []
    if (typeof cb === 'function') cb()
}

function getEventsOn(dateStr) {
    return eventsCache.filter(e => String(e.event_date) === dateStr)
}

// ============ تقویم ماه ============
const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

function renderCalendar() {
    const grid = document.getElementById('calendar-grid')
    const monthLabel = document.getElementById('calendar-month-label')
    if (!grid) return

    const year = shownMonth.getFullYear()
    const month = shownMonth.getMonth()
    const firstDow = new Date(year, month, 1).getDay() // 0=یکشنبه ... 6=شنبه
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // هدر اسم ماه
    if (monthLabel) {
        monthLabel.textContent = shownMonth.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long' })
    }

    // سرصفحه روزها
    const head = WEEKDAYS.map(d => `<span class="cal-weekday">${d}</span>`).join('')

    let cells = ''
    // روزهای خالی قبل از اول ماه (تقویم ایرانی شنبه=شروع هفته)
    const offset = (firstDow + 1) % 7

    for (let i = 0; i < offset; i++) cells += '<span class="cal-empty"></span>'

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = toDateStr(year, month, d)
        const has = getEventsOn(dateStr).length > 0
        const isToday = dateStr === todayStr()
        const isSel = dateStr === selectedDate
        cells += `
            <button class="cal-day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''} ${has ? 'has-event' : ''}"
                    data-date="${dateStr}" onclick="window.calSelectDate('${dateStr}')">
                ${formatDay(d)}
                ${has ? '<span class="cal-dot"></span>' : ''}
            </button>`
    }
    grid.innerHTML = head + cells
}

function formatDay(d) {
    return d.toLocaleString('fa-IR')
}

window.calSelectDate = function (dateStr) {
    selectedDate = dateStr
    renderCalendar()
    renderEventsForSelected()
}

window.calNavMonth = function (dir) {
    shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + dir, 1)
    renderCalendar()
}

// ============ رویدادهای روز انتخاب‌شده ============
function renderEventsForSelected() {
    const list = document.getElementById('calendar-events-list')
    if (!list) return
    const events = getEventsOn(selectedDate)
    const cu = getCurrentUser()

    if (events.length === 0) {
        list.innerHTML = `<div class="cal-no-event">هیچ رویدادی در این روز نیست 🗓️</div>`
        return
    }

    list.innerHTML = events.map(e => {
        const isToday = String(e.event_date) === todayStr()
        const icon = typeIcon(e.event_type)
        const canDelete = cu && (cu.name === e.created_by_name || isAdmin())
        return `
            <div class="cal-event-card">
                <span class="cal-event-icon">${icon}</span>
                <div class="cal-event-body">
                    <div class="cal-event-title">${e.title}</div>
                    <div class="cal-event-meta">
                        ${e.event_time ? '🕒 ' + e.event_time + ' · ' : ''}
                        ${new Date(e.event_date).toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        ${isToday ? '<span class="cal-today-chip">امروز</span>' : ''}
                    </div>
                    <div class="cal-event-creator">توسط ${e.created_by_name || 'ناشناس'}</div>
                </div>
                ${canDelete ? `<button class="cal-event-del" onclick="window.calDeleteEvent('${e.id}')" title="حذف">🗑️</button>` : ''}
            </div>`
    }).join('')
}

window.calDeleteEvent = async function (id) {
    const ok = await window.showConfirm('این رویداد حذف بشه؟', 'حذف رویداد')
    if (!ok) return
    await supabase.from('events').delete().eq('id', id)
    window.showToast('رویداد حذف شد', 'success')
    loadEvents(() => { renderCalendar(); renderEventsForSelected() })
}

// ============ ساخت رویداد ============
function openEventModal() {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
        <div class="custom-modal" style="max-width:460px;">
            <span class="modal-icon">📅</span>
            <div class="modal-title">رویداد جدید</div>
            <div class="modal-message">تولدها، جشن‌ها و مناسبت‌ها</div>
            <div style="display:flex;flex-direction:column;gap:12px;text-align:right;">
                <input type="text" id="cal-title" class="prompt-input" placeholder="عنوان (مثلاً: تولد آرزو)" style="text-align:right;">
                <div style="display:flex;gap:10px;">
                    <div style="flex:1;">
                        <label class="form-label">تاریخ</label>
                        <input type="date" id="cal-date" class="prompt-input" style="text-align:right;" value="${selectedDate || todayStr()}">
                    </div>
                    <div style="flex:1;">
                        <label class="form-label">ساعت (اختیاری)</label>
                        <input type="time" id="cal-time" class="prompt-input" style="text-align:right;">
                    </div>
                </div>
                <div>
                    <label class="form-label">نوع</label>
                    <select id="cal-type" class="prompt-input" style="text-align:right;">
                        ${Object.keys(TYPE_ICONS).map(t => `<option value="${t}">${TYPE_ICONS[t]} ${t}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="modal-buttons" style="margin-top:20px;">
                <button class="modal-btn primary" id="cal-save">💾 ذخیره</button>
                <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">لغو</button>
            </div>
        </div>`
    document.body.appendChild(overlay)

    overlay.querySelector('#cal-save').addEventListener('click', async () => {
        const title = overlay.querySelector('#cal-title').value.trim()
        const date = overlay.querySelector('#cal-date').value
        const time = overlay.querySelector('#cal-time').value
        const type = overlay.querySelector('#cal-type').value

        if (!title) { window.showToast('عنوان رو بنویس', 'warning'); return }
        if (!date) { window.showToast('تاریخ رو انتخاب کن', 'warning'); return }

        const cu = getCurrentUser()
        const { error } = await supabase.from('events').insert([{
            title,
            event_date: date,
            event_time: time || null,
            event_type: type || 'دیگر',
            created_by: cu?.id || null,
            created_by_name: cu?.name || null
        }])
        if (error) { window.showToast('خطا در ثبت رویداد', 'error'); return }
        overlay.remove()
        selectedDate = date
        window.showToast('رویداد ذخیره شد ✅', 'success')
        loadEvents(() => { renderCalendar(); renderEventsForSelected() })
    })
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('.modal-btn.cancel').addEventListener('click', () => overlay.remove())
}