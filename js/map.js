// js/map.js - نسخه نهایی کامل
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

export function initMap(user) {
    var map, userMarker, userLocation = null, allPins = [], sharingActive = false, sharingMarker = null, sharingTimer = null, sharingWatchId = null, sharingStartTime = null

    window.navigateTo = function(lat, lng, name) {
        window.open('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng, '_blank')
    }

    function createMap() {
        var mc = document.getElementById('map-container')
        if (!mc) { setTimeout(createMap, 300); return }
        if (map) { map.invalidateSize(); return }
        map = L.map('map-container', { zoomControl: true, fadeAnimation: true }).setView([35.7483, 51.8237], 14)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
        loadAllMapData(); startLocationTracking(); updateShareButton(); addMyLocationButton(); checkActiveSharing()
        setTimeout(function() { map.invalidateSize() }, 200)
    }

    function startLocationTracking() {
        if (!('geolocation' in navigator)) { setDefaultLocation(); return }
        navigator.geolocation.watchPosition(
            function(pos) { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker(); if (sharingActive && sharingMarker) sharingMarker.setLatLng(userLocation) },
            function() { setDefaultLocation() },
            { enableHighAccuracy: true }
        )
    }

    function updateUserMarker() {
        if (!userLocation || !map) return
        if (userMarker) userMarker.setLatLng(userLocation)
        else userMarker = L.marker(userLocation, { icon: L.divIcon({ html: '<div style="font-size:24px;">📍</div>', className: 'user-marker', iconSize: [24,24] }) }).addTo(map).bindPopup('موقعیت من')
    }

    function setDefaultLocation() { if (!userLocation) { userLocation = { lat: 35.7483, lng: 51.8237 }; updateUserMarker() } }

    var shareBtn = document.getElementById('share-location-btn')
    if (shareBtn) shareBtn.addEventListener('click', function() { sharingActive ? stopSharing() : startSharing() })

    async function startSharing() {
        if (!userLocation) {
            try { var pos = await new Promise(function(r, rej) { navigator.geolocation.getCurrentPosition(r, rej, { enableHighAccuracy: true, timeout: 10000 }) }); userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker() }
            catch (err) { window.showToast('موقعیت در دسترس نیست', 'error'); return }
        }
        var cu = getCurrentUser(); if (!cu) return
        await supabase.from('location_shares').upsert({ user_id: String(cu.id), user_name: cu.name, user_avatar: cu.avatar || '👤', active: true, lat: userLocation.lat, lng: userLocation.lng, created_at: new Date().toISOString() })
        sharingActive = true; sharingStartTime = Date.now()
        if (navigator.geolocation) sharingWatchId = navigator.geolocation.watchPosition(async function(pos) { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker(); if (sharingActive) await supabase.from('location_shares').update({ lat: userLocation.lat, lng: userLocation.lng }).eq('user_id', String(cu.id)); if (sharingMarker) sharingMarker.setLatLng(userLocation) }, function() {}, { enableHighAccuracy: true })
        if (!sharingMarker) {
            var av = cu.avatar || '👤', avImg = (av.indexOf('/')>=0||av.indexOf('.')>=0) ? '<img src="'+av+'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">' : av
            sharingMarker = L.marker(userLocation, { icon: L.divIcon({ html: '<div style="width:20px;height:20px;background:#2ed573;border:3px solid #fff;border-radius:50%;"></div>', className: 'sharing-marker', iconSize: [20,20] }) }).addTo(map).bindPopup('<div style="text-align:center;"><b>'+avImg+' '+(cu.name||'من')+'</b><br><span style="color:#2ed573;">🟢 اشتراک</span><br><small id="sharing-timer-display">۰:۰۰</small></div>')
        }
        updateShareButton(); sharingTimer = setInterval(updateSharingTimer, 1000)
        window.showToast('📍 اشتراک شروع شد', 'success')
    }

    async function stopSharing() {
        var cu = getCurrentUser(); sharingActive = false
        if (cu) { await supabase.from('location_shares').update({ active: false }).eq('user_id', String(cu.id)) }
        if (sharingWatchId) { navigator.geolocation.clearWatch(sharingWatchId); sharingWatchId = null }
        if (sharingMarker) { map.removeLayer(sharingMarker); sharingMarker = null }
        if (sharingTimer) { clearInterval(sharingTimer); sharingTimer = null }
        sharingStartTime = null; updateShareButton()
        var old = allPins.find(function(x) { return x.id === 'share-' + String(cu ? cu.id : '') }); if (old && old.marker) map.removeLayer(old.marker)
        allPins = allPins.filter(function(x) { return x.id !== 'share-' + String(cu ? cu.id : '') })
        window.showToast('اشتراک متوقف شد', 'info')
    }

    function updateSharingTimer() {
        if (!sharingStartTime || !sharingMarker) return
        var e = Math.floor((Date.now()-sharingStartTime)/1000), m = Math.floor(e/60), s = e%60
        var td = document.getElementById('sharing-timer-display'); if (td) td.textContent = '⏱ '+m+':'+(s<10?'0':'')+s
    }

    function updateShareButton() {
        if (!shareBtn) return
        if (sharingActive) { shareBtn.className = 'map-btn danger-btn'; shareBtn.innerHTML = '⏹ توقف اشتراک' }
        else { shareBtn.className = 'map-btn primary-btn'; shareBtn.innerHTML = '📍 اشتراک موقعیت' }
    }

    window.stopMapSharing = function() { stopSharing(); if (map) map.closePopup() }

    async function checkActiveSharing() {
        var cu = getCurrentUser(); if (!cu) return
        var result = await supabase.from('location_shares').select('*').eq('user_id', String(cu.id))
        if (!result.data || result.data.length === 0) return
        var share = result.data[result.data.length-1]
        if (!share.active) return
        sharingActive = true; sharingStartTime = new Date(share.created_at).getTime()
        if (share.lat && share.lng) { userLocation = { lat: share.lat, lng: share.lng }; updateUserMarker() }
        if (!sharingMarker && userLocation) {
            var av = cu.avatar || '👤', avImg = (av.indexOf('/')>=0||av.indexOf('.')>=0) ? '<img src="'+av+'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">' : av
            sharingMarker = L.marker(userLocation, { icon: L.divIcon({ html: '<div style="width:20px;height:20px;background:#2ed573;border:3px solid #fff;border-radius:50%;"></div>', className: 'sharing-marker', iconSize: [20,20] }) }).addTo(map).bindPopup('<div style="text-align:center;"><b>'+avImg+' '+(cu.name||'من')+'</b><br><span style="color:#2ed573;">🟢 اشتراک</span><br><small id="sharing-timer-display">۰:۰۰</small></div>')
        }
        updateShareButton(); sharingTimer = setInterval(updateSharingTimer, 1000)
    }

    async function loadAllMapData() {
        if (!map) return
        var cu = getCurrentUser()
        var pinsResult = await supabase.from('pins').select('*').order('created_at', { ascending: false })
        if (pinsResult.data) pinsResult.data.forEach(function(pin) { addPinToMap(pin) })
        var sharesResult = await supabase.from('location_shares').select('*')
        if (sharesResult.data) {
            sharesResult.data.filter(function(s) { return s.active === true }).forEach(function(share) {
                if (share.user_id === String(cu ? cu.id : '') || !share.lat || !share.lng) return
                addFriendMarker(share)
            })
        }
    }

    function addFriendMarker(share) {
        if (!map) return
        var old = allPins.find(function(x) { return x.id === 'share-'+share.user_id }); if (old && old.marker) map.removeLayer(old.marker)
        allPins = allPins.filter(function(x) { return x.id !== 'share-'+share.user_id })
        var av = share.user_avatar || '👤', avImg = (av.indexOf('/')>=0||av.indexOf('.')>=0) ? '<img src="'+av+'" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid #2ed573;">' : av
        var marker = L.marker([share.lat, share.lng], { icon: L.divIcon({ html: '<div style="width:36px;height:36px;border-radius:50%;background:rgba(46,213,115,0.3);display:flex;align-items:center;justify-content:center;">'+avImg+'<div style="position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);width:10px;height:10px;background:#2ed573;border-radius:50%;border:2px solid #fff;"></div></div>', className: 'friend-marker', iconSize: [36,46], iconAnchor: [18,46] }) }).addTo(map)
        marker.bindPopup('<div style="text-align:center;"><b>'+(share.user_name||'ناشناس')+'</b><br><span style="color:#2ed573;">🟢 اشتراک</span><br><button onclick="window.navigateTo('+share.lat+','+share.lng+',\''+(share.user_name||'')+'\')" style="margin-top:6px;padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:12px;">🧭 مسیریابی</button></div>')
        allPins.push({ id: 'share-'+share.user_id, marker: marker })
    }

    document.getElementById('add-pin-btn')?.addEventListener('click', async function() {
        if (!map) return
        var pinName = await window.showPrompt('📍 نام مکان؟', '')
        if (!pinName) return
        window.showToast('روی نقشه کلیک کن 🗺️', 'info', 2000)
        map.getContainer().style.cursor = 'crosshair'
        map.once('click', async function(e) {
            map.getContainer().style.cursor = ''
            var cu = getCurrentUser()
            var result = await supabase.from('pins').insert([{ name: pinName, latitude: e.latlng.lat, longitude: e.latlng.lng, user_id: cu?cu.id:'', user_name: cu?cu.name:'' }]).select()
            if (result.error) { window.showToast('خطا', 'error'); return }
            if (result.data && result.data[0]) addPinToMap(result.data[0])
            window.showToast('✅ اضافه شد', 'success')
        })
    })

    function addPinToMap(pin) {
        var cu = getCurrentUser(), isOwner = pin.user_id === (cu?cu.id:'')
        var marker = L.marker([pin.latitude, pin.longitude], { icon: L.divIcon({ html: '<div style="font-size:28px;">📌</div>', className: 'pin-marker', iconSize: [28,28] }) }).addTo(map)
        var popup = '<div style="text-align:center;"><b>📌 '+pin.name+'</b><br><small>'+(pin.user_name||'ناشناس')+'</small><br><button onclick="window.navigateTo('+pin.latitude+','+pin.longitude+',\''+(pin.name||'')+'\')" style="margin-top:6px;padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:12px;">🧭 مسیریابی</button>'
        if (isOwner) popup += '<br><button onclick="window.deletePin('+pin.id+')" style="margin-top:6px;padding:6px 14px;background:#ff4757;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;">🗑️ حذف</button>'
        popup += '</div>'; marker.bindPopup(popup); allPins.push({ id: pin.id, marker: marker })
    }

    window.deletePin = async function(pinId) {
        if (!await window.showConfirm('حذف پین؟', 'حذف')) return
        await supabase.from('pins').delete().eq('id', pinId)
        var p = allPins.find(function(x) { return x.id === pinId }); if (p && p.marker) map.removeLayer(p.marker)
        allPins = allPins.filter(function(x) { return x.id !== pinId })
        window.showToast('پین حذف شد', 'success')
    }

    function addMyLocationButton() {
        if (!map) return
        map.addControl(new (L.Control.extend({ options: { position: 'topright' }, onAdd: function() { var b = L.DomUtil.create('button', 'my-location-btn'); b.innerHTML = '📍'; b.onclick = function(e) { e.preventDefault(); if (userLocation) map.setView([userLocation.lat, userLocation.lng], 16) }; return b } }))())
    }

    supabase.channel('location-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_shares' }, function(p) {
            var share = p.new; var cu = getCurrentUser()
            if (share.user_id === String(cu ? cu.id : '')) return
            if (!share.lat || !share.lng) return
            setTimeout(function() { addFriendMarker(share) }, 100)
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'location_shares' }, function(p) {
            var share = p.new; var cu = getCurrentUser()
            if (share.user_id === String(cu ? cu.id : '')) return
            var old = allPins.find(function(x) { return x.id === 'share-'+share.user_id }); if (old && old.marker) map.removeLayer(old.marker)
            allPins = allPins.filter(function(x) { return x.id !== 'share-'+share.user_id })
            if (share.active && share.lat && share.lng) setTimeout(function() { addFriendMarker(share) }, 100)
        })
        .subscribe()

    window.getMap = function() { return map }
    setTimeout(createMap, 500)
}