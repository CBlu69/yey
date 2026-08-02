// js/memories.js
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

export function initMemories(user) {
    const memoriesGrid = document.getElementById('memories-grid')
    const uploadInput = document.getElementById('memory-upload')
    const uploadBtn = document.getElementById('upload-memory-btn')
    
    if (!memoriesGrid) return
    
    loadMemories()
    
    uploadBtn?.addEventListener('click', () => uploadInput?.click())
    
    uploadInput?.addEventListener('change', async (e) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        
        const currentUser = getCurrentUser()
        if (!currentUser) return
        
        uploadBtn.disabled = true
        uploadBtn.innerHTML = '⏳ در حال آپلود...'
        
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue
            
            const caption = await window.showPrompt('📝 توضیح عکس (اختیاری)', '')
            
            const reader = new FileReader()
            reader.onload = async () => {
                const { error } = await supabase.from('memories').insert([{
                    image_url: reader.result,
                    caption: caption || '',
                    user_id: String(currentUser.id),
                    user_name: String(currentUser.name),
                    created_at: new Date().toISOString()
                }])
                
                if (!error) {
                    window.showToast('عکس آپلود شد 📸', 'success')
                    loadMemories()
                }
            }
            reader.readAsDataURL(file)
        }
        
        uploadBtn.disabled = false
        uploadBtn.innerHTML = '📸 آپلود عکس'
        uploadInput.value = ''
    })
    
    window.deleteMemory = async (id) => {
        const ok = await window.showConfirm('حذف بشه؟', 'حذف خاطره')
        if (!ok) return
        await supabase.from('memories').delete().eq('id', id)
        loadMemories()
    }
    
    window.viewMemory = (url, name, caption, date) => {
        const div = document.createElement('div')
        div.style.cssText = `
            position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);
            z-index:9999;display:flex;align-items:center;justify-content:center;
            flex-direction:column;padding:20px;
        `
        div.innerHTML = `
            <div style="position:absolute;top:20px;right:20px;display:flex;gap:12px;align-items:center;">
                <a href="${url}" download="photo.jpg" style="padding:10px 20px;background:#6C5CE7;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-family:inherit;">📥 دانلود</a>
                <button onclick="this.parentElement.parentElement.remove()" style="width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,0.2);color:#fff;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <img src="${url}" style="max-width:90vw;max-height:75vh;object-fit:contain;border-radius:8px;">
            <div style="margin-top:16px;text-align:center;color:#fff;font-family:inherit;">
                ${caption ? `<p style="font-size:16px;margin:0 0 8px;">📝 ${caption}</p>` : ''}
                <p style="font-size:13px;opacity:0.7;margin:0;">👤 ${name || 'ناشناس'} · ${date}</p>
            </div>
        `
        div.addEventListener('click', (e) => { if (e.target === div) div.remove() })
        document.body.appendChild(div)
        
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { div.remove(); document.removeEventListener('keydown', esc) }
        })
    }
    
    async function loadMemories() {
        const { data } = await supabase.from('memories').select('*').order('created_at', { ascending: false }).limit(50)
        
        memoriesGrid.innerHTML = ''
        
        if (!data || data.length === 0) {
            memoriesGrid.innerHTML = `<div class="empty-memories"><span class="empty-icon">📸</span><h3>هنوز خاطره‌ای ثبت نشده</h3><p>اولین عکس رو آپلود کن!</p></div>`
            return
        }
        
        const currentUser = getCurrentUser()
        
        data.forEach(mem => {
            const date = new Date(mem.created_at).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
            const isOwner = mem.user_id === String(currentUser?.id)
            
            const card = document.createElement('div')
            card.className = 'memory-card'
            card.innerHTML = `
                <img src="${mem.image_url}" onclick="window.viewMemory('${mem.image_url}', '${mem.user_name}', '${mem.caption || ''}', '${date}')">
                <div class="memory-card-overlay">
                    <div class="memory-card-top">${isOwner ? `<button class="memory-delete-btn" onclick="event.stopPropagation();window.deleteMemory(${mem.id})">🗑️</button>` : ''}</div>
                    <div class="memory-card-bottom">
                        <span class="memory-card-user">${mem.user_name}</span>
                        <span class="memory-card-date">${date}</span>
                    </div>
                </div>
            `
            memoriesGrid.appendChild(card)
        })
    }
}