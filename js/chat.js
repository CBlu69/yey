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
let isRecording = false
let voiceSchemaChecked = false
let voiceHasChatContext = false
let typingChannel = null
let typingStopTimeout = null
let onlineUsers = {}
let presenceChannel = null

function getChatKey() {
    return currentChatType === 'group' ? `group-${currentGroupId}` : `private-${currentReceiverId}`
}

const REACTION_EMOJIS = ['👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '😢', '🎉', '🤩', '🙏', '👌', '💯', '🤣', '⚡', '🏆', '💔', '😡', '😎', '😂', '😍']

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
    setupAttachButton()
    setupTypingIndicator()
    setupChatFileInput()
    setupPresence()


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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_messages' }, async (payload) => {
            await checkVoiceSchema()
            const v = payload.new
            if (voiceChatMatches(v)) {
                if (!document.getElementById(`msg-${v.id}`)) {
                    displayVoiceMessage(v)
                    scrollToBottom()
                }
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voice_messages' }, (payload) => {
            document.getElementById(`msg-${payload.old.id}`)?.remove()
        })
        .subscribe()

    // ==================== Real-time Polls ====================
    supabase.channel('poll-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'polls' }, (payload) => {
            if (currentChatType === 'group') {
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

    // ==================== تایپینگ ایندیکیتور ====================
    function setupTypingIndicator() {
        const cu = getCurrentUser()
        if (!cu || typingChannel) return

        typingChannel = supabase.channel('typing-presence', {
            config: { presence: { key: String(cu.id) } }
        })

        typingChannel.on('presence', { event: 'sync' }, () => updateTypingIndicator())

        typingChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await typingChannel.track({ id: String(cu.id), name: cu.name, typing: false, chat: getChatKey() })
            }
        })

        messageInput.addEventListener('input', () => {
            const c = getCurrentUser()
            if (!c || !typingChannel) return
            clearTimeout(typingStopTimeout)
            typingChannel.track({ id: String(c.id), name: c.name, typing: true, chat: getChatKey() })
            typingStopTimeout = setTimeout(() => {
                typingChannel.track({ id: String(c.id), name: c.name, typing: false, chat: getChatKey() })
            }, 1500)
        })

        chatForm.addEventListener('submit', () => {
            const c = getCurrentUser()
            if (typingChannel && c) {
                clearTimeout(typingStopTimeout)
                typingChannel.track({ id: String(c.id), name: c.name, typing: false, chat: getChatKey() })
            }
        })
    }

    function updateTypingIndicator() {
        const el = document.getElementById('typing-indicator')
        if (!el) return
        const cu = getCurrentUser()
        if (!typingChannel) { el.style.display = 'none'; return }

        const state = typingChannel.presenceState() || {}
        const chatKey = getChatKey()
        const typers = []
        Object.values(state).forEach(entries => {
            (entries || []).forEach(p => {
                if (p && p.typing && p.chat === chatKey && p.id !== String(cu?.id)) typers.push(p.name)
            })
        })

        if (typers.length === 0) {
            el.style.display = 'none'
        } else {
            const label = typers.length === 1
                ? `${typers[0]} در حال نوشتن`
                : `${typers.slice(0, 2).join(' و ')} در حال نوشتن`
            const textEl = el.querySelector('.typing-text')
            if (textEl) textEl.textContent = label
            el.style.display = 'flex'
        }
    }

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
        else {
            window.showToast('📌 پیام پین شد', 'success')
            loadPinnedMessage()
        }
    }

    window.unpinMessage = async (msgId) => {
        const { error } = await supabase.from('pinned_messages').delete().eq('message_id', msgId)
        if (!error) {
            document.querySelector(`#pinned-${msgId}`)?.remove()
            document.querySelector('.pinned-message')?.remove()
        }
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
        let msg = pin.messages
        if (!msg) {
            const { data: m } = await supabase.from('messages').select('*').eq('id', pin.message_id).maybeSingle()
            msg = m
        }
        if (!msg || msg.group_id !== currentGroupId) return

        const pinDiv = document.createElement('div')
        pinDiv.className = 'pinned-message'
        pinDiv.id = `pinned-${msg.id}`
        pinDiv.innerHTML = `
    <span class="pin-icon"><img src="assets/icons/pin.png" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;"></span>
    <span class="pin-content">${msg.user_name}: ${(msg.content || '').substring(0, 40)}</span>
    <button class="pin-close" onclick="window.unpinMessage('${msg.id}')">✕</button>`
        messagesContainer.parentNode.insertBefore(pinDiv, messagesContainer)
    }

    // ==================== ری‌اکشن ====================
    window.toggleReactionPicker = (msgId, event) => {
        event?.stopPropagation?.()
        document.querySelector('.reaction-picker-overlay')?.remove()

        const overlay = document.createElement('div')
        overlay.className = 'reaction-picker-overlay'
        overlay.innerHTML = `
            <div class="reaction-picker" onclick="event.stopPropagation()">
                <div class="reaction-picker-header">
                    <span>واکنش</span>
                    <button class="reaction-picker-close" onclick="this.closest('.reaction-picker-overlay')?.remove()">✕</button>
                </div>
                <div class="reaction-picker-grid">
                    ${REACTION_EMOJIS.map(r => `<span class="reaction-emoji" data-emoji="${r}">${r}</span>`).join('')}
                </div>
<button class="reaction-remove-all" onclick="window.removeAllMyReactions('${msgId}'); this.closest('.reaction-picker-overlay')?.remove();">
    <img src="assets/icons/delete.png" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-left:4px;"> حذف واکنش‌های من
</button>
            </div>`
        document.body.appendChild(overlay)

        overlay.querySelectorAll('.reaction-emoji').forEach(el => {
            el.addEventListener('click', () => {
                window.addReaction(msgId, el.dataset.emoji)
                overlay.remove()
            })
        })

        overlay.addEventListener('click', () => overlay.remove())
    }

    window.removeAllMyReactions = async (msgId) => {
        const cu = getCurrentUser()
        if (!cu) return
        await supabase.from('message_reactions')
            .delete()
            .eq('message_id', msgId)
            .eq('user_id', String(cu.id))
        refreshReactions(msgId)
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
        document.querySelector('.reaction-picker-overlay')?.remove()
        refreshReactions(msgId)
    }

    window.removeReaction = async (msgId, reaction) => {
        const cu = getCurrentUser()
        if (!cu) return
        await supabase.from('message_reactions')
            .delete()
            .eq('message_id', msgId)
            .eq('user_id', String(cu.id))
            .eq('reaction', reaction)
        refreshReactions(msgId)
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
                     ${isActive ? `<span class="reaction-remove" onclick="event.stopPropagation(); window.removeReaction('${msgId}','${emoji}')" title="حذف واکنش">×</span>` : ''}
                </span>`
        }).join('')
    }
    // ==================== ویس (تلگرامی) ====================
    let recordingStream = null
    let recordingCanceled = false
    let recordingExt = 'webm'
    let cancelArmed = false
    let recordStartX = 0
    let recordStartY = 0

    function formatTime(sec) {
        sec = Math.max(0, Math.floor(sec || 0))
        return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`
    }

    async function checkVoiceSchema() {
        if (voiceSchemaChecked) return voiceHasChatContext
        try {
            const { error } = await supabase.from('voice_messages').select('chat_type').limit(0)
            voiceHasChatContext = !error
        } catch (e) {
            voiceHasChatContext = false
        }
        voiceSchemaChecked = true
        return voiceHasChatContext
    }

    function voiceChatMatches(v) {
        const cu = getCurrentUser()
        if (!cu) return false
        if (!voiceHasChatContext) return currentChatType === 'group'
        if (currentChatType === 'group') {
            return v.chat_type === 'group' && v.group_id === currentGroupId
        }
        return v.chat_type === 'private' && (
            (String(v.user_id) === String(cu.id) && v.receiver_id === currentReceiverId) ||
            (v.user_id === currentReceiverId && v.receiver_id === String(cu.id))
        )
    }

    function setupVoiceRecorder() {
        const voiceBtn = document.getElementById('voice-record-btn')
        if (!voiceBtn) return
        voiceBtn.addEventListener('pointerdown', (e) => {
            recordStartX = e.clientX
            recordStartY = e.clientY
            startRecording(e)
        })
        document.addEventListener('pointermove', onRecordMove)
        document.addEventListener('pointerup', stopRecording)
        document.addEventListener('pointercancel', cancelRecording)
        document.addEventListener('touchend', stopRecording)
        document.getElementById('voice-cancel-btn')?.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            cancelRecording()
        })
    }

    function onRecordMove(e) {
        if (!isRecording) return
        const dx = e.clientX - recordStartX
        const dy = e.clientY - recordStartY
        cancelArmed = (Math.abs(dx) > 70 || Math.abs(dy) > 70)
        const hint = document.querySelector('.voice-rec-hint')
        if (hint) {
            hint.textContent = cancelArmed ? 'برای لغو رها کن' : 'برای ارسال رها کن'
            hint.classList.toggle('cancel-armed', cancelArmed)
        }
        const btn = document.getElementById('voice-record-btn')
        if (btn) btn.style.opacity = cancelArmed ? '0.4' : '1'
    }

    function resetRecordGesture() {
        cancelArmed = false
        const hint = document.querySelector('.voice-rec-hint')
        if (hint) { hint.textContent = 'برای ارسال رها کن'; hint.classList.remove('cancel-armed') }
        const btn = document.getElementById('voice-record-btn')
        if (btn) btn.style.opacity = ''
    }

    async function startRecording(e) {
        e.preventDefault()
        if (isRecording) return
        resetRecordGesture()
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            if (isRecording) { stream.getTracks().forEach(t => t.stop()); return }
            isRecording = true
            recordingStream = stream
            recordingCanceled = false
            audioChunks = []
            recordingSeconds = 0

            let mime = ''
            if (typeof MediaRecorder.isTypeSupported === 'function') {
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus'
                else if (MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm'
                else if (MediaRecorder.isTypeSupported('audio/mp4')) mime = 'audio/mp4'
            }
            mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
            recordingExt = mime.includes('mp4') ? 'm4a' : 'webm'

            mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) audioChunks.push(ev.data) }
            mediaRecorder.onerror = () => { window.showToast('خطا در ضبط ویس', 'error'); cancelRecording() }
            mediaRecorder.onstop = handleVoiceStop
            mediaRecorder.start()

            updateRecordingUI(true)
            recordingTimer = setInterval(() => {
                recordingSeconds++
                const timer = document.getElementById('voice-timer')
                if (timer) timer.textContent = formatTime(recordingSeconds)
            }, 1000)
        } catch (err) {
            window.showToast('دسترسی به میکروفون داده نشد', 'error')
        }
    }

    function stopRecording() {
        if (!isRecording || !mediaRecorder) return
        if (mediaRecorder.state === 'recording') {
            recordingCanceled = cancelArmed
            isRecording = false
            mediaRecorder.stop()
            clearInterval(recordingTimer)
            if (recordingStream) { recordingStream.getTracks().forEach(t => t.stop()); recordingStream = null }
        }
        resetRecordGesture()
    }

    function cancelRecording() {
        recordingCanceled = true
        isRecording = false
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop()
            clearInterval(recordingTimer)
        }
        if (recordingStream) { recordingStream.getTracks().forEach(t => t.stop()); recordingStream = null }
        audioChunks = []
        resetRecordGesture()
        updateRecordingUI(false)
    }

    async function handleVoiceStop() {
        const mimeType = mediaRecorder?.mimeType || ''
        const chunks = audioChunks.slice()
        const seconds = recordingSeconds
        audioChunks = []
        mediaRecorder = null
        recordingSeconds = 0
        updateRecordingUI(false)

        if (recordingCanceled) return
        if (chunks.length === 0 || seconds < 1) { window.showToast('ویس خیلی کوتاه بود', 'error'); return }
        const audioBlob = new Blob(chunks, { type: mimeType || 'audio/webm' })
        if (audioBlob.size === 0) { window.showToast('صدا ضبط نشد', 'error'); return }
        window.showToast('در حال ارسال ویس...')
        try {
            const cu = getCurrentUser()
            if (!cu) return
            const fileName = `voice_${Date.now()}.${recordingExt}`
            const { error } = await supabase.storage.from('voice-messages').upload(fileName, audioBlob)
            if (error) { window.showToast('خطا در آپلود ویس', 'error'); return }
            const { data: urlData } = supabase.storage.from('voice-messages').getPublicUrl(fileName)
            const msg = {
                user_id: String(cu.id),
                user_name: cu.name,
                audio_url: urlData.publicUrl,
                duration: seconds
            }
            if (await checkVoiceSchema()) {
                msg.user_avatar = cu.avatar || '👤'
                msg.chat_type = currentChatType
                if (currentChatType === 'group') msg.group_id = currentGroupId
                else msg.receiver_id = currentReceiverId
            }
            const { error: insErr } = await supabase.from('voice_messages').insert([msg])
            if (insErr) window.showToast('خطا در ارسال ویس', 'error')
        } catch (err) {
            window.showToast('خطا در ارسال ویس', 'error')
        }
    }

    function updateRecordingUI(on) {
        const form = document.getElementById('chat-form')
        const bar = document.getElementById('voice-recording-bar')
        const btn = document.getElementById('voice-record-btn')
        if (form) form.style.display = on ? 'none' : 'flex'
        if (bar) bar.style.display = on ? 'flex' : 'none'
        if (btn) btn.classList.toggle('recording', on)
        const timer = document.getElementById('voice-timer')
        if (timer) timer.textContent = '0:00'
    }

    function voiceWaveBars(seed, count = 24) {
        seed = String(seed || '')
        let h = 7
        for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
        const bars = []
        for (let i = 0; i < count; i++) {
            h = (h * 1103515245 + 12345) >>> 0
            const height = 22 + ((h % 100) / 100) * 78
            bars.push(`<div class="voice-wave-bar" style="height:${height.toFixed(1)}%"></div>`)
        }
        return bars.join('')
    }

    function displayVoiceMessage(msg, index) {
        const cu = getCurrentUser()
        const isSent = msg.user_id === String(cu.id)
        const div = document.createElement('div')
        div.className = `message ${isSent ? 'sent' : 'received'}`
        div.id = `msg-${msg.id}`
        div.style.position = 'relative'
        if (index !== undefined) div.style.animationDelay = Math.min(index, 40) * 40 + 'ms'
        div.dataset.audioUrl = msg.audio_url || ''

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            showVoiceMenu(msg.id, e)
        })
        addLongPress(div, (e) => {
            e.preventDefault()
            showVoiceMenu(msg.id, e)
        })

        const bars = voiceWaveBars(msg.id || msg.audio_url, 24)
        const avatar = msg.user_avatar || USERS_DATABASE[msg.user_name]?.avatar
        div.innerHTML = `
            <div class="sender">${getAvatarHTML(avatar)} ${msg.user_name || 'ناشناس'}</div>
            <div class="voice-message">
<button class="voice-play-btn" data-voice-id="${msg.id}" onclick="window.playVoice(this, '${msg.audio_url}')">
    <img src="assets/icons/play.png" style="width:16px;height:16px;object-fit:contain;">
</button>
                <div class="voice-player">
                    <div class="voice-wave">
                        <div class="voice-wave-bars">${bars}</div>
                        <div class="voice-wave-progress"><div class="voice-wave-bars">${bars}</div></div>
                    </div>
                    <div class="voice-player-footer">
                        <span class="voice-duration">${formatTime(msg.duration)}</span>
                        <span class="voice-time-remaining" style="display:none;"></span>
                    </div>
                </div>
            </div>
        `
        messagesContainer.appendChild(div)
    }

    function showVoiceMenu(msgId, event) {
        event.stopPropagation()
        document.querySelector('.message-menu')?.remove()
        const msgEl = document.getElementById(`msg-${msgId}`)
        if (!msgEl) return
        const isSent = msgEl.classList.contains('sent')
        const senderName = msgEl.querySelector('.sender')?.textContent?.trim() || ''

        const menu = document.createElement('div')
        menu.className = 'message-menu'
        menu.innerHTML = `
    <div class="menu-item" data-action="reply"><img src="assets/icons/reply.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>پاسخ</span></div>
    <div class="menu-item" data-action="react"><img src="assets/icons/reaction.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>ری‌اکشن</span></div>
    ${isSent || isAdmin() ? `<div class="menu-item danger" data-action="delete"><img src="assets/icons/delete.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>حذف</span></div>` : ''}
`
        positionContextMenu(menu, msgEl)
        setupMenuClose(menu)

        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const action = item.dataset.action
                menu.remove()
                if (action === 'reply') window.replyToMessage(msgId, senderName, '🎤 پیام صوتی')
                else if (action === 'react') window.toggleReactionPicker(msgId, e)
                else if (action === 'delete') window.deleteVoice(msgId, msgEl.dataset.audioUrl)
            })
        })
    }

    window.deleteVoice = async (voiceId, audioUrl) => {
        const confirmed = await window.showConfirm('ویس حذف بشه؟', 'حذف ویس')
        if (!confirmed) return
        const el = document.getElementById(`msg-${voiceId}`)
        if (!audioUrl && el) audioUrl = el.dataset.audioUrl || ''
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

    let currentVoice = null

    window.playVoice = (btn, url) => {
        const wave = btn.closest('.voice-message')?.querySelector('.voice-wave')
        if (currentVoice && currentVoice.btn === btn) {
            if (currentVoice.audio.paused) {
                currentVoice.audio.play()
                setVoiceBtn(btn, true)
            } else {
                currentVoice.audio.pause()
                setVoiceBtn(btn, false)
            }
            return
        }
        stopAllVoices()
        const audio = new Audio(url)
        currentVoice = { audio, btn, wave }
        setVoiceBtn(btn, true)
        audio.addEventListener('timeupdate', () => {
            if (wave && audio.duration) {
                const pct = Math.min(100, (audio.currentTime / audio.duration) * 100)
                wave.classList.add('playing')
                wave.style.setProperty('--vp', pct + '%')
            }
            const rem = wave?.querySelector('.voice-time-remaining')
            if (rem && audio.duration) {
                rem.style.display = ''
                rem.textContent = formatTime(audio.duration - audio.currentTime)
            }
        })
        audio.addEventListener('loadedmetadata', () => {
            const rem = wave?.querySelector('.voice-time-remaining')
            if (rem && audio.duration) {
                rem.style.display = ''
                rem.textContent = formatTime(audio.duration)
            }
        })
        audio.addEventListener('ended', () => stopAllVoices())
        audio.addEventListener('error', () => { window.showToast('پخش ویس ممکن نشد', 'error'); stopAllVoices() })
        audio.play().catch(() => { window.showToast('پخش ویس ممکن نشد', 'error'); stopAllVoices() })
    }

    function stopAllVoices() {
        if (currentVoice) {
            try { currentVoice.audio.pause() } catch (e) { }
            currentVoice = null
        }
        document.querySelectorAll('.voice-play-btn.playing').forEach(b => setVoiceBtn(b, false))
        document.querySelectorAll('.voice-wave.playing').forEach(w => {
            w.classList.remove('playing')
            w.style.setProperty('--vp', '0%')
        })
        document.querySelectorAll('.voice-time-remaining').forEach(el => { el.style.display = 'none' })
    }

    function setVoiceBtn(btn, playing) {
        btn.classList.toggle('playing', playing)
        btn.innerHTML = playing
            ? '<img src="assets/icons/pause.png" style="width:16px;height:16px;object-fit:contain;">'
            : '<img src="assets/icons/play.png" style="width:16px;height:16px;object-fit:contain;">'
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
<span class="modal-icon"><img src="assets/icons/poll.png" style="width:40px;height:40px;object-fit:contain;"></span>                <div class="modal-title">نظرسنجی جدید</div>
                <div class="modal-message">
                    <input type="text" id="poll-question" class="prompt-input" placeholder="سوال..." style="margin-bottom:12px;">
                    <div id="poll-options-container">
                        <input type="text" class="poll-option-input prompt-input" placeholder="گزینه ۱" style="margin-bottom:8px;">
                        <input type="text" class="poll-option-input prompt-input" placeholder="گزینه ۲" style="margin-bottom:8px;">
                    </div>
<button class="modal-btn cancel" id="add-poll-option" style="width:100%;margin-bottom:12px;">
    <img src="assets/icons/add.png" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-left:4px;"> افزودن گزینه
</button>                </div>
                <div class="modal-buttons">
<button class="modal-btn primary" id="create-poll-btn">
    <img src="assets/icons/poll.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> ایجاد
</button>                    <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">لغو</button>
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
                created_by: cu.name
            }])
            overlay.remove()
            window.showToast('نظرسنجی ایجاد شد 📊', 'success')
        })
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    }

    // ==================== منوی افزودن (سند) ====================
    function setupAttachButton() {
        document.getElementById('attach-btn')?.addEventListener('click', openAttachMenu)
    }

    function openAttachMenu() {
        document.querySelector('.message-menu')?.remove()
        const menu = document.createElement('div')
        menu.className = 'message-menu attach-menu'
        menu.innerHTML = `
    <div class="menu-item" data-action="file"><img src="assets/icons/attach-file.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>عکس / فایل</span></div>
    <div class="menu-item" data-action="poll"><img src="assets/icons/poll.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>نظرسنجی</span></div>
    <div class="menu-item" data-action="location"><img src="assets/icons/location.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>اشتراک موقعیت</span></div>
    <div class="menu-item" data-action="memory"><img src="assets/icons/memory.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>خاطره جدید</span></div>
`
        const btn = document.getElementById('attach-btn')
        const rect = btn.getBoundingClientRect()
        document.body.appendChild(menu)
        menu.style.position = 'fixed'
        menu.style.bottom = (window.innerHeight - rect.top + 10) + 'px'
        menu.style.right = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - 8)) + 'px'
        setupMenuClose(menu)

        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action
                menu.remove()
                if (action === 'file') {
                    const input = document.getElementById('chat-file-input')
                    if (input) input.click()
                } else if (action === 'poll') openPollCreator()
                else if (action === 'location') window.openLocationPicker()
                else if (action === 'memory') {
                    document.querySelector('.nav-item[data-tab="memories"]')?.click()
                }
            })
        })
    }

    // ==================== ارسال عکس / فایل ====================
    function setupChatFileInput() {
        const input = document.getElementById('chat-file-input')
        if (!input) return
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || [])
            input.value = ''
            if (files.length === 0) return
            for (const file of files) {
                await uploadAndSendAttachment(file)
            }
        })
    }

    async function uploadAndSendAttachment(file) {
        const cu = getCurrentUser()
        if (!cu) return

        // بررسی وجود ستون‌های پیوست در دیتابیس
        const cols = await checkMsgSchema()
        if (!cols.attachment) {
            window.showToast('⚠️ برای ارسال فایل، اسکریپت sql/setup-all.sql را اجرا کن', 'error', 5000)
            return
        }

        const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
        const path = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
        window.showToast(`در حال ارسال ${file.name}...`, 'info')
        let { error } = await supabase.storage.from('chat-files').upload(path, file)
        if (error) {
            window.showToast('⚠️ باکت chat-files ساخته نشده؛ sql/setup-all.sql را اجرا کن', 'error', 5000)
            console.error('upload err:', error)
            return
        }
        const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path)
        const msg = {
            content: '',
            user_id: String(cu.id),
            user_name: cu.name,
            user_avatar: cu.avatar || '👤',
            user_color: cu.color || '#d4a017',
            chat_type: currentChatType,
            attachment_url: urlData.publicUrl,
            attachment_type: file.type || (isImageExt(ext) ? 'image/' + ext : 'application/octet-stream'),
            attachment_name: file.name,
            reply_to: replyingTo
        }
        if (currentChatType === 'group') msg.group_id = currentGroupId
        else msg.receiver_id = currentReceiverId
        const { error: insErr } = await supabase.from('messages').insert([msg])
        if (insErr) {
            window.showToast('خطا در ارسال فایل', 'error')
            await supabase.storage.from('chat-files').remove([path])
            return
        }
        cancelReply()
        window.showToast('فایل ارسال شد ✅', 'success')
    }

    function isImageExt(ext) {
        return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'].includes(ext.toLowerCase())
    }

    // ============ بررسی ستون‌های جدید جدول پیام‌ها ============
    let msgSchema = { checked: false, attachment: false, location: false }
    async function checkMsgSchema() {
        if (msgSchema.checked) return msgSchema
        try {
            const a = await supabase.from('messages').select('attachment_url').limit(0)
            const l = await supabase.from('messages').select('location_lat').limit(0)
            msgSchema = {
                checked: true,
                attachment: !a.error,
                location: !l.error
            }
        } catch (e) {
            msgSchema = { checked: true, attachment: false, location: false }
        }
        return msgSchema
    }

    // ==================== ارسال موقعیت ====================
    window.openLocationPicker = function () {
        const cu = getCurrentUser()
        if (!cu) return

        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal" style="max-width:460px;">
<span class="modal-icon"><img src="assets/icons/location.png" style="width:40px;height:40px;object-fit:contain;"></span>
                <div class="modal-title">ارسال موقعیت</div>
                <div class="modal-message">مکان‌ت رو روی نقشه انتخاب کن</div>
                <div id="location-pick-map" style="height:260px;border-radius:14px;overflow:hidden;margin-bottom:12px;direction:ltr;"></div>
                <div class="modal-buttons">
<button class="modal-btn primary" id="loc-send-btn">
    <img src="assets/icons/send-location.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> ارسال موقعیت
</button>
                    <button class="modal-btn cancel" id="loc-cancel-btn">لغو</button>
                </div>
            </div>`
        document.body.appendChild(overlay)

        const closeModal = () => overlay.remove()
        overlay.querySelector('#loc-cancel-btn').addEventListener('click', closeModal)
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })

        let picked = null
        let map = null
        let marker = null

        // نقشه لیتفال
        if (window.L) {
            map = L.map('location-pick-map').setView([35.7483, 51.8237], 15)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
            map.on('click', (e) => {
                picked = { lat: e.latlng.lat, lng: e.latlng.lng }
                if (marker) marker.setLatLng(e.latlng)
                else marker = L.marker(e.latlng).addTo(map)
            })
        }

        // موقعیت فعلی کاربر
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                picked = ll
                if (map) {
                    map.setView([ll.lat, ll.lng], 15)
                    if (marker) marker.setLatLng(ll)
                    else marker = L.marker(ll).addTo(map)
                }
            }, () => { }, { timeout: 8000 })
        }

        overlay.querySelector('#loc-send-btn').addEventListener('click', async () => {
            if (!picked) { window.showToast('روی نقشه کلیک کن', 'warning'); return }

            const cols = await checkMsgSchema()
            if (!cols.location) {
                window.showToast('⚠️ برای موقعیت، اسکریپت sql/setup-all.sql را اجرا کن', 'error', 5000)
                return
            }

            const msg = {
                content: '📍 موقعیت مکانی',
                user_id: String(cu.id),
                user_name: cu.name,
                user_avatar: cu.avatar || '👤',
                user_color: cu.color || '#d4a017',
                chat_type: currentChatType,
                location_lat: picked.lat,
                location_lng: picked.lng,
                reply_to: replyingTo
            }
            if (currentChatType === 'group') msg.group_id = currentGroupId
            else msg.receiver_id = currentReceiverId
            const { error } = await supabase.from('messages').insert([msg])
            if (error) { window.showToast('خطا در ارسال موقعیت', 'error'); return }
            cancelReply()
            closeModal()
            window.showToast('موقعیت ارسال شد 📍', 'success')
        })
    }

    window.openChatLocation = function (lat, lng) {
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')
    }

    window.viewChatImage = function (url) {
        const old = document.getElementById('fullscreen-chat-image')
        if (old) old.remove()
        const overlay = document.createElement('div')
        overlay.id = 'fullscreen-chat-image'
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.96);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;'
        overlay.innerHTML = `
            <button style="position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;" onclick="this.closest('#fullscreen-chat-image').remove()">✕</button>
            <img src="${url}" style="max-width:95%;max-height:92%;object-fit:contain;border-radius:8px;">
        `
        document.body.appendChild(overlay)
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    }

    // ==================== جستجو در پیام‌ها ====================
    window.openChatSearch = function () {
        const cu = getCurrentUser()
        if (!cu) return

        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
            <div class="custom-modal" style="max-width:520px;width:92vw;max-height:85vh;display:flex;flex-direction:column;">
<span class="modal-icon"><img src="assets/icons/search.png" style="width:40px;height:40px;object-fit:contain;"></span>                <div class="modal-title">جستجو در پیام‌ها</div>
                <input type="text" id="chat-search-input" class="prompt-input" placeholder="کلمه‌ای بنویس..." autofocus style="margin-bottom:12px;">
                <div id="chat-search-results" style="flex:1;overflow-y:auto;text-align:right;min-height:120px;"></div>
                <div class="modal-buttons">

<button class="modal-btn primary" id="chat-search-btn">
    <img src="assets/icons/search.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> جستجو
</button>
                    <button class="modal-btn cancel" id="chat-search-close">بستن</button>
                </div>
            </div>`
        document.body.appendChild(overlay)

        const input = overlay.querySelector('#chat-search-input')
        const results = overlay.querySelector('#chat-search-results')
        results.innerHTML = '<div style="color:var(--text-tertiary);padding:20px;text-align:center;">برای جستجو در کل پیام‌ها، کلمه رو بنویس 🔎</div>'

        const doSearch = async () => {
            const q = input.value.trim()
            if (!q) return
            results.innerHTML = '<div style="color:var(--text-tertiary);padding:20px;text-align:center;">در حال جستجو...</div>'
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .ilike('content', '%' + q + '%')
                .order('created_at', { ascending: false })
                .limit(30)
            if (error || !data || data.length === 0) {
                results.innerHTML = '<div style="color:var(--text-tertiary);padding:20px;text-align:center;">چیزی پیدا نشد 🤷</div>'
                return
            }
            results.innerHTML = data.map(m => {
                const isGroup = m.chat_type === 'group'
                const chatName = isGroup ? 'گروه' : (m.user_id === String(cu.id) ? 'چت خصوصی' : 'چت خصوصی')
                const time = new Date(m.created_at).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' }) +
                    ' ' + new Date(m.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
                const preview = (m.content || (m.attachment_type ? '📎 ' + (m.attachment_name || 'فایل') : '')).substring(0, 60)
                return `
                    <div class="chat-search-item" data-msgid="${m.id}" data-group="${isGroup ? m.group_id : ''}" data-user="${isGroup ? '' : (m.user_id === String(cu.id) ? m.receiver_id : m.user_id)}">
                        <div class="chat-search-sender">${m.user_name || 'ناشناس'} · ${time}</div>
                        <div class="chat-search-preview">${escapeHtml(preview)}</div>
                    </div>`
            }).join('')

            results.querySelectorAll('.chat-search-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const groupId = item.dataset.group
                    const userId = item.dataset.user
                    const msgId = item.dataset.msgid
                    overlay.remove()
                    // برو به چت مربوطه
                    if (groupId) {
                        const { data: g } = await supabase.from('chat_groups').select('*').eq('id', groupId).single()
                        if (g) {
                            window.switchToGroup(groupId, g.name)
                            document.querySelector('.nav-item[data-tab="chat"]')?.click()
                        }
                    } else if (userId) {
                        const { data: u } = await supabase.from('messages').select('*').eq('id', msgId).single()
                        const name = u ? (String(u.receiver_id) === String(cu.id) ? u.user_name : '') : ''
                        const other = userId
                        const info = Object.values(USERS_DATABASE).find(x => String(x.id) === String(other))
                        if (info) {
                            window.switchToPrivateChat(info.id, info.name)
                            document.querySelector('.nav-item[data-tab="chat"]')?.click()
                        }
                    }
                    // اسکرول به پیام
                    setTimeout(() => {
                        const el = document.getElementById(`msg-${msgId}`)
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        else {
                            // پیام در cache نیست؛ یک نمایش سریع
                            const { data: m } = supabase.from('messages').select('*').eq('id', msgId).single()
                            m.then(r => {
                                if (r.data) {
                                    displayMessage(r.data)
                                    const el2 = document.getElementById(`msg-${msgId}`)
                                    if (el2) el2.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                }
                            })
                        }
                    }, 700)
                })
            })
        }

        overlay.querySelector('#chat-search-btn').addEventListener('click', doSearch)
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })
        overlay.querySelector('#chat-search-close').addEventListener('click', () => overlay.remove())
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    }

    function escapeHtml(str) {
        const div = document.createElement('div')
        div.textContent = str
        return div.innerHTML
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
${canDelete ? `<button onclick="window.deletePoll('${pollId}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:2px 8px;"><img src="assets/icons/delete.png" style="width:14px;height:14px;object-fit:contain;"></button>` : ''}            </div>`
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
    function positionContextMenu(menu, msgEl) {
        document.body.appendChild(menu)
        const rect = msgEl.getBoundingClientRect()
        const mRect = menu.getBoundingClientRect()
        let top = rect.top - mRect.height - 8
        if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - mRect.height - 8)
        const left = Math.max(8, Math.min(rect.left + rect.width / 2 - mRect.width / 2, window.innerWidth - mRect.width - 8))
        menu.style.position = 'fixed'
        menu.style.top = top + 'px'
        menu.style.left = left + 'px'
        menu.style.margin = '0'
    }

    function setupMenuClose(menu) {
        setTimeout(() => {
            const close = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove()
                    document.removeEventListener('click', close)
                    document.removeEventListener('touchstart', close)
                }
            }
            document.addEventListener('click', close)
            document.addEventListener('touchstart', close)
        }, 100)
    }

    window.copyMessage = async (text) => {
        if (!text) { window.showToast('چیزی برای کپی نیست', 'warning'); return }
        try {
            await navigator.clipboard.writeText(text)
            window.showToast('کپی شد 📋', 'success')
        } catch (e) {
            const ta = document.createElement('textarea')
            ta.value = text
            ta.style.cssText = 'position:fixed;opacity:0;'
            document.body.appendChild(ta)
            ta.select()
            try { document.execCommand('copy'); window.showToast('کپی شد 📋', 'success') }
            catch (err) { window.showToast('کپی ممکن نشد', 'error') }
            ta.remove()
        }
    }

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
    <div class="menu-item" data-action="reply"><img src="assets/icons/reply.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>پاسخ</span></div>
    <div class="menu-item" data-action="react"><img src="assets/icons/reaction.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>ری‌اکشن</span></div>
    <div class="menu-item" data-action="copy"><img src="assets/icons/copy.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>کپی</span></div>
    ${currentChatType === 'group' ? `<div class="menu-item" data-action="pin"><img src="assets/icons/pin.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>پین</span></div>` : ''}
    ${isSent ? `<div class="menu-item" data-action="edit"><img src="assets/icons/edit.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>ویرایش</span></div>` : ''}
    ${isSent || isAdmin() ? `<div class="menu-item danger" data-action="delete"><img src="assets/icons/delete.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> <span>حذف</span></div>` : ''}
`
        positionContextMenu(menu, msgEl)
        setupMenuClose(menu)

        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const action = item.dataset.action
                menu.remove()
                if (action === 'reply') window.replyToMessage(msgId, senderName, msgContent)
                else if (action === 'react') window.toggleReactionPicker(msgId, e)
                else if (action === 'copy') await window.copyMessage(msgContent)
                else if (action === 'pin') window.pinMessage(msgId)
                else if (action === 'edit') window.editMessage(msgId, msgContent)
                else if (action === 'delete') window.deleteMessage(msgId)
            })
        })
    }

    // ==================== نمایش پیام ====================
    function displayMessage(msg, index) {
        const cu = getCurrentUser()
        const isSent = msg.user_id === String(cu.id)
        const div = document.createElement('div')
        div.className = `message ${isSent ? 'sent' : 'received'}`
        div.id = `msg-${msg.id}`
        div.style.position = 'relative'
        if (index !== undefined) div.style.animationDelay = Math.min(index, 40) * 40 + 'ms'

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

        let attachHTML = ''
        if (msg.attachment_url) {
            if (String(msg.attachment_type || '').startsWith('image/')) {
                attachHTML = `<div class="msg-attachment"><img src="${msg.attachment_url}" class="msg-image" alt="${msg.attachment_name || 'عکس'}" onclick="window.viewChatImage('${msg.attachment_url}')"></div>`
            } else {
                attachHTML = `<a class="msg-file" href="${msg.attachment_url}" target="_blank" rel="noopener">
                    <span class="msg-file-icon">${fileEmoji(msg.attachment_type, msg.attachment_name)}</span>
                    <span class="msg-file-name">${msg.attachment_name || 'فایل'}</span>
                    <span class="msg-file-dl">⬇</span>
                </a>`
            }
        }

        let locationHTML = ''
        if (msg.location_lat != null && msg.location_lng != null) {
            locationHTML = `<div class="msg-location" onclick="window.openChatLocation(${msg.location_lat},${msg.location_lng})">
                <span class="msg-location-icon">📍</span>
                <div class="msg-location-body">
                    <div class="msg-location-title">موقعیت مکانی</div>
                    <div class="msg-location-coords">${Number(msg.location_lat).toFixed(5)}, ${Number(msg.location_lng).toFixed(5)}</div>
                </div>
                <span class="msg-location-open">🗺️</span>
            </div>`
        }

        div.innerHTML = `
            <div class="sender">${getAvatarHTML(msg.user_avatar)} ${msg.user_name || 'ناشناس'}</div>
            ${replyHTML}
            ${attachHTML}
            ${locationHTML}
            <div class="msg-content"></div>
            <div class="time">${time}${msg.edited ? ' <span class="edited-tag">ویرایش شده</span>' : ''}</div>
        `
        div.querySelector('.msg-content').textContent = msg.content || ''
        messagesContainer.appendChild(div)

        refreshReactions(msg.id)
    }

    function fileEmoji(type, name) {
        const n = (name || '').toLowerCase()
        if (n.includes('.pdf')) return '📄'
        if (n.includes('.zip') || n.includes('.rar')) return '🗜️'
        if (n.includes('.mp3') || n.includes('.wav') || n.includes('.m4a')) return '🎵'
        if (n.includes('.mp4') || n.includes('.mkv') || n.includes('.mov')) return '🎬'
        if (n.includes('.doc') || n.includes('.docx')) return '📝'
        if (n.includes('.xls') || n.includes('.xlsx')) return '📊'
        if (n.includes('.ppt') || n.includes('.pptx')) return '📽️'
        if (String(type || '').includes('audio')) return '🎵'
        if (String(type || '').includes('video')) return '🎬'
        return '📁'
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
                btn.innerHTML = '<img src="assets/icons/edit.png" style="width:16px;height:16px;object-fit:contain;">'
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
        const isOnline = !!onlineUsers[receiverId]
        if (chatHeader) chatHeader.innerHTML = `${getAvatarHTML(info.avatar, 24)} ${receiverName} <span class="online-status ${isOnline ? 'online' : 'offline'}">${isOnline ? '🟢' : '⚫'}</span>`
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

        messagesContainer.innerHTML = `
            <div class="skeleton-chat">
                <div class="skeleton-bubble received"></div>
                <div class="skeleton-bubble sent"></div>
                <div class="skeleton-bubble received"></div>
                <div class="skeleton-bubble sent"></div>
                <div class="skeleton-bubble received"></div>
            </div>`

        let query = supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(100)
        if (currentChatType === 'group') query = query.eq('chat_type', 'group').eq('group_id', currentGroupId)
        else {
            const cu = getCurrentUser()
            query = query.eq('chat_type', 'private').or(
                `and(user_id.eq.${String(cu.id)},receiver_id.eq.${currentReceiverId}),and(user_id.eq.${currentReceiverId},receiver_id.eq.${String(cu.id)})`
            )
        }
        const { data } = await query
        let voices = []
        if (await checkVoiceSchema()) {
            let voiceQuery = supabase.from('voice_messages').select('*')
            if (currentChatType === 'group') voiceQuery = voiceQuery.eq('chat_type', 'group').eq('group_id', currentGroupId)
            else {
                const cu = getCurrentUser()
                voiceQuery = voiceQuery.eq('chat_type', 'private').or(
                    `and(user_id.eq.${String(cu.id)},receiver_id.eq.${currentReceiverId}),and(user_id.eq.${currentReceiverId},receiver_id.eq.${String(cu.id)})`
                )
            }
            const { data: vd } = await voiceQuery
            voices = vd || []
        } else if (currentChatType === 'group') {
            const { data: vd } = await supabase.from('voice_messages').select('*').order('created_at', { ascending: true })
            voices = vd || []
        }
        const all = [
            ...(data || []).map(m => ({ ...m, kind: 'text' })),
            ...voices.map(v => ({ ...v, kind: 'voice' }))
        ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        messagesContainer.innerHTML = ''
        if (all.length > 0) all.forEach((msg, i) => msg.kind === 'voice' ? displayVoiceMessage(msg, i) : displayMessage(msg, i))
        else messagesContainer.innerHTML = '<div style="text-align:center;color:#9d9dab;padding:40px;"><img src="assets/icons/empty-chat.png" style="width:40px;height:40px;object-fit:contain;display:block;margin:0 auto 12px;"><p>پیامی نیست</p></div>'
        scrollToBottom()

        if (currentChatType === 'group') loadPolls()
        updateTypingIndicator()
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
    <img src="assets/icons/group.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-left:4px;"> ${g.name}
</button>
                        ${admin ? `<button class="delete-group-btn" onclick="event.stopPropagation(); window.deleteGroup('${g.id}', '${g.name}')" title="حذف">×</button>` : ''}
                    </div>`).join('')}
                ${ALLOWED_USERS.filter(n => n !== currentUserName).map(name => {
            const info = USERS_DATABASE[name]
            if (!info) return ''
            return `<button class="chat-tab" data-user="${info.id}" onclick="window.switchToPrivateChat('${info.id}', '${name}'); document.querySelectorAll('.chat-tab').forEach(b=>b.classList.remove('active')); this.classList.add('active');">${getAvatarHTML(info.avatar, 20)} ${name}</button>`
        }).join('')}
                ${admin ? `<button class="chat-tab admin-tab" onclick="window.showCreateGroupModal()" title="ساخت گروه جدید">➕</button>` : ''}
<button class="chat-tab" onclick="window.showMembers()" title="اعضا و حضور">
    <img src="assets/icons/group.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;">
</button>
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
<span class="modal-icon"><img src="assets/icons/group.png" style="width:40px;height:40px;object-fit:contain;"></span>                <div class="modal-title">ساخت گروه جدید</div>
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
    // ==================== حضور آنلاین/آفلاین ====================
    function setupPresence() {
        const cu = getCurrentUser(); if (!cu || presenceChannel) return
        presenceChannel = supabase.channel('online-users', { config: { presence: { key: String(cu.id) } } })
        presenceChannel.on('presence', { event: 'sync' }, () => { const s = presenceChannel.presenceState(); onlineUsers = {}; Object.values(s).forEach(e => e.forEach(p => { if (p.online) onlineUsers[p.user_id] = { name: p.user_name, avatar: p.user_avatar } })); updateOnlineBadges() })
        presenceChannel.on('presence', { event: 'join' }, ({ newPresences }) => { newPresences.forEach(p => { if (p.online) onlineUsers[p.user_id] = { name: p.user_name, avatar: p.user_avatar } }); updateOnlineBadges() })
        presenceChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => { leftPresences.forEach(p => delete onlineUsers[p.user_id]); updateOnlineBadges() })
        presenceChannel.subscribe(async status => { if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: String(cu.id), user_name: cu.name, user_avatar: cu.avatar || '👤', online: true }) })
        setInterval(async () => { if (presenceChannel) { const cu = getCurrentUser(); if (cu) await presenceChannel.track({ user_id: String(cu.id), user_name: cu.name, user_avatar: cu.avatar || '👤', online: true }) } }, 10000)
        window.addEventListener('beforeunload', () => { if (presenceChannel) { const cu = getCurrentUser(); if (cu) presenceChannel.track({ user_id: String(cu.id), user_name: cu.name, user_avatar: cu.avatar || '👤', online: false }) } })
    }

    function updateOnlineBadges() {
        document.querySelectorAll('.chat-tab[data-user]').forEach(tab => {
            const userId = tab.dataset.user, isOnline = !!onlineUsers[userId]
            let badge = tab.querySelector('.online-dot')
            if (isOnline) { if (!badge) { badge = document.createElement('span'); badge.className = 'online-dot'; tab.appendChild(badge) } }
            else { if (badge) badge.remove() }
        })
    }
}