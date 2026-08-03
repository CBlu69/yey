// js/map.js - کامل با is_active
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

export function initMap(user) {
    let map, userMarker, userLocation = null, allPins = [], sharingActive = false, sharingMarker = null, sharingTimer = null, sharingWatchId = null, sharingStartTime = null

    window.navigateTo = (lat, lng, name) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank')

    function createMap() {
        const mc = document.getElementById('map-container')
        if (!mc) { setTimeout(createMap, 300); return }
        if (map) { map.invalidateSize(); return }
        map = L.map('map-container', { zoomControl: true, fadeAnimation: true, markerZoomAnimation: true }).setView([35.7483, 51.8237], 14)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18, tileSize: 256, zoomOffset: 0 }).addTo(map)
        loadAllMapData(); startLocationTracking(); updateShareButton(); addMyLocationButton(); checkActiveSharing()
        setTimeout(() => map.invalidateSize(), 200)
        new MutationObserver(() => { if (mc.offsetParent !== null) map.invalidateSize() }).observe(mc, { attributes: true, attributeFilter: ['class'] })
    }

    function startLocationTracking() {
        if (!('geolocation' in navigator)) { setDefaultLocation(); return }
        navigator.geolocation.watchPosition(
            (pos) => { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker(); if (sharingActive && sharingMarker) sharingMarker.setLatLng(userLocation) },
            () => setDefaultLocation(), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
    }

    function updateUserMarker() {
        if (!userLocation || !map) return
        if (userMarker) userMarker.setLatLng(userLocation)
        else userMarker = L.marker(userLocation, { icon: L.divIcon({ html: '<div style="font-size:24px;">📍</div>', className: 'user-marker', iconSize: [24,24] }) }).addTo(map).bindPopup('موقعیت من')
    }

    function setDefaultLocation() { if (!userLocation) { userLocation = { lat: 35.7483, lng: 51.8237 }; updateUserMarker() } }

    const shareBtn = document.getElementById('share-location-btn')
    shareBtn?.addEventListener('click', () => sharingActive ? stopSharing() : startSharing())

    async function startSharing() {
        if (!userLocation) {
            try { const pos = await new Promise((r, rej) => navigator.geolocation.getCurrentPosition(r, rej, { enableHighAccuracy: true, timeout: 10000 })); userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker() }
            catch (err) { window.showToast('موقعیت در دسترس نیست', 'error'); return }
        }
        const cu = getCurrentUser(); if (!cu) return
        await supabase.from('shared_locations').upsert({ user_id: String(cu.id), user_name: cu.name, user_avatar: cu.avatar || '👤', is_active: true, lat: userLocation.lat, lng: userLocation.lng, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        sharingActive = true; sharingStartTime = Date.now()
        if (navigator.geolocation) sharingWatchId = navigator.geolocation.watchPosition(async (pos) => { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker(); if (sharingActive) await supabase.from('shared_locations').update({ lat: userLocation.lat, lng: userLocation.lng, updated_at: new Date().toISOString() }).eq('user_id', String(cu.id)); if (sharingMarker) sharingMarker.setLatLng(userLocation) }, () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
        if (!sharingMarker) {
            const av = cu.avatar || '👤'; const avImg = (av.includes('/')||av.includes('.')) ? `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av
            sharingMarker = L.marker(userLocation, { icon: L.divIcon({ html: '<div style="width:20px;height:20px;background:#2ed573;border:3px solid #fff;border-radius:50%;box-shadow:0 0 15px rgba(46,213,115,0.8);animation:pulse 1.5s infinite;"></div>', className: 'sharing-marker', iconSize: [20,20] }) }).addTo(map).bindPopup(`<div style="text-align:center;"><b>${avImg} ${cu.name||'من'}</b><br><span style="color:#2ed573;">🟢 در حال اشتراک</span><br><small id="sharing-timer-display">۰:۰۰</small></div>`)
        }
        updateShareButton(); updateSharingTimer(); sharingTimer = setInterval(updateSharingTimer, 1000); sharingMarker.on('popupopen', updateSharingTimer)
        window.showToast('📍 اشتراک شروع شد', 'success')
    }

    async function stopSharing() {
        const cu = getCurrentUser(); sharingActive = false
        if (cu) await supabase.from('shared_locations').update({ is_active: false, updated_at: new Date().toISOString() }).eq('user_id', String(cu.id))
        if (sharingWatchId && navigator.geolocation) { navigator.geolocation.clearWatch(sharingWatchId); sharingWatchId = null }
        if (sharingMarker) { map.removeLayer(sharingMarker); sharingMarker = null }
        if (sharingTimer) { clearInterval(sharingTimer); sharingTimer = null }
        sharingStartTime = null; updateShareButton()
        window.showToast('اشتراک متوقف شد', 'info')
    }

    function updateSharingTimer() {
        if (!sharingStartTime || !sharingMarker) return
        const elapsed = Math.floor((Date.now() - sharingStartTime) / 1000), minutes = Math.floor(elapsed / 60), seconds = elapsed % 60
        const td = document.getElementById('sharing-timer-display'); if (td) td.textContent = `⏱ ${minutes}:${seconds.toString().padStart(2,'0')}`
        const cu = getCurrentUser(); const av = cu?.avatar || '👤'; const avImg = (av.includes('/')||av.includes('.')) ? `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av
        sharingMarker.setPopupContent(`<div style="text-align:center;"><b>${avImg} ${cu?.name||'من'}</b><br><span style="color:#2ed573;">🟢 در حال اشتراک</span><br><small>⏱ ${minutes}:${seconds.toString().padStart(2,'0')}</small><br><button onclick="window.navigateTo(${userLocation?.lat||0},${userLocation?.lng||0},'${cu?.name||'مقصد'}')" style="margin-top:6px;padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:13px;font-family:inherit;">🧭 مسیریابی</button><br><button onclick="window.stopMapSharing()" style="margin-top:6px;padding:6px 14px;background:#ff4757;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">⏹ توقف</button></div>`)
    }

    function updateShareButton() {
        if (!shareBtn) return
        if (sharingActive) { shareBtn.className = 'map-btn danger-btn'; shareBtn.innerHTML = '⏹ توقف اشتراک' }
        else { shareBtn.className = 'map-btn primary-btn'; shareBtn.innerHTML = '📍 اشتراک موقعیت' }
    }

    window.stopMapSharing = () => { stopSharing(); map?.closePopup() }

    async function checkActiveSharing() {
        const cu = getCurrentUser(); if (!cu) return
        const { data } = await supabase.from('shared_locations').select('*').eq('user_id', String(cu.id)).eq('is_active', true).single()
        if (!data) return
        sharingActive = true; sharingStartTime = new Date(data.started_at).getTime()
        if (data.lat && data.lng) { userLocation = { lat: data.lat, lng: data.lng }; updateUserMarker() }
        if (navigator.geolocation) sharingWatchId = navigator.geolocation.watchPosition(async (pos) => { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker(); if (sharingActive) await supabase.from('shared_locations').update({ lat: userLocation.lat, lng: userLocation.lng, updated_at: new Date().toISOString() }).eq('user_id', String(cu.id)); if (sharingMarker) sharingMarker.setLatLng(userLocation) }, () => {}, { enableHighAccuracy: true })
        if (!sharingMarker && userLocation) {
            const av = cu.avatar || '👤'; const avImg = (av.includes('/')||av.includes('.')) ? `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av
            sharingMarker = L.marker(userLocation, { icon: L.divIcon({ html: '<div style="width:20px;height:20px;background:#2ed573;border:3px solid #fff;border-radius:50%;box-shadow:0 0 15px rgba(46,213,115,0.8);animation:pulse 1.5s infinite;"></div>', className: 'sharing-marker', iconSize: [20,20] }) }).addTo(map).bindPopup(`<div style="text-align:center;"><b>${avImg} ${cu.name||'من'}</b><br><span style="color:#2ed573;">🟢 در حال اشتراک</span><br><small id="sharing-timer-display">۰:۰۰</small></div>`)
        }
        updateShareButton(); updateSharingTimer(); sharingTimer = setInterval(updateSharingTimer, 1000)
    }

    async function loadAllMapData() {
        if (!map) return
        const cu = getCurrentUser()
        const { data: pins } = await supabase.from('pins').select('*').order('created_at', { ascending: false })
        if (pins) pins.forEach(pin => addPinToMap(pin))
        const { data: sharings } = await supabase.from('shared_locations').select('*')
        if (sharings) sharings.filter(s => s.is_active === true).forEach(share => { if (share.user_id === String(cu?.id) || !share.lat || !share.lng) return; addFriendMarker(share) })
    }

    function addFriendMarker(share) {
        const av = share.user_avatar || '👤'; const avImg = (av.includes('/')||av.includes('.')) ? `<img src="${av}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid #2ed573;">` : av
        const elapsed = share.started_at ? Math.floor((Date.now() - new Date(share.started_at).getTime()) / 1000 / 60) : 0
        const timeText = elapsed < 60 ? `${elapsed} دقیقه` : `${Math.floor(elapsed/60)} ساعت`
        const marker = L.marker([share.lat, share.lng], { icon: L.divIcon({ html: `<div style="position:relative;width:36px;height:36px;border-radius:50%;background:rgba(46,213,115,0.3);display:flex;align-items:center;justify-content:center;animation:pulse 2s infinite;">${avImg}<div style="position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);width:10px;height:10px;background:#2ed573;border-radius:50%;border:2px solid #fff;"></div></div>`, className: 'friend-marker', iconSize: [36,46], iconAnchor: [18,46] }) }).addTo(map)
        marker.bindPopup(`<div style="text-align:center;"><b>${share.user_name||'ناشناس'}</b><br><span style="color:#2ed573;">🟢 در حال اشتراک</span><br><small>⏱ حدود ${timeText}</small><br><button onclick="window.navigateTo(${share.lat},${share.lng},'${share.user_name}')" style="margin-top:6px;padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:12px;font-family:inherit;">🧭 مسیریابی</button></div>`)
        allPins.push({ id: `share-${share.user_id}`, marker })
    }

    document.getElementById('add-pin-btn')?.addEventListener('click', async () => {
        if (!map) return
        const pinName = await window.showPrompt('📍 نام این مکان چیه؟', '')
        if (!pinName) return
        window.showToast('روی نقشه کلیک کن 🗺️', 'info', 2000)
        map.getContainer().style.cursor = 'crosshair'
        map.once('click', async (e) => {
            map.getContainer().style.cursor = ''
            const cu = getCurrentUser()
            const { data, error } = await supabase.from('pins').insert([{ name: pinName, latitude: e.latlng.lat, longitude: e.latlng.lng, user_id: cu?.id, user_name: cu?.name }]).select()
            if (error) { window.showToast('خطا', 'error'); return }
            if (data?.[0]) addPinToMap(data[0])
            window.showToast(`✅ "${pinName}" اضافه شد`, 'success')
        })
    })

    function addPinToMap(pin) {
        const cu = getCurrentUser(); const isOwner = pin.user_id === cu?.id
        const marker = L.marker([pin.latitude, pin.longitude], { icon: L.divIcon({ html: '<div style="font-size:28px;">📌</div>', className: 'pin-marker', iconSize: [28,28] }) }).addTo(map)
        let popup = `<div style="text-align:center;min-width:150px;"><b>📌 ${pin.name}</b><br><small style="color:#9d9dab;">${pin.user_name||'ناشناس'}</small><br><small style="color:#9d9dab;">${new Date(pin.created_at).toLocaleDateString('fa-IR')}</small><br><button onclick="window.navigateTo(${pin.latitude},${pin.longitude},'${pin.name.replace(/'/g,"\\'")}')" style="margin-top:8px;padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:13px;font-family:inherit;">🧭 مسیریابی</button>`
        if (isOwner) popup += `<button onclick="window.deletePin(${pin.id})" style="margin-top:6px;padding:6px 14px;background:#ff4757;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">🗑️ حذف</button>`
        popup += '</div>'; marker.bindPopup(popup); allPins.push({ id: pin.id, marker })
    }

    window.deletePin = async (pinId) => {
        if (!await window.showConfirm('حذف پین؟', 'حذف')) return
        await supabase.from('pins').delete().eq('id', pinId)
        const p = allPins.find(x => x.id === pinId); if (p?.marker) map.removeLayer(p.marker)
        allPins = allPins.filter(x => x.id !== pinId)
        window.showToast('پین حذف شد', 'success')
    }

    function addMyLocationButton() {
        if (!map) return
        map.addControl(new (L.Control.extend({
            options: { position: 'topright' },
            onAdd: function() {
                const btn = L.DomUtil.create('button', 'my-location-btn')
                btn.innerHTML = '📍'; btn.title = 'موقعیت من'
                btn.onclick = function(e) { e.preventDefault(); e.stopPropagation()
                    if (userLocation) map.setView([userLocation.lat, userLocation.lng], 16, { animate: true, duration: 1 })
                    else navigator.geolocation.getCurrentPosition(pos => { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker(); map.setView([userLocation.lat, userLocation.lng], 16, { animate: true, duration: 1 }) }, () => window.showToast?.('موقعیت در دسترس نیست', 'warning'), { enableHighAccuracy: true, timeout: 10000 })
                }
                return btn
            }
        }))()
    }

    supabase.channel('map-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pins' }, (p) => { if (!allPins.find(x => x.id === p.new.id)) addPinToMap(p.new) })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pins' }, (p) => { const x = allPins.find(y => y.id === p.old.id); if (x?.marker) map.removeLayer(x.marker); allPins = allPins.filter(y => y.id !== p.old.id) })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shared_locations' }, (p) => {
            const share = p.new; const cu = getCurrentUser()
            if (share.user_id === String(cu?.id)) return
            const old = allPins.find(x => x.id === `share-${share.user_id}`); if (old?.marker) map.removeLayer(old.marker)
            allPins = allPins.filter(x => x.id !== `share-${share.user_id}`)
            if (share.is_active && share.lat && share.lng) addFriendMarker(share)
        })
        .subscribe()

    window.getMap = () => map
    setTimeout(createMap, 500)
}