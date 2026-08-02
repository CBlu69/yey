// js/chat.js - کامل با پشتیبانی از عکس آواتار
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

export function initChat(user) {
    const messagesContainer = document.getElementById('chat-messages')
    const chatForm = document.getElementById('chat-form')
    const messageInput = document.getElementById('message-input')
    
    if (!messagesContainer || !chatForm || !messageInput) {
        console.error('عناصر چت پیدا نشدند')
        return
    }
    
    let editingMessageId = null
    
    loadMessages()
    
    supabase
        .channel('messages')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                if (!document.getElementById(`msg-${payload.new.id}`)) {
                    displayMessage(payload.new)
                    messagesContainer.scrollTop = messagesContainer.scrollHeight
                }
            }
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'messages' },
            (payload) => {
                const msgElement = document.getElementById(`msg-${payload.old.id}`)
                if (msgElement) {
                    msgElement.style.animation = 'fadeOut 0.3s ease forwards'
                    setTimeout(() => msgElement.remove(), 300)
                }
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages' },
            (payload) => {
                const msgElement = document.getElementById(`msg-${payload.new.id}`)
                if (msgElement) {
                    const contentDiv = msgElement.querySelector('.msg-content')
                    if (contentDiv) {
                        contentDiv.textContent = payload.new.content
                    }
                    const editedTag = msgElement.querySelector('.edited-tag')
                    if (!editedTag) {
                        const tag = document.createElement('span')
                        tag.className = 'edited-tag'
                        tag.textContent = ' (ویرایش شده)'
                        tag.style.cssText = 'font-size:10px; opacity:0.5;'
                        const timeDiv = msgElement.querySelector('.time')
                        if (timeDiv) timeDiv.appendChild(tag)
                    }
                }
            }
        )
        .subscribe()
    
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        
        const content = messageInput.value.trim()
        if (!content) return
        
        const currentUser = user || getCurrentUser()
        if (!currentUser) {
            window.showToast('کاربر پیدا نشد!', 'error')
            return
        }
        
        if (editingMessageId) {
            await updateMessage(editingMessageId, content)
            editingMessageId = null
            messageInput.placeholder = 'پیامت رو بنویس...'
            const sendBtn = chatForm.querySelector('button')
            sendBtn.textContent = '📨'
            sendBtn.style.background = ''
        } else {
            await sendMessage(content, currentUser)
        }
        
        messageInput.value = ''
        messageInput.focus()
    })
    
    async function sendMessage(content, currentUser) {
        const { error } = await supabase
            .from('messages')
            .insert([{
                content: content,
                user_id: String(currentUser.id),
                user_name: String(currentUser.name),
                user_avatar: currentUser.avatar || '👤',
                user_color: currentUser.color || '#6c5ce7'
            }])
            .select()
        
        if (error) {
            window.showToast('پیام ارسال نشد!', 'error')
        }
    }
    
    async function updateMessage(messageId, newContent) {
        const { error } = await supabase
            .from('messages')
            .update({ 
                content: newContent,
                edited: true,
                edited_at: new Date().toISOString()
            })
            .eq('id', messageId)
        
        if (error) {
            window.showToast('ویرایش انجام نشد!', 'error')
        } else {
            window.showToast('پیام ویرایش شد', 'success')
        }
    }
    
    async function deleteMessage(messageId) {
        const confirmed = await window.showConfirm('مطمئنی می‌خوای این پیام رو حذف کنی؟', 'حذف پیام')
        if (!confirmed) return
        
        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', messageId)
        
        if (error) {
            window.showToast('حذف انجام نشد!', 'error')
        } else {
            window.showToast('پیام حذف شد', 'success')
        }
    }
    
    window.deleteMessage = deleteMessage
    
    window.editMessage = (messageId, currentContent) => {
        editingMessageId = messageId
        messageInput.value = currentContent
        messageInput.placeholder = 'در حال ویرایش...'
        messageInput.focus()
        
        const sendBtn = chatForm.querySelector('button')
        sendBtn.textContent = '✏️'
        sendBtn.style.background = '#ffa502'
        
        const msgElement = document.getElementById(`msg-${messageId}`)
        if (msgElement) {
            msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            msgElement.style.boxShadow = '0 0 0 2px #ffa502'
            setTimeout(() => { msgElement.style.boxShadow = '' }, 2000)
        }
    }
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editingMessageId) {
            editingMessageId = null
            messageInput.value = ''
            messageInput.placeholder = 'پیامت رو بنویس...'
            const sendBtn = chatForm.querySelector('button')
            sendBtn.textContent = '📨'
            sendBtn.style.background = ''
        }
    })
    
    async function loadMessages() {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(100)
        
        if (error) {
            messagesContainer.innerHTML = `
                <div style="text-align:center; color:#9d9dab; padding:40px;">
                    <p>خطا در لود پیام‌ها</p>
                </div>
            `
            return
        }
        
        messagesContainer.innerHTML = ''
        
        if (!data || data.length === 0) {
            messagesContainer.innerHTML = `
                <div style="text-align:center; color:#9d9dab; padding:40px;">
                    <span style="font-size:40px; display:block; margin-bottom:12px;">💬</span>
                    <p>هنوز پیامی ارسال نشده</p>
                </div>
            `
        } else {
            data.forEach(msg => displayMessage(msg))
        }
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
    
    function displayMessage(msg) {
        const currentUser = getCurrentUser()
        const isSent = msg.user_id === String(currentUser?.id)
        
        const messageDiv = document.createElement('div')
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`
        messageDiv.id = `msg-${msg.id}`
        messageDiv.style.position = 'relative'
        
        const time = msg.created_at 
            ? new Date(msg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
            : ''
        
        // ========== این بخش آواتار رو درست میکنه ==========
        let avatarHTML = ''
        const av = msg.user_avatar
        
        if (av && (av.includes('/') || av.includes('.png') || av.includes('.jpg') || av.includes('.jpeg') || av.includes('.webp'))) {
            // عکس از فایل
            avatarHTML = `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:5px;" onerror="this.style.display='none';">`
        } else if (av) {
            // ایموجی
            avatarHTML = av
        } else {
            avatarHTML = '👤'
        }
        // =============================================
        
        messageDiv.innerHTML = `
            <div class="sender">${avatarHTML} ${msg.user_name || 'ناشناس'}</div>
            <div class="msg-content">${msg.content}</div>
            <div class="time">
                ${time}
                ${msg.edited ? '<span class="edited-tag"> (ویرایش شده)</span>' : ''}
            </div>
            ${isSent ? `
                <div class="msg-actions">
                    <button class="msg-action-btn edit-btn" title="ویرایش" onclick="window.editMessage('${msg.id}', '${escapeHtml(msg.content)}')">
                        ✏️
                    </button>
                    <button class="msg-action-btn delete-btn" title="حذف" onclick="window.deleteMessage('${msg.id}')">
                        🗑️
                    </button>
                </div>
            ` : ''}
        `
        
        messagesContainer.appendChild(messageDiv)
    }
    
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
    }
}