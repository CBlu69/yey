// js/chat.js - نسخه نهایی با ری‌اکشن، پین، ریپلای، ویس، نظرسنجی
import { supabase } from './supabase.js'
import { getCurrentUser, isAdmin } from './auth.js'
import { ALLOWED_USERS, USERS_DATABASE } from './config.js'

let currentChatType = 'group'
let currentGroupId = null
let currentReceiverId = null
let unreadCounts = {}
let replyingTo = null
let mediaRecorder = null
let audioChunks = []
let recordingTimer = null
let recordingSeconds = 0

// ============ تابع کمکی آواتار ============
function getAvatarHTML(avatar, size = 22) {
    if (!avatar) return '👤'
    if (avatar.includes('/') || avatar.includes('.png') || avatar.includes('.jpg') || avatar.includes('.jpeg') || avatar.includes('.gif')) {
        return `<img src="${avatar}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">`
    }
    return avatar
}

// ============ Long Press برای موبایل ============
function addLongPress(element, callback, duration = 500) {
    let timer
    let longPressTriggered = false

    element.addEventListener('touchstart', (e) => {
        longPressTriggered = false
        timer = setTimeout(() => {
            longPressTriggered = true
            callback(e)
        }, duration)
    })

    element.addEventListener('touchend', () => {
        clearTimeout(timer)
        if (longPressTriggered) {
            setTimeout(() => { longPressTriggered = false }, 100)
        }
    })

    element.addEventListener('touchmove', () => {
        clearTimeout(timer)
        longPressTriggered = false
    })
}

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
    setupVoiceRecorder()
    setupPollButton()

    if (messagesWrapper && scrollBtn) {
        messagesWrapper.addEventListener('scroll', () => {
            const isNearBottom = messagesWrapper.scrollHeight - messagesWrapper.scrollTop - messagesWrapper.clientHeight < 100
            scrollBtn.classList.toggle('show', !isNearBottom)
        })
    }

    // ==================== Real-time Messages ====================
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
                let key = msg.chat_type === 'group' ? `group-${msg.group_id}` : `private-${msg.user_id}`
                unreadCounts[key] = (unreadCounts[key] || 0) + 1
                saveUnreadToDB(cu.id, key, unreadCounts[key])
                updateUnreadBadges()
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
            document.getElementById(`msg-${payload.old.id}`)?.remove()
            document.getElementById(`pinned-${payload.old.id}`)?.remove()
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
            const el = document.getElementById(`msg-${payload.new.id}`)
            if (el) {
                const contentEl = el.querySelector('.msg-content')
                if (contentEl) contentEl.textContent = payload.new.content
            }
        })
        .subscribe()

    // ==================== Real-time Reactions ====================
    supabase.channel('reaction-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, (payload) => {
            refreshReactions(payload.new.message_id)
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (payload) => {
            refreshReactions(payload.old.message_id)
        })
        .subscribe()

    // ==================== Real-time Pins ====================
    supabase.channel('pin-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pinned_messages' }, () => {
            loadPinnedMessage()
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pinned_messages' }, (payload) => {
            document.getElementById(`pinned-${payload.old.message_id}`)?.remove()
        })
        .subscribe()

    // ==================== Real-time Voice ====================
    supabase.channel('voice-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_messages' }, (payload) => {
            if (currentChatType === 'group') {
                displayVoiceMessage(payload.new)
                scrollToBottom()
            }
        })
        .subscribe()

    // ==================== Real-time Polls ====================
    supabase.channel('poll-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'polls' }, (payload) => {
            if (currentChatType === 'group' && payload.new.group_id === currentGroupId) {
                if (!document.getElementById(`poll-${payload.new.id}`)) {
                    displayPoll(payload.new)
                    scrollToBottom()
                }
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'polls' }, (payload) => {
            document.getElementById(`poll-${payload.old.id}`)?.remove()
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poll_votes' }, (payload) => {
            refreshPoll(payload.new.poll_id)
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'poll_votes' }, (payload) => {
            refreshPoll(payload.old.poll_id)
        })
        .subscribe()

    // ==================== ارسال پیام ====================
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
            chatForm.querySelector('button[type="submit"]').innerHTML = '<img src="assets/icons/send.png" alt="ارسال" style="width:20px;height:20px;object-fit:contain;">'
        } else {
            const msg = {
                content,
                user_id: String(cu.id),
                user_name: cu.name,
                user_avatar: cu.avatar || '👤',
                user_color: cu.color || '#d4a017',
                chat_type: currentChatType,
                reply_to: replyingTo
            }
            if (currentChatType === 'group') msg.group_id = currentGroupId
            else msg.receiver_id = currentReceiverId
            await supabase.from('messages').insert([msg])
            cancelReply()
        }
        messageInput.value = ''
    })

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (replyingTo) cancelReply()
            if (editingMessageId) {
                editingMessageId = null
                messageInput.value = ''
                messageInput.placeholder = 'پیامت رو بنویس...'
                chatForm.querySelector('button[type="submit"]').innerHTML = '<img src="assets/icons/send.png" alt="ارسال" style="width:20px;height:20px;object-fit:contain;">'
            }
        }
    })

    // ==================== ریپلای ====================
    window.replyToMessage = (msgId, userName, content) => {
        replyingTo = { id: msgId, user_name: userName, content }
        const container = document.getElementById('reply-preview-container')
        if (!container) return
        container.innerHTML = `
            <div class="reply-preview">
                <div>
                    <div class="reply-user">↩ ${userName}</div>
                    <div class="reply-content">${(content || '').substring(0, 50)}</div>
                </div>
                <button class="cancel-reply" onclick="window.cancelReply()">✕</button>
            </div>`
        messageInput.focus()
    }

    window.cancelReply = () => {
        replyingTo = null
        const container = document.getElementById('reply-preview-container')
        if (container) container.innerHTML = ''
    }

    // ==================== پین ====================
    window.pinMessage = async (msgId) => {
        const cu = getCurrentUser()
        const { error } = await supabase.from('pinned_messages').upsert({
            message_id: msgId,
            pinned_by: cu.name
        })
        if (error) window.showToast('خطا در پین کردن', 'error')
        else window.showToast('📌 پیام پین شد', 'success')
    }

    window.unpinMessage = async (msgId) => {
        await supabase.from('pinned_messages').delete().eq('message_id', msgId)
    }

    async function loadPinnedMessage() {
        if (currentChatType !== 'group') return
        const { data } = await supabase
            .from('pinned_messages')
            .select('*, messages(*)')
            .order('pinned_at', { ascending: false })
            .limit(1)

        document.querySelector('.pinned-message')?.remove()

        if (!data || data.length === 0) return
        const pin = data[0]
        const msg = pin.messages
        if (!msg || msg.group_id !== currentGroupId) return

        const pinDiv = document.createElement('div')
        pinDiv.className = 'pinned-message'
        pinDiv.id = `pinned-${msg.id}`
        pinDiv.innerHTML = `
            <span class="pin-icon">📌</span>
            <span class="pin-content">${msg.user_name}: ${(msg.content || '').substring(0, 40)}</span>
            <button class="pin-close" onclick="window.unpinMessage('${msg.id}')">✕</button>`
        messagesContainer.parentNode.insertBefore(pinDiv, messagesContainer)
    }

    // ==================== ری‌اکشن ====================
    window.toggleReactionPicker = (msgId, event) => {
        event.stopPropagation()
        document.querySelector('.message-menu')?.remove()
        document.querySelector('.reaction-picker')?.remove()

        const msgEl = document.getElementById(`msg-${msgId}`)
        if (!msgEl) return
        const picker = document.createElement('div')
        picker.className = 'reaction-picker'
        picker.innerHTML = ['❤️', '😂', '🔥', '😮', '👏', '😢'].map(r =>
            `<span class="reaction-emoji" onclick="window.addReaction('${msgId}','${r}'); this.closest('.reaction-picker')?.remove();">${r}</span>`
        ).join('')
        msgEl.appendChild(picker)

        setTimeout(() => {
            const closePicker = (e) => {
                if (!picker.contains(e.target)) {
                    picker.remove()
                    document.removeEventListener('click', closePicker)
                    document.removeEventListener('touchstart', closePicker)
                }
            }
            document.addEventListener('click', closePicker)
            document.addEventListener('touchstart', closePicker)
        }, 100)
    }

    window.addReaction = async (msgId, reaction) => {
        const cu = getCurrentUser()
        const { data: existing } = await supabase
            .from('message_reactions')
            .select('*')
            .eq('message_id', msgId)
            .eq('user_id', String(cu.id))
            .eq('reaction', reaction)

        if (existing && existing.length > 0) {
            await supabase.from('message_reactions').delete().eq('id', existing[0].id)
        } else {
            await supabase.from('message_reactions').insert([{
                message_id: msgId,
                user_id: String(cu.id),
                user_name: cu.name,
                reaction
            }])
        }
        document.querySelector('.reaction-picker')?.remove()
    }

    async function refreshReactions(msgId) {
        const msgEl = document.getElementById(`msg-${msgId}`)
        if (!msgEl) return

        let reactionsDiv = msgEl.querySelector('.message-reactions')
        if (!reactionsDiv) {
            reactionsDiv = document.createElement('div')
            reactionsDiv.className = 'message-reactions'
            msgEl.appendChild(reactionsDiv)
        }

        const { data } = await supabase
            .from('message_reactions')
            .select('*')
            .eq('message_id', msgId)

        console.log('🔍 ری‌اکشن‌ها برای', msgId, ':', data) // 👈 ببین چندتا میاد

        if (!data || data.length === 0) {
            reactionsDiv.innerHTML = ''
            return
        }

        const grouped = {}
        data.forEach(r => {
            if (!grouped[r.reaction]) {
                grouped[r.reaction] = { count: 0, users: [] }
            }
            grouped[r.reaction].count++
            grouped[r.reaction].users.push(r.user_name)
        })

        console.log('📊 گروه‌بندی:', grouped) // 👈 ببین گروه‌بندی چطوره

        const cu = getCurrentUser()
        const currentUserId = String(cu?.id)

        reactionsDiv.innerHTML = Object.entries(grouped).map(([emoji, info]) => {
            const isActive = data.some(r => r.user_id === currentUserId && r.reaction === emoji)
            return `<span class="reaction-badge ${isActive ? 'active' : ''}" 
                     onclick="window.addReaction('${msgId}','${emoji}')" 
                     title="${info.users.join(', ')}">
                     ${emoji} ${info.count}
                </span>`
        }).join('')
    }
    // ==================== ویس ====================
    function setupVoiceRecorder() {
        const voiceBtn = document.getElementById('voice-record-btn')
        if (!voiceBtn) return
        voiceBtn.addEventListener('mousedown', startRecording)
        voiceBtn.addEventListener('touchstart', startRecording)
        voiceBtn.addEventListener('mouseup', stopRecording)
        voiceBtn.addEventListener('touchend', stopRecording)
    }

    async function startRecording(e) {
        e.preventDefault()
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            mediaRecorder = new MediaRecorder(stream)
            audioChunks = []
            recordingSeconds = 0
            const timerEl = document.getElementById('voice-timer')
            if (timerEl) timerEl.style.display = 'inline'

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data)
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
                const cu = getCurrentUser()
                const fileName = `voice_${Date.now()}.webm`
                const { data, error } = await supabase.storage.from('voice-messages').upload(fileName, audioBlob)
                if (error) { window.showToast('خطا در آپلود ویس', 'error'); return }
                const { data: urlData } = supabase.storage.from('voice-messages').getPublicUrl(fileName)
                await supabase.from('voice_messages').insert([{
                    user_id: String(cu.id),
                    user_name: cu.name,
                    audio_url: urlData.publicUrl,
                    duration: recordingSeconds
                }])
            }

            mediaRecorder.start()
            recordingTimer = setInterval(() => {
                recordingSeconds++
                const timer = document.getElementById('voice-timer')
                if (timer) timer.textContent = `${recordingSeconds}s`
            }, 1000)
            const btn = document.getElementById('voice-record-btn')
            if (btn) btn.classList.add('recording')
        } catch (err) {
            window.showToast('دسترسی به میکروفون داده نشد', 'error')
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop()
            mediaRecorder.stream.getTracks().forEach(t => t.stop())
            clearInterval(recordingTimer)
            const timer = document.getElementById('voice-timer')
            if (timer) { timer.textContent = '0s'; timer.style.display = 'none' }
            document.getElementById('voice-record-btn')?.classList.remove('recording')
        }
    }

    function displayVoiceMessage(msg) {
        const cu = getCurrentUser()
        const isSent = msg.user_id === String(cu.id)
        const div = document.createElement('div')
        div.className = `message ${isSent ? 'sent' : 'received'}`
        div.id = `msg-${msg.id}`
        div.style.position = 'relative'

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            showVoiceMenu(msg.id, e)
        })
        addLongPress(div, (e) => {
            e.preventDefault()
            showVoiceMenu(msg.id, e)
        })

        div.innerHTML = `
            <div class="sender">${getAvatarHTML(msg.user_avatar)} ${msg.user_name || 'ناشناس'}</div>
            <div class="voice-message">
                <button class="voice-play-btn" onclick="window.playVoice(this, '${msg.audio_url}')">▶️</button>
                <div class="voice-wave">${Array.from({ length: 15 }, () => `<div class="voice-wave-bar" style="height:${Math.random() * 25 + 5}px"></div>`).join('')}</div>
                <span class="voice-duration">${msg.duration || 0}s</span>
            </div>
            ${isSent ? `<div class="msg-actions" style="position:absolute;top:-8px;left:-8px;"><button class="msg-action-btn delete-btn" onclick="window.deleteVoice('${msg.id}', '${msg.audio_url}')">🗑️</button></div>` : ''}
        `
        messagesContainer.appendChild(div)
    }

    function showVoiceMenu(msgId, event) {
        event.stopPropagation()
        document.querySelector('.message-menu')?.remove()
        const msgEl = document.getElementById(`msg-${msgId}`)
        if (!msgEl) return
        const isSent = msgEl.classList.contains('sent')
        const menu = document.createElement('div')
        menu.className = 'message-menu'
        menu.innerHTML = `
            <button onclick="window.toggleReactionPicker('${msgId}', event)" title="ری‌اکشن">😀</button>
            ${isSent || isAdmin() ? `<button onclick="window.deleteVoice('${msgId}'); document.querySelector('.message-menu')?.remove();" class="danger" title="حذف">🗑️</button>` : ''}
        `
        msgEl.appendChild(menu)
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove()
                    document.removeEventListener('click', closeMenu)
                    document.removeEventListener('touchstart', closeMenu)
                }
            }
            document.addEventListener('click', closeMenu)
            document.addEventListener('touchstart', closeMenu)
        }, 100)
    }

    window.deleteVoice = async (voiceId, audioUrl) => {
        const confirmed = await window.showConfirm('ویس حذف بشه؟', 'حذف ویس')
        if (!confirmed) return
        const { error } = await supabase.from('voice_messages').delete().eq('id', voiceId)
        if (audioUrl) {
            const urlParts = audioUrl.split('/')
            const fileName = urlParts[urlParts.length - 1]
            if (fileName) {
                await supabase.storage.from('voice-messages').remove([fileName])
            }
        }
        if (!error) {
            document.getElementById(`msg-${voiceId}`)?.remove()
            window.showToast('ویس حذف شد', 'success')
        } else {
            window.showToast('خطا در حذف ویس', 'error')
        }
    }

    window.playVoice = (btn, url) => {
        if (btn.classList.contains('playing')) {
            btn._audio?.pause()
            btn.textContent = '▶️'
            btn.classList.remove('playing')
            return
        }
        const audio = new Audio(url)
        btn._audio = audio
        btn.textContent = '⏸'
        btn.classList.add('playing')
        audio.play()
        audio.onended = () => {
            btn.textContent = '▶️'
            btn.classList.remove('playing')
        }
    }

    // ==================== نظرسنجی ====================
    function setupPollButton() {
        document.getElementById('poll-btn')?.addEventListener('click', openPollCreator)
    }

    function openPollCreator() {
        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal" style="max-width:450px;">
                <span class="modal-icon">📊</span>
                <div class="modal-title">نظرسنجی جدید</div>
                <div class="modal-message">
                    <input type="text" id="poll-question" class="prompt-input" placeholder="سوال..." style="margin-bottom:12px;">
                    <div id="poll-options-container">
                        <input type="text" class="poll-option-input prompt-input" placeholder="گزینه ۱" style="margin-bottom:8px;">
                        <input type="text" class="poll-option-input prompt-input" placeholder="گزینه ۲" style="margin-bottom:8px;">
                    </div>
                    <button class="modal-btn cancel" id="add-poll-option" style="width:100%;margin-bottom:12px;">➕ افزودن گزینه</button>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn primary" id="create-poll-btn">📊 ایجاد</button>
                    <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">لغو</button>
                </div>
            </div>`
        document.body.appendChild(overlay)

        overlay.querySelector('#add-poll-option').addEventListener('click', () => {
            const container = overlay.querySelector('#poll-options-container')
            const input = document.createElement('input')
            input.type = 'text'
            input.className = 'poll-option-input prompt-input'
            input.placeholder = `گزینه ${container.children.length + 1}`
            input.style.marginBottom = '8px'
            container.appendChild(input)
        })

        overlay.querySelector('#create-poll-btn').addEventListener('click', async () => {
            const question = overlay.querySelector('#poll-question').value.trim()
            if (!question) { window.showToast('سوال رو بنویس', 'warning'); return }
            const options = Array.from(overlay.querySelectorAll('.poll-option-input')).map(i => i.value.trim()).filter(o => o)
            if (options.length < 2) { window.showToast('حداقل ۲ گزینه لازمه', 'warning'); return }
            const cu = getCurrentUser()
            await supabase.from('polls').insert([{
                question,
                options: JSON.stringify(options),
                created_by: cu.name,
                group_id: currentGroupId
            }])
            overlay.remove()
            window.showToast('نظرسنجی ایجاد شد 📊', 'success')
        })
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    }

    async function displayPoll(poll) {
        const div = document.createElement('div')
        div.className = 'message poll-container'
        div.id = `poll-${poll.id}`
        div.innerHTML = `<div class="poll-message" id="poll-content-${poll.id}"></div>`
        messagesContainer.appendChild(div)
        await refreshPoll(poll.id)
    }

    async function refreshPoll(pollId) {
        const contentDiv = document.getElementById(`poll-content-${pollId}`)
        if (!contentDiv) return
        const { data: poll } = await supabase.from('polls').select('*').eq('id', pollId).single()
        if (!poll) return
        const { data: votes } = await supabase.from('poll_votes').select('*').eq('poll_id', pollId)
        const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options
        const totalVotes = votes?.length || 0
        const cu = getCurrentUser()
        const userVote = votes?.find(v => v.user_id === String(cu.id))
        const canDelete = cu?.name === poll.created_by || isAdmin()

        contentDiv.innerHTML = `
            <div class="poll-question">📊 ${poll.question}</div>
            <div class="poll-options">
                ${options.map((opt, i) => {
            const voteCount = votes?.filter(v => v.option_index === i).length || 0
            const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0
            return `<div class="poll-option ${userVote?.option_index === i ? 'voted' : ''}" onclick="window.votePoll('${pollId}', ${i})">
                        <div class="poll-option-bar" style="width:${percent}%"></div>
                        <span class="poll-option-text">${opt}</span>
                        <span class="poll-option-votes">${voteCount} (${percent}%)</span>
                    </div>`
        }).join('')}
            </div>
            <div class="poll-footer">
                <span>${totalVotes} رأی</span>
                <span>توسط ${poll.created_by}</span>
                ${canDelete ? `<button onclick="window.deletePoll('${pollId}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:2px 8px;">🗑️</button>` : ''}
            </div>`
    }

    window.votePoll = async (pollId, optionIndex) => {
        const cu = getCurrentUser()
        const { data: existing } = await supabase.from('poll_votes').select('*').eq('poll_id', pollId).eq('user_id', String(cu.id))
        if (existing?.length > 0) {
            await supabase.from('poll_votes').delete().eq('id', existing[0].id)
        }
        await supabase.from('poll_votes').insert([{ poll_id: pollId, user_id: String(cu.id), option_index: optionIndex }])
    }

    window.deletePoll = async (pollId) => {
        const confirmed = await window.showConfirm('نظرسنجی حذف بشه؟', 'حذف نظرسنجی')
        if (!confirmed) return
        await supabase.from('polls').delete().eq('id', pollId)
        window.showToast('نظرسنجی حذف شد', 'success')
    }

    async function loadPolls() {
        const { data: polls } = await supabase
            .from('polls')
            .select('*')
            .eq('group_id', currentGroupId)
            .order('created_at', { ascending: true })
        if (polls) {
            polls.forEach(poll => {
                if (!document.getElementById(`poll-${poll.id}`)) {
                    displayPoll(poll)
                }
            })
        }
    }

    // ==================== منوی پیام ====================
    function showMessageMenu(msgId, event) {
        event.stopPropagation()
        document.querySelector('.message-menu')?.remove()
        const msgEl = document.getElementById(`msg-${msgId}`)
        if (!msgEl) return
        const cu = getCurrentUser()
        const isSent = msgEl.classList.contains('sent')
        const senderName = msgEl.querySelector('.sender')?.textContent?.trim() || ''
        const msgContent = msgEl.querySelector('.msg-content')?.textContent?.trim() || ''

        const menu = document.createElement('div')
        menu.className = 'message-menu'
        menu.innerHTML = `
            <button onclick="window.replyToMessage('${msgId}','${senderName.replace(/'/g, "\\'")}','${msgContent.replace(/'/g, "\\'")}'); document.querySelector('.message-menu')?.remove();" class="reply-menu-btn" title="پاسخ">↩️</button>
            <button onclick="window.toggleReactionPicker('${msgId}', event)" title="ری‌اکشن">😀</button>
            ${currentChatType === 'group' ? `<button onclick="window.pinMessage('${msgId}'); document.querySelector('.message-menu')?.remove();" class="pin-menu-btn" title="پین">📌</button>` : ''}
            ${isSent ? `<button onclick="window.editMessage('${msgId}','${msgContent.replace(/'/g, "\\'")}'); document.querySelector('.message-menu')?.remove();" title="ویرایش">✏️</button>` : ''}
            ${isSent || isAdmin() ? `<button onclick="window.deleteMessage('${msgId}'); document.querySelector('.message-menu')?.remove();" class="danger" title="حذف">🗑️</button>` : ''}
        `
        msgEl.appendChild(menu)

        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove()
                    document.removeEventListener('click', closeMenu)
                    document.removeEventListener('touchstart', closeMenu)
                }
            }
            document.addEventListener('click', closeMenu)
            document.addEventListener('touchstart', closeMenu)
        }, 100)
    }

    // ==================== نمایش پیام ====================
    function displayMessage(msg) {
        const cu = getCurrentUser()
        const isSent = msg.user_id === String(cu.id)
        const div = document.createElement('div')
        div.className = `message ${isSent ? 'sent' : 'received'}`
        div.id = `msg-${msg.id}`
        div.style.position = 'relative'

        // کامپیوتر: راست‌کلیک
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            showMessageMenu(msg.id, e)
        })
        // موبایل: نگه داشتن
        addLongPress(div, (e) => {
            e.preventDefault()
            showMessageMenu(msg.id, e)
        })
        // کامپیوتر: دابل کلیک
        div.addEventListener('dblclick', () => showMessageMenu(msg.id, new Event('click')))

        const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : ''

        let replyHTML = ''
        if (msg.reply_to && msg.reply_to.id) {
            replyHTML = `<div class="reply-reference" onclick="document.getElementById('msg-${msg.reply_to.id}')?.scrollIntoView({behavior:'smooth',block:'center'})">
                <div class="reply-ref-user">↩ ${msg.reply_to.user_name}</div>
                <div class="reply-ref-text">${(msg.reply_to.content || '').substring(0, 40)}</div>
            </div>`
        }

        div.innerHTML = `
            <div class="sender">${getAvatarHTML(msg.user_avatar)} ${msg.user_name || 'ناشناس'}</div>
            ${replyHTML}
            <div class="msg-content">${msg.content}</div>
            <div class="time">${time}${msg.edited ? ' <span class="edited-tag">ویرایش شده</span>' : ''}</div>
        `
        messagesContainer.appendChild(div)
        refreshReactions(msg.id)
    }

    // ==================== حذف و ویرایش ====================
    window.deleteMessage = async (id) => {
        if (!await window.showConfirm('حذف پیام؟', 'حذف')) return
        await supabase.from('messages').delete().eq('id', id)
    }

    window.editMessage = (id, content) => {
        editingMessageId = id
        const input = document.getElementById('message-input')
        if (input) {
            input.value = content
            input.focus()
            const btn = document.getElementById('chat-form')?.querySelector('button[type="submit"]')
            if (btn) {
                btn.innerHTML = '✏️'
                btn.style.background = '#ffa502'
            }
        }
    }

    // ==================== اسکرول ====================
    function scrollToBottom() {
        if (messagesWrapper) messagesWrapper.scrollTop = messagesWrapper.scrollHeight
    }

    // ==================== نوتیفیکیشن ====================
    async function loadUnreadCounts() {
        const cu = getCurrentUser()
        if (!cu) return
        const { data } = await supabase.from('unread_messages').select('*').eq('user_id', String(cu.id))
        if (data) data.forEach(row => { unreadCounts[row.chat_key] = row.count })
        updateUnreadBadges()
    }

    async function saveUnreadToDB(userId, chatKey, count) {
        await supabase.from('unread_messages').upsert({
            user_id: String(userId), chat_key: chatKey, count, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, chat_key' })
    }

    async function clearUnreadFromDB(chatKey) {
        const cu = getCurrentUser()
        if (!cu) return
        unreadCounts[chatKey] = 0
        updateUnreadBadges()
        await supabase.from('unread_messages').upsert({
            user_id: String(cu.id), chat_key: chatKey, count: 0, updated_at: new Date().toISOString()
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
                badge.className = count === 1 ? 'unread-badge' : 'unread-count'
                if (count > 1) badge.textContent = count > 99 ? '99+' : count
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
            loadPinnedMessage()
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
        loadPinnedMessage()
    }

    window.switchToPrivateChat = async (receiverId, receiverName) => {
        currentChatType = 'private'
        currentReceiverId = receiverId
        currentGroupId = null
        const info = USERS_DATABASE[receiverName] || { avatar: '👤' }
        if (chatHeader) chatHeader.innerHTML = `${getAvatarHTML(info.avatar, 24)} ${receiverName}`
        document.querySelector('.pinned-message')?.remove()
        clearUnreadFromDB(`private-${receiverId}`)
        loadMessages()
    }

    window.switchToGroup = (groupId, groupName) => {
        currentChatType = 'group'
        currentGroupId = groupId
        currentReceiverId = null
        if (chatHeader) chatHeader.innerHTML = `💬 ${groupName}`
        document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active'))
        document.querySelector(`.chat-tab[data-group="${groupId}"]`)?.classList.add('active')
        clearUnreadFromDB(`group-${groupId}`)
        loadMessages()
        loadPinnedMessage()
    }

    window.deleteGroup = async (groupId, groupName) => {
        if (!isAdmin()) { window.showToast('فقط ادمین می‌تونه گروه رو حذف کنه', 'error'); return }
        const confirmed = await window.showConfirm(`گروه "${groupName}" حذف بشه؟`, 'حذف گروه')
        if (!confirmed) return
        await supabase.from('chat_groups').delete().eq('id', groupId)
        window.showToast('گروه حذف شد ✅', 'success')
        document.querySelector('.chat-selector')?.remove()
        await setupGroupSelector()
        loadGroupChat()
    }

    async function loadMessages() {
        document.querySelectorAll('.poll-container').forEach(el => el.remove())

        let query = supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(100)
        if (currentChatType === 'group') query = query.eq('chat_type', 'group').eq('group_id', currentGroupId)
        else {
            const cu = getCurrentUser()
            query = query.eq('chat_type', 'private').or(
                `and(user_id.eq.${String(cu.id)},receiver_id.eq.${currentReceiverId}),and(user_id.eq.${currentReceiverId},receiver_id.eq.${String(cu.id)})`
            )
        }
        const { data } = await query
        messagesContainer.innerHTML = ''
        if (data?.length > 0) data.forEach(msg => displayMessage(msg))
        else messagesContainer.innerHTML = '<div style="text-align:center;color:#9d9dab;padding:40px;"><span style="font-size:40px;">💬</span><p>پیامی نیست</p></div>'
        scrollToBottom()

        if (currentChatType === 'group') loadPolls()
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
                        <button class="chat-tab ${g.id === currentGroupId ? 'active' : ''}" data-group="${g.id}" onclick="window.switchToGroup('${g.id}', '${g.name}')">👥 ${g.name}</button>
                        ${admin ? `<button class="delete-group-btn" onclick="event.stopPropagation(); window.deleteGroup('${g.id}', '${g.name}')" title="حذف">×</button>` : ''}
                    </div>`).join('')}
                ${ALLOWED_USERS.filter(n => n !== currentUserName).map(name => {
            const info = USERS_DATABASE[name]
            if (!info) return ''
            return `<button class="chat-tab" data-user="${info.id}" onclick="window.switchToPrivateChat('${info.id}', '${name}'); document.querySelectorAll('.chat-tab').forEach(b=>b.classList.remove('active')); this.classList.add('active');">${getAvatarHTML(info.avatar, 20)} ${name}</button>`
        }).join('')}
                ${admin ? `<button class="chat-tab admin-tab" onclick="window.showCreateGroupModal()" title="ساخت گروه جدید">➕</button>` : ''}
            </div>`
        const headerEl = document.querySelector('.chat-header')
        if (headerEl) headerEl.after(selector)
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
                    <div style="text-align:right;max-height:200px;overflow-y:auto;">
                        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">اعضا:</p>
                        ${ALLOWED_USERS.map(name => {
            const info = USERS_DATABASE[name]
            if (!info) return ''
            return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:14px;"><input type="checkbox" value="${name}" class="group-member-check" checked> ${getAvatarHTML(info.avatar, 20)} ${name}</label>`
        }).join('')}
                    </div>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn primary" id="create-group-btn">ایجاد</button>
                    <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">لغو</button>
                </div>
            </div>`
        document.body.appendChild(overlay)
        overlay.querySelector('#create-group-btn').addEventListener('click', async () => {
            const name = overlay.querySelector('#new-group-name').value.trim()
            if (!name) { window.showToast('اسم گروه رو بنویس', 'warning'); return }
            const checked = overlay.querySelectorAll('.group-member-check:checked')
            const members = Array.from(checked).map(c => c.value)
            if (members.length === 0) { window.showToast('حداقل یه عضو انتخاب کن', 'warning'); return }
            const cu = getCurrentUser()
            const { data: group } = await supabase.from('chat_groups').insert([{ name, creator_id: cu?.id, creator_name: cu?.name }]).select()
            if (!group) { window.showToast('خطا در ساخت گروه', 'error'); return }
            for (const memberName of members) {
                const info = USERS_DATABASE[memberName]
                await supabase.from('group_members').insert([{ group_id: group[0].id, user_id: info?.id, user_name: memberName }])
            }
            overlay.remove()
            window.showToast('گروه ساخته شد ✅', 'success')
            document.querySelector('.chat-selector')?.remove()
            await setupGroupSelector()
            window.switchToGroup(group[0].id, name)
        })
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    }

    window.refreshGroups = async () => {
        document.querySelector('.chat-selector')?.remove()
        await setupGroupSelector()
    }
}