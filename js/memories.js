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
        
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue
            
            const caption = await window.showPrompt('📝 توضیح (اختیاری)', '')
            
            const reader = new FileReader()
            reader.onload = async () => {
                await supabase.from('memories').insert([{
                    image_url: reader.result,
                    caption: caption || '',
                    user_id: String(currentUser.id),
                    user_name: String(currentUser.name),
                    created_at: new Date().toISOString()
                }])
                loadMemories()
                window.showToast('عکس آپلود شد 📸', 'success')
            }
            reader.readAsDataURL(file)
        }
        uploadInput.value = ''
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
    
    async function loadMemories() {
        const { data } = await supabase.from('memories').select('*').order('created_at', { ascending: false }).limit(50)
        
        memoriesGrid.innerHTML = ''
        
        if (!data || data.length === 0) {
            memoriesGrid.innerHTML = '<div class="empty-memories"><span class="empty-icon">📸</span><h3>هنوز خاطره‌ای ثبت نشده</h3><p>اولین عکس رو آپلود کن!</p></div>'
            return
        }
        
        const currentUser = getCurrentUser()
        
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
        })
    }
}