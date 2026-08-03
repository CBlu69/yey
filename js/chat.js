// js/chat.js - کامل و نهایی
import { supabase } from './supabase.js'
import { getCurrentUser, isAdmin } from './auth.js'
import { ALLOWED_USERS, USERS_DATABASE } from './config.js'

let currentChatType = 'group'
let currentGroupId = null
let currentReceiverId = null
let unreadCounts = {}

export function initChat(user) {
    const messagesWrapper = document.getElementById('chat-messages-wrapper')
    const messagesContainer = document.getElementById('chat-messages')
    const scrollBtn = document.getElementById('scroll-to-bottom')
    const chatForm = document.getElementById('chat-form')
    const messageInput = document.getElementById('message-input')
    const chatHeader = document.querySelector('.chat-header h2')

    if (!messagesContainer || !chatForm || !messageInput) return

    let editingMessageId = null

    loadUnreadCounts()
    loadGroupChat()
    setupGroupSelector()

    // دکمه اسکرول به پایین
    if (messagesWrapper && scrollBtn) {
        messagesWrapper.addEventListener('scroll', () => {
            const isNearBottom = messagesWrapper.scrollHeight - messagesWrapper.scrollTop - messagesWrapper.clientHeight < 100
            scrollBtn.classList.toggle('show', !isNearBottom)
        })
    }

    supabase.channel('chat-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const msg = payload.new
            const cu = getCurrentUser()
            if (!cu) return

            const shouldShow = (currentChatType === 'group' && msg.chat_type === 'group' && msg.group_id === currentGroupId) ||
                (currentChatType === 'private' && msg.chat_type === 'private' &&
                    ((msg.user_id === String(cu.id) && msg.receiver_id === currentReceiverId) ||
                        (msg.receiver_id === String(cu.id) && msg.user_id === currentReceiverId)))

            if (shouldShow && !document.getElementById(`msg-${msg.id}`)) {
                displayMessage(msg)
                scrollToBottom()
            } else if (msg.user_id !== String(cu.id)) {
                let key
                if (msg.chat_type === 'group') key = `group-${msg.group_id}`
                else key = `private-${msg.user_id}`
                unreadCounts[key] = (unreadCounts[key] || 0) + 1
                saveUnreadToDB(cu.id, key, unreadCounts[key])
                updateUnreadBadges()
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
            document.getElementById(`msg-${payload.old.id}`)?.remove()
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
            const el = document.getElementById(`msg-${payload.new.id}`)
            if (el) el.querySelector('.msg-content').textContent = payload.new.content
        })
        .subscribe()

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        const content = messageInput.value.trim()
        if (!content) return
        const cu = getCurrentUser()
        if (!cu) return

        if (editingMessageId) {
            await supabase.from('messages').update({ content, edited: true }).eq('id', editingMessageId)
            editingMessageId = null
            messageInput.placeholder = 'پیامت رو بنویس...'
            chatForm.querySelector('button').textContent = '📨'
            chatForm.querySelector('button').style.background = ''
        } else {
            const msg = {
                content,
                user_id: String(cu.id),
                user_name: cu.name,
                user_avatar: cu.avatar || '👤',
                user_color: cu.color || '#6c5ce7',
                chat_type: currentChatType
            }
            if (currentChatType === 'group') msg.group_id = currentGroupId
            else msg.receiver_id = currentReceiverId
            await supabase.from('messages').insert([msg])
        }
        messageInput.value = ''
    })

    window.deleteMessage = async (id) => {
        if (!await window.showConfirm('حذف پیام؟', 'حذف')) return
        await supabase.from('messages').delete().eq('id', id)
    }

    window.editMessage = (id, content) => {
        editingMessageId = id
        messageInput.value = content
        messageInput.focus()
        const btn = chatForm.querySelector('button')
        btn.textContent = '✏️'
        btn.style.background = '#ffa502'
    }

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editingMessageId) {
            editingMessageId = null
            messageInput.value = ''
            const btn = chatForm.querySelector('button')
            btn.textContent = '📨'
            btn.style.background = ''
        }
    })

    function scrollToBottom() {
        if (messagesWrapper) {
            messagesWrapper.scrollTop = messagesWrapper.scrollHeight
        }
    }

    // ==================== نوتیفیکیشن ====================
    async function loadUnreadCounts() {
        const cu = getCurrentUser()
        if (!cu) return

        const { data } = await supabase.from('unread_messages').select('*').eq('user_id', String(cu.id))
        if (data) {
            data.forEach(row => {
                unreadCounts[row.chat_key] = row.count
            })
        }
        updateUnreadBadges()
    }

    async function saveUnreadToDB(userId, chatKey, count) {
        await supabase.from('unread_messages').upsert({
            user_id: String(userId),
            chat_key: chatKey,
            count: count,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, chat_key' })
    }

    async function clearUnreadFromDB(chatKey) {
        const cu = getCurrentUser()
        if (!cu) return
        unreadCounts[chatKey] = 0
        updateUnreadBadges()
        await supabase.from('unread_messages').upsert({
            user_id: String(cu.id),
            chat_key: chatKey,
            count: 0,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, chat_key' })
    }

    function updateUnreadBadges() {
        document.querySelectorAll('.unread-badge, .unread-count').forEach(el => el.remove())

        document.querySelectorAll('.chat-tab').forEach(tab => {
            let key
            const groupId = tab.dataset.group
            const userId = tab.dataset.user

            if (groupId) key = `group-${groupId}`
            else if (userId) key = `private-${userId}`
            else return

            const count = unreadCounts[key] || 0
            if (count > 0) {
                const badge = document.createElement('span')
                if (count === 1) {
                    badge.className = 'unread-badge'
                } else {
                    badge.className = 'unread-count'
                    badge.textContent = count > 99 ? '99+' : count
                }
                tab.style.position = 'relative'
                tab.appendChild(badge)
            }
        })
    }

    // ==================== گروه و چت ====================
    async function loadGroupChat(groupId = null) {
        currentChatType = 'group'

        if (groupId) {
            currentGroupId = groupId
            const { data: group } = await supabase.from('chat_groups').select('*').eq('id', groupId).single()
            if (chatHeader && group) chatHeader.innerHTML = `💬 ${group.name}`
            clearUnreadFromDB(`group-${groupId}`)
            loadMessages()
            return
        }

        let { data: groups } = await supabase.from('chat_groups').select('*').order('created_at', { ascending: true }).limit(1)
        if (!groups || groups.length === 0) {
            const cu = getCurrentUser()
            const { data: newGroup } = await supabase.from('chat_groups').insert([{
                name: 'گروه اصلی', creator_id: cu?.id, creator_name: cu?.name
            }]).select()
            groups = newGroup
        }
        currentGroupId = groups[0].id
        currentReceiverId = null
        if (chatHeader) chatHeader.innerHTML = `💬 ${groups[0].name}`
        clearUnreadFromDB(`group-${currentGroupId}`)
        loadMessages()
    }

    window.switchToPrivateChat = async (receiverId, receiverName) => {
        currentChatType = 'private'
        currentReceiverId = receiverId
        currentGroupId = null
        const info = USERS_DATABASE[receiverName] || { avatar: '👤' }
        const av = info.avatar || '👤'
        const avImg = (av.includes('/') || av.includes('.')) ? `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av
        if (chatHeader) chatHeader.innerHTML = `${avImg} ${receiverName}`
        clearUnreadFromDB(`private-${receiverId}`)
        loadMessages()
    }

    window.switchToGroup = (groupId, groupName) => {
        currentChatType = 'group'
        currentGroupId = groupId
        currentReceiverId = null
        if (chatHeader) chatHeader.innerHTML = `💬 ${groupName}`
        document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active'))
        const tab = document.querySelector(`.chat-tab[data-group="${groupId}"]`)
        if (tab) tab.classList.add('active')
        clearUnreadFromDB(`group-${groupId}`)
        loadMessages()
    }

    window.deleteGroup = async (groupId, groupName) => {
        if (!isAdmin()) {
            window.showToast('فقط ادمین می‌تونه گروه رو حذف کنه', 'error')
            return
        }
        const confirmed = await window.showConfirm(`گروه "${groupName}" با تمام پیام‌هاش حذف بشه؟`, 'حذف گروه')
        if (!confirmed) return
        const { error } = await supabase.from('chat_groups').delete().eq('id', groupId)
        if (error) window.showToast('خطا در حذف گروه', 'error')
        else {
            window.showToast('گروه حذف شد ✅', 'success')
            document.querySelector('.chat-selector')?.remove()
            await setupGroupSelector()
            loadGroupChat()
        }
    }

    async function loadMessages() {
        let query = supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(100)
        if (currentChatType === 'group') {
            query = query.eq('chat_type', 'group').eq('group_id', currentGroupId)
        } else {
            const cu = getCurrentUser()
            query = query.eq('chat_type', 'private').or(
                `and(user_id.eq.${String(cu.id)},receiver_id.eq.${currentReceiverId}),and(user_id.eq.${currentReceiverId},receiver_id.eq.${String(cu.id)})`
            )
        }
        const { data } = await query
        messagesContainer.innerHTML = ''
        if (data && data.length > 0) {
            data.forEach(msg => displayMessage(msg))
        } else {
            messagesContainer.innerHTML = '<div style="text-align:center;color:#9d9dab;padding:40px;"><span style="font-size:40px;">💬</span><p>پیامی نیست</p></div>'
        }
        scrollToBottom()
    }

    function displayMessage(msg) {
        const cu = getCurrentUser()
        const isSent = msg.user_id === String(cu.id)
        const div = document.createElement('div')
        div.className = `message ${isSent ? 'sent' : 'received'}`
        div.id = `msg-${msg.id}`
        div.style.position = 'relative'
        const av = msg.user_avatar || '👤'
        const avImg = av.includes('/') || av.includes('.') ? `<img src="${av}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av
        const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : ''
        div.innerHTML = `
            <div class="sender">${avImg} ${msg.user_name || 'ناشناس'}</div>
            <div class="msg-content">${msg.content}</div>
            <div class="time">${time}${msg.edited ? ' <span class="edited-tag">ویرایش شده</span>' : ''}</div>
            ${isSent ? `<div class="msg-actions"><button class="msg-action-btn edit-btn" onclick="window.editMessage('${msg.id}','${msg.content.replace(/'/g, "\\'")}')">✏️</button><button class="msg-action-btn delete-btn" onclick="window.deleteMessage('${msg.id}')">🗑️</button></div>` : ''}
        `
        messagesContainer.appendChild(div)
    }

    async function setupGroupSelector() {
        const chatContainer = document.querySelector('.chat-container')
        if (!chatContainer || document.querySelector('.chat-selector')) return

        const { data: groups } = await supabase.from('chat_groups').select('*').order('created_at', { ascending: true })
        const currentUserName = getCurrentUser()?.name
        const admin = isAdmin()

        const selector = document.createElement('div')
        selector.className = 'chat-selector'
        selector.innerHTML = `
            <div class="chat-tabs" id="chat-tabs">
                ${(groups || []).map(g => `
                    <div class="chat-tab-wrapper">
                        <button class="chat-tab ${g.id === currentGroupId ? 'active' : ''}" data-group="${g.id}" onclick="window.switchToGroup('${g.id}', '${g.name}')">
                            👥 ${g.name}
                        </button>
                        ${admin ? `<button class="delete-group-btn" onclick="event.stopPropagation(); window.deleteGroup('${g.id}', '${g.name}')" title="حذف گروه">×</button>` : ''}
                    </div>
                `).join('')}
                ${ALLOWED_USERS.filter(n => n !== currentUserName).map(name => {
            const info = USERS_DATABASE[name]
            if (!info) return ''
            const av = info.avatar || '👤'
            const avImg = (av.includes('/') || av.includes('.')) ? `<img src="${av}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:3px;">` : av
            return `<button class="chat-tab" data-user="${info.id}" onclick="window.switchToPrivateChat('${info.id}', '${name}'); document.querySelectorAll('.chat-tab').forEach(b=>b.classList.remove('active')); this.classList.add('active');">${avImg} ${name}</button>`
        }).join('')}
${admin ? `<button class="chat-tab admin-tab" onclick="window.showCreateGroupModal()" title="ساخت گروه جدید">
    <img src="assets/icons/add-group.png" alt="گروه جدید" style="width:18px;height:18px;object-fit:contain;">
</button>` : ''}
            </div>
        `

        const headerEl = document.querySelector('.chat-header')
        if (headerEl) {
            headerEl.after(selector)
        }

        updateUnreadBadges()
    }

    window.showCreateGroupModal = () => {
        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal" style="max-width:450px;">
                <span class="modal-icon">👥</span>
                <div class="modal-title">ساخت گروه جدید</div>
                <div class="modal-message">
                    <input type="text" id="new-group-name" class="prompt-input" placeholder="اسم گروه..." style="margin-bottom:12px;">
                    <div style="text-align:right; max-height:200px; overflow-y:auto;">
                        <p style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">اعضا رو انتخاب کن:</p>
                        ${ALLOWED_USERS.map(name => {
            const info = USERS_DATABASE[name]
            if (!info) return ''
            const av = info.avatar || '👤'
            const avImg = (av.includes('/') || av.includes('.')) ? `<img src="${av}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av
            return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:14px;"><input type="checkbox" value="${name}" class="group-member-check" checked> ${avImg} ${name}</label>`
        }).join('')}
                    </div>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn primary" id="create-group-btn">ایجاد گروه</button>
                    <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">لغو</button>
                </div>
            </div>
        `
        document.body.appendChild(overlay)

        overlay.querySelector('#create-group-btn').addEventListener('click', async () => {
            const name = overlay.querySelector('#new-group-name').value.trim()
            if (!name) { window.showToast('اسم گروه رو بنویس', 'warning'); return }
            const checked = overlay.querySelectorAll('.group-member-check:checked')
            const members = Array.from(checked).map(c => c.value)
            if (members.length === 0) { window.showToast('حداقل یه عضو انتخاب کن', 'warning'); return }
            const cu = getCurrentUser()
            const { data: group, error } = await supabase.from('chat_groups').insert([{
                name, creator_id: cu?.id, creator_name: cu?.name
            }]).select()
            if (error) { window.showToast('خطا در ساخت گروه', 'error'); return }
            const groupId = group[0].id
            for (const memberName of members) {
                const info = USERS_DATABASE[memberName]
                await supabase.from('group_members').insert([{ group_id: groupId, user_id: info?.id, user_name: memberName }])
            }
            overlay.remove()
            window.showToast('گروه ساخته شد ✅', 'success')
            document.querySelector('.chat-selector')?.remove()
            await setupGroupSelector()
            window.switchToGroup(groupId, name)
        })

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    }

    window.refreshGroups = async () => {
        document.querySelector('.chat-selector')?.remove()
        await setupGroupSelector()
    }
}