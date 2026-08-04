// js/memories.js
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

let realtimeSetup = false
let migratingIds = new Set()

export function initMemories(user) {
    const memoriesGrid = document.getElementById('memories-grid')
    const uploadInput = document.getElementById('memory-upload')
    const uploadBtn = document.getElementById('upload-memory-btn')
    
    if (!memoriesGrid) return
    
    loadMemories()
    setupRealtime()
    setupTodayMemoryToast()
    
    uploadBtn?.addEventListener('click', () => uploadInput?.click())
    
    uploadInput?.addEventListener('change', async (e) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        
        const currentUser = getCurrentUser()
        if (!currentUser) return
        
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue
            
            const caption = await window.showPrompt('📝 توضیح (اختیاری)', '')
            
            try {
                // آپلود مستقیم به Storage (نه دیتابیس — رفع کندی)
                const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg')
                const path = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
                const { error } = await supabase.storage.from('memories').upload(path, file)
                if (error) {
                    window.showToast('⚠️ باکت memories ساخته نشده؛ sql/setup-all.sql را اجرا کن', 'error', 5000)
                    continue
                }
                const { data: urlData } = supabase.storage.from('memories').getPublicUrl(path)
                await supabase.from('memories').insert([{
                    image_url: urlData.publicUrl,
                    caption: caption || '',
                    user_id: String(currentUser.id),
                    user_name: String(currentUser.name),
                    created_at: new Date().toISOString()
                }])
                window.showToast('عکس آپلود شد 📸', 'success')
            } catch (err) {
                window.showToast('خطا در آپلود عکس', 'error')
            }
        }
        uploadInput.value = ''
        loadMemories()
    })
    
    window.deleteMemory = async (id) => {
        const ok = await window.showConfirm('حذف بشه؟', 'حذف')
        if (!ok) return
        await supabase.from('memories').delete().eq('id', id)
        loadMemories()
    }
    
    window.viewMemory = function(url, name, caption, date) {
        const old = document.getElementById('fullscreen-memory')
        if (old) old.remove()
        
        const overlay = document.createElement('div')
        overlay.id = 'fullscreen-memory'
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;'
        
        overlay.innerHTML = `
            <div style="position:absolute;top:15px;right:15px;display:flex;gap:10px;z-index:10;">
                <button id="btn-download" style="padding:10px 20px;background:#6C5CE7;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer;font-family:inherit;">📥 دانلود</button>
                <button id="btn-close" style="width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,0.2);color:#fff;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <img src="${url}" style="max-width:95%;max-height:80%;object-fit:contain;">
            <div style="margin-top:15px;color:#fff;text-align:center;font-family:inherit;">
                ${caption ? `<p style="font-size:16px;margin:0;">📝 ${caption}</p>` : ''}
                <p style="font-size:13px;opacity:0.7;margin:5px 0 0;">👤 ${name || 'ناشناس'} · ${date}</p>
            </div>
        `
        
        document.body.appendChild(overlay)
        
        document.getElementById('btn-close').onclick = function() { overlay.remove() }
        
        document.getElementById('btn-download').onclick = function() {
            fetch(url).then(r => r.blob()).then(b => {
                const a = document.createElement('a')
                a.href = URL.createObjectURL(b)
                a.download = 'memory.jpg'
                a.click()
            }).catch(() => {
                const a = document.createElement('a')
                a.href = url
                a.download = 'memory.jpg'
                a.target = '_blank'
                a.click()
            })
        }
        
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove() })
        
        function escHandler(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler) } }
        document.addEventListener('keydown', escHandler)
    }
    
    function setupRealtime() {
        if (realtimeSetup) return
        realtimeSetup = true
        supabase.channel('memories-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'memories' }, () => loadMemories())
            .subscribe()
    }
    
    async function loadMemories() {
        const { data } = await supabase.from('memories').select('*').order('created_at', { ascending: false }).limit(50)
        
        memoriesGrid.innerHTML = ''
        
        if (!data || data.length === 0) {
            memoriesGrid.innerHTML = '<div class="empty-memories"><span class="empty-icon">📸</span><h3>هنوز خاطره‌ای ثبت نشده</h3><p>اولین عکس رو آپلود کن!</p></div>'
            return
        }
        
        const currentUser = getCurrentUser()

        // ===== «خاطره‌ی امروز» — عکس پارسال همین روز =====
        const todayMemories = data.filter(m => isSameMonthDay(m.created_at, new Date()) && !isToday(m.created_at))
        if (todayMemories.length > 0) {
            const mem = todayMemories[0]
            const date = new Date(mem.created_at).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
            const card = document.createElement('div')
            card.className = 'today-memory-card'
            card.innerHTML = `
                <div class="today-memory-badge">⏳ خاطره‌ی امروز — ${new Date().toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' })}</div>
                <img src="${mem.image_url}" alt="خاطره امروز">
                <div class="today-memory-overlay">
                    <div class="today-memory-info">
                        <span class="today-memory-user">${mem.user_name} · ${date}</span>
                        ${mem.caption ? `<p class="today-memory-caption">${mem.caption}</p>` : ''}
                    </div>
                    <button class="memory-view-btn" onclick="event.stopPropagation();window.viewMemory('${mem.image_url}', '${mem.user_name}', '${(mem.caption||'').replace(/'/g,"\\'")}', '${date}')">🔍</button>
                </div>`
            card.addEventListener('click', () => {
                window.viewMemory(mem.image_url, mem.user_name, mem.caption || '', date)
            })
            memoriesGrid.appendChild(card)
        }
        
        data.forEach(mem => {
            const date = new Date(mem.created_at).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
            const isOwner = mem.user_id === String(currentUser?.id)
            
            const card = document.createElement('div')
            card.className = 'memory-card'
            card.innerHTML = `
                <img src="${mem.image_url}" alt="خاطره">
                <div class="memory-card-overlay">
                    <div class="memory-card-top">${isOwner ? '<button class="memory-delete-btn" onclick="event.stopPropagation();window.deleteMemory('+mem.id+')">🗑️</button>' : ''}</div>
                    <div class="memory-card-bottom">
                        <span class="memory-card-user">${mem.user_name}</span>
                        <button class="memory-view-btn" onclick="event.stopPropagation();window.viewMemory('${mem.image_url}', '${mem.user_name}', '${(mem.caption||'').replace(/'/g,"\\'")}', '${date}')">🔍</button>
                        <span class="memory-card-date">${date}</span>
                    </div>
                </div>
            `
            memoriesGrid.appendChild(card)

            // انتقال عکس‌های قدیمی (Base64 داخل دیتابیس) به Storage
            if (String(mem.image_url).startsWith('data:')) {
                migrateMemoryToStorage(mem.id, mem.image_url, card.querySelector('img'))
            }
        })
    }

    // ============ انتقال خاطرات قدیمی از دیتابیس به Storage ============
    async function migrateMemoryToStorage(id, dataUrl, imgEl) {
        if (migratingIds.has(id)) return
        migratingIds.add(id)
        try {
            const blob = await (await fetch(dataUrl)).blob()
            if (!blob || blob.size === 0) return
            const mime = blob.type || 'image/jpeg'
            const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
            const path = `mem_${id}_${Date.now()}.${ext}`
            const { error } = await supabase.storage.from('memories').upload(path, blob)
            if (error) return
            const { data: urlData } = supabase.storage.from('memories').getPublicUrl(path)
            await supabase.from('memories').update({ image_url: urlData.publicUrl }).eq('id', id)
            if (imgEl) imgEl.src = urlData.publicUrl
        } catch (e) { }
    }

    function isSameMonthDay(dateStr, now) {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return false
        return d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    }

    function isToday(dateStr) {
        const d = new Date(dateStr)
        const now = new Date()
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    }

    // یک‌بار در روز، یادآوری خاطره امروز
    function setupTodayMemoryToast() {
        const key = 'yey-today-memory-' + new Date().toLocaleDateString('fa-IR')
        if (localStorage.getItem(key)) return
        setTimeout(async () => {
            const { data } = await supabase.from('memories').select('*').limit(100)
            const found = (data || []).find(m => isSameMonthDay(m.created_at, new Date()) && !isToday(m.created_at))
            if (found) {
                window.showToast('⏳ خاطره‌ی امروز: عکسی از پارسال همین روز داریم!', 'info', 6000)
                localStorage.setItem(key, '1')
            }
        }, 5000)
    }
}