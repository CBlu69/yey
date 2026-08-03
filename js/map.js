// js/map.js - کامل و تست شده با location_shares
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

export function initMap(user) {
    let map, userMarker, userLocation = null, allPins = [], sharingActive = false, sharingMarker = null, sharingTimer = null, sharingWatchId = null, sharingStartTime = null

    window.navigateTo = function(lat, lng, name) {
        window.open('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng, '_blank')
    }

    function createMap() {
        var mc = document.getElementById('map-container')
        if (!mc) { setTimeout(createMap, 300); return }
        if (map) { map.invalidateSize(); return }
        map = L.map('map-container', { zoomControl: true, fadeAnimation: true, markerZoomAnimation: true }).setView([35.7483, 51.8237], 14)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM', maxZoom: 18 }).addTo(map)
        loadAllMapData(); startLocationTracking(); updateShareButton(); addMyLocationButton(); checkActiveSharing()
        setTimeout(function() { map.invalidateSize() }, 200)
    }

    function startLocationTracking() {
        if (!('geolocation' in navigator)) { setDefaultLocation(); return }
        navigator.geolocation.watchPosition(
            function(pos) {
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                updateUserMarker()
                if (sharingActive && sharingMarker) sharingMarker.setLatLng(userLocation)
            },
            function() { setDefaultLocation() },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
    }

    function updateUserMarker() {
        if (!userLocation || !map) return
        if (userMarker) { userMarker.setLatLng(userLocation) }
        else {
            userMarker = L.marker(userLocation, {
                icon: L.divIcon({ html: '<div style="font-size:24px;">📍</div>', className: 'user-marker', iconSize: [24,24] })
            }).addTo(map).bindPopup('موقعیت من')
        }
    }

    function setDefaultLocation() {
        if (!userLocation) { userLocation = { lat: 35.7483, lng: 51.8237 }; updateUserMarker() }
    }

    var shareBtn = document.getElementById('share-location-btn')
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            if (sharingActive) stopSharing(); else startSharing()
        })
    }

    async function startSharing() {
        if (!userLocation) {
            try {
                var pos = await new Promise(function(r, rej) {
                    navigator.geolocation.getCurrentPosition(r, rej, { enableHighAccuracy: true, timeout: 10000 })
                })
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                updateUserMarker()
            } catch (err) {
                window.showToast('موقعیت در دسترس نیست', 'error')
                return
            }
        }
        var cu = getCurrentUser()
        if (!cu) return

        await supabase.from('location_shares').upsert({
            user_id: String(cu.id),
            user_name: cu.name,
            user_avatar: cu.avatar || '👤',
            active: true,
            lat: userLocation.lat,
            lng: userLocation.lng,
            created_at: new Date().toISOString()
        })

        sharingActive = true
        sharingStartTime = Date.now()

        if (navigator.geolocation) {
            sharingWatchId = navigator.geolocation.watchPosition(
                async function(pos) {
                    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                    updateUserMarker()
                    if (sharingActive) {
                        await supabase.from('location_shares').update({
                            lat: userLocation.lat, lng: userLocation.lng
                        }).eq('user_id', String(cu.id))
                    }
                    if (sharingMarker) sharingMarker.setLatLng(userLocation)
                },
                function() {},
                { enableHighAccuracy: true }
            )
        }

        if (!sharingMarker) {
            var av = cu.avatar || '👤'
            var avImg = av
            if (av.indexOf('/') >= 0 || av.indexOf('.') >= 0) {
                avImg = '<img src="' + av + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">'
            }
            sharingMarker = L.marker(userLocation, {
                icon: L.divIcon({ html: '<div style="width:20px;height:20px;background:#2ed573;border:3px solid #fff;border-radius:50%;box-shadow:0 0 15px rgba(46,213,115,0.8);"></div>', className: 'sharing-marker', iconSize: [20,20] })
            }).addTo(map).bindPopup('<div style="text-align:center;"><b>' + avImg + ' ' + (cu.name||'من') + '</b><br><span style="color:#2ed573;">🟢 در حال اشتراک</span><br><small id="sharing-timer-display">۰:۰۰</small></div>')
        }

        updateShareButton(); updateSharingTimer()
        sharingTimer = setInterval(updateSharingTimer, 1000)
        window.showToast('📍 اشتراک شروع شد', 'success')
    }

    async function stopSharing() {
        var cu = getCurrentUser(); sharingActive = false
        if (cu) {
            await supabase.from('location_shares').update({ active: false }).eq('user_id', String(cu.id))
        }
        if (sharingWatchId) { navigator.geolocation.clearWatch(sharingWatchId); sharingWatchId = null }
        if (sharingMarker) { map.removeLayer(sharingMarker); sharingMarker = null }
        if (sharingTimer) { clearInterval(sharingTimer); sharingTimer = null }
        sharingStartTime = null; updateShareButton()
        window.showToast('اشتراک متوقف شد', 'info')
    }

    function updateSharingTimer() {
        if (!sharingStartTime || !sharingMarker) return
        var elapsed = Math.floor((Date.now() - sharingStartTime) / 1000)
        var minutes = Math.floor(elapsed / 60)
        var seconds = elapsed % 60
        var td = document.getElementById('sharing-timer-display')
        if (td) td.textContent = '⏱ ' + minutes + ':' + (seconds < 10 ? '0' : '') + seconds
    }

    function updateShareButton() {
        if (!shareBtn) return
        if (sharingActive) { shareBtn.className = 'map-btn danger-btn'; shareBtn.innerHTML = '⏹ توقف اشتراک' }
        else { shareBtn.className = 'map-btn primary-btn'; shareBtn.innerHTML = '📍 اشتراک موقعیت' }
    }

    window.stopMapSharing = function() { stopSharing(); if (map) map.closePopup() }

    async function checkActiveSharing() {
        var cu = getCurrentUser(); if (!cu) return
        var result = await supabase.from('location_shares').select('*').eq('user_id', String(cu.id)).eq('active', true).single()
        if (!result.data) return
        sharingActive = true; sharingStartTime = new Date(result.data.created_at).getTime()
        if (result.data.lat && result.data.lng) { userLocation = { lat: result.data.lat, lng: result.data.lng }; updateUserMarker() }
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
        var av = share.user_avatar || '👤'
        var avImg = av
        if (av.indexOf('/') >= 0 || av.indexOf('.') >= 0) {
            avImg = '<img src="' + av + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid #2ed573;">'
        }
        var marker = L.marker([share.lat, share.lng], {
            icon: L.divIcon({
                html: '<div style="position:relative;width:36px;height:36px;border-radius:50%;background:rgba(46,213,115,0.3);display:flex;align-items:center;justify-content:center;">' + avImg + '<div style="position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);width:10px;height:10px;background:#2ed573;border-radius:50%;border:2px solid #fff;"></div></div>',
                className: 'friend-marker', iconSize: [36,46], iconAnchor: [18,46]
            })
        }).addTo(map)
        marker.bindPopup('<div style="text-align:center;"><b>' + (share.user_name||'ناشناس') + '</b><br><span style="color:#2ed573;">🟢 در حال اشتراک</span></div>')
        allPins.push({ id: 'share-' + share.user_id, marker: marker })
    }

    var addPinBtn = document.getElementById('add-pin-btn')
    if (addPinBtn) {
        addPinBtn.addEventListener('click', async function() {
            if (!map) return
            var pinName = await window.showPrompt('📍 نام این مکان چیه؟', '')
            if (!pinName) return
            window.showToast('روی نقشه کلیک کن 🗺️', 'info', 2000)
            map.getContainer().style.cursor = 'crosshair'
            map.once('click', async function(e) {
                map.getContainer().style.cursor = ''
                var cu = getCurrentUser()
                var result = await supabase.from('pins').insert([{
                    name: pinName, latitude: e.latlng.lat, longitude: e.latlng.lng,
                    user_id: cu ? cu.id : '', user_name: cu ? cu.name : ''
                }]).select()
                if (result.error) { window.showToast('خطا', 'error'); return }
                if (result.data && result.data[0]) addPinToMap(result.data[0])
                window.showToast('✅ "' + pinName + '" اضافه شد', 'success')
            })
        })
    }

    function addPinToMap(pin) {
        var cu = getCurrentUser()
        var isOwner = pin.user_id === (cu ? cu.id : '')
        var marker = L.marker([pin.latitude, pin.longitude], {
            icon: L.divIcon({ html: '<div style="font-size:28px;">📌</div>', className: 'pin-marker', iconSize: [28,28] })
        }).addTo(map)
        var popup = '<div style="text-align:center;min-width:150px;"><b>📌 ' + pin.name + '</b><br><small>' + (pin.user_name||'ناشناس') + '</small>'
        if (isOwner) {
            popup += '<br><button onclick="window.deletePin(' + pin.id + ')" style="margin-top:6px;padding:6px 14px;background:#ff4757;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;">🗑️ حذف</button>'
        }
        popup += '</div>'
        marker.bindPopup(popup)
        allPins.push({ id: pin.id, marker: marker })
    }

    window.deletePin = async function(pinId) {
        if (!await window.showConfirm('حذف پین؟', 'حذف')) return
        await supabase.from('pins').delete().eq('id', pinId)
        var p = allPins.find(function(x) { return x.id === pinId })
        if (p && p.marker) map.removeLayer(p.marker)
        allPins = allPins.filter(function(x) { return x.id !== pinId })
        window.showToast('پین حذف شد', 'success')
    }

    function addMyLocationButton() {
        if (!map) return
        var MyLocationControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function() {
                var btn = L.DomUtil.create('button', 'my-location-btn')
                btn.innerHTML = '📍'
                btn.onclick = function(e) { e.preventDefault(); if (userLocation) map.setView([userLocation.lat, userLocation.lng], 16) }
                return btn
            }
        })
        map.addControl(new MyLocationControl())
    }

    window.getMap = function() { return map }
    setTimeout(createMap, 500)
}
