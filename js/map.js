// js/map.js - نسخه نهایی کامل با مسیریابی
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

export function initMap(user) {
    let map
    let userMarker
    let userLocation = null
    let allPins = []
    let sharingActive = false
    let sharingMarker = null
    let sharingTimer = null
    let sharingWatchId = null
    let sharingStartTime = null

  // ============ مسیریابی ============
window.navigateTo = (lat, lng, name) => {
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    window.open(googleMapsUrl, '_blank')
}

    // ============ ساخت نقشه ============
    function createMap() {
        const mapContainer = document.getElementById('map-container')
        if (!mapContainer) {
            setTimeout(createMap, 300)
            return
        }

        if (map) {
            map.invalidateSize()
            return
        }

        map = L.map('map-container', {
            zoomControl: true,
            fadeAnimation: true,
            markerZoomAnimation: true
        }).setView([35.7483, 51.8237], 14)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 18,
            tileSize: 256,
            zoomOffset: 0
        }).addTo(map)

        loadPins()
        startLocationTracking()
        updateShareButton()
        addMyLocationButton()
        checkActiveSharing()

        setTimeout(() => map.invalidateSize(), 200)

        const observer = new MutationObserver(() => {
            if (mapContainer.offsetParent !== null) map.invalidateSize()
        })
        observer.observe(mapContainer, { attributes: true, attributeFilter: ['class'] })
    }

    // ============ موقعیت‌یابی ============
    function startLocationTracking() {
        if (!('geolocation' in navigator)) {
            setDefaultLocation()
            return
        }

        navigator.geolocation.watchPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }
                updateUserMarker()
                if (sharingActive && sharingMarker) sharingMarker.setLatLng(userLocation)
            },
            () => setDefaultLocation(),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
    }

    function updateUserMarker() {
        if (!userLocation || !map) return
        if (userMarker) {
            userMarker.setLatLng(userLocation)
        } else {
            userMarker = L.marker(userLocation, {
                icon: L.divIcon({
                    html: `<div style="font-size:24px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">📍</div>`,
                    className: 'user-marker',
                    iconSize: [24, 24]
                })
            }).addTo(map).bindPopup('موقعیت من')
        }
    }

    function setDefaultLocation() {
        if (!userLocation) {
            userLocation = { lat: 35.7483, lng: 51.8237 }
            updateUserMarker()
        }
    }

    // ============ اشتراک موقعیت ============
    const shareBtn = document.getElementById('share-location-btn')
    shareBtn?.addEventListener('click', () => {
        sharingActive ? stopSharing() : startSharing()
    })

    async function startSharing() {
        if (!userLocation) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true, timeout: 10000
                    })
                })
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                updateUserMarker()
            } catch (err) {
                window.showToast('موقعیت در دسترس نیست', 'error')
                return
            }
        }

        const currentUser = getCurrentUser()
        if (!currentUser) return

        await supabase.from('active_sharings').upsert({
            user_id: String(currentUser.id),
            user_name: currentUser.name,
            user_avatar: currentUser.avatar || '👤',
            is_active: true,
            latitude: userLocation.lat,
            longitude: userLocation.lng,
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })

        sharingActive = true
        sharingStartTime = Date.now()

        if (navigator.geolocation) {
            sharingWatchId = navigator.geolocation.watchPosition(
                async (position) => {
                    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude }
                    updateUserMarker()
                    if (sharingActive) {
                        await supabase.from('active_sharings').update({
                            latitude: userLocation.lat,
                            longitude: userLocation.lng,
                            updated_at: new Date().toISOString()
                        }).eq('user_id', String(currentUser.id))
                    }
                    if (sharingMarker) sharingMarker.setLatLng(userLocation)
                },
                () => {},
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            )
        }

        if (!sharingMarker) {
            const av = currentUser.avatar || '👤'
            const avImg = (av.includes('/') || av.includes('.')) ? `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av

            sharingMarker = L.marker(userLocation, {
                icon: L.divIcon({
                    html: `<div style="width:20px;height:20px;background:#2ed573;border:3px solid #fff;border-radius:50%;box-shadow:0 0 15px rgba(46,213,115,0.8);animation:pulse 1.5s infinite;"></div>`,
                    className: 'sharing-marker',
                    iconSize: [20, 20]
                })
            }).addTo(map).bindPopup(`
                <div style="text-align:center;">
                    <b>${avImg} ${currentUser.name || 'من'}</b><br>
                    <span style="color:#2ed573;">🟢 در حال اشتراک موقعیت</span><br>
                    <small id="sharing-timer-display">۰:۰۰</small>
                </div>`)
        }

        updateShareButton()
        updateSharingTimer()
        sharingTimer = setInterval(updateSharingTimer, 1000)
        sharingMarker.on('popupopen', updateSharingTimer)
        window.showToast('📍 اشتراک موقعیت شروع شد', 'success')
    }

    async function stopSharing() {
        const currentUser = getCurrentUser()
        sharingActive = false

        if (currentUser) {
            await supabase.from('active_sharings').update({
                is_active: false,
                updated_at: new Date().toISOString()
            }).eq('user_id', String(currentUser.id))
        }

        if (sharingWatchId && navigator.geolocation) {
            navigator.geolocation.clearWatch(sharingWatchId)
            sharingWatchId = null
        }

        if (sharingMarker) { map.removeLayer(sharingMarker); sharingMarker = null }
        if (sharingTimer) { clearInterval(sharingTimer); sharingTimer = null }
        sharingStartTime = null
        updateShareButton()
        window.showToast('اشتراک موقعیت متوقف شد', 'info')
    }

    function updateSharingTimer() {
        if (!sharingStartTime || !sharingMarker) return
        const elapsed = Math.floor((Date.now() - sharingStartTime) / 1000)
        const minutes = Math.floor(elapsed / 60)
        const seconds = elapsed % 60
        const timerDisplay = document.getElementById('sharing-timer-display')
        if (timerDisplay) timerDisplay.textContent = `⏱ ${minutes}:${seconds.toString().padStart(2, '0')}`

        const currentUser = getCurrentUser()
        const av = currentUser?.avatar || '👤'
        const avImg = (av.includes('/') || av.includes('.')) ? `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av
        const lat = userLocation?.lat || 0
        const lng = userLocation?.lng || 0

        sharingMarker.setPopupContent(`
            <div style="text-align:center;">
                <b>${avImg} ${currentUser?.name || 'من'}</b><br>
                <span style="color:#2ed573;">🟢 در حال اشتراک موقعیت</span><br>
                <small>⏱ ${minutes}:${seconds.toString().padStart(2, '0')}</small><br>
                <button onclick="window.navigateTo(${lat}, ${lng}, '${currentUser?.name || 'مقصد'}')" style="margin-top:6px;padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:13px;font-family:inherit;">🧭 مسیریابی</button><br>
                <button onclick="window.stopMapSharing()" style="margin-top:6px;padding:6px 14px;background:#ff4757;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">⏹ توقف اشتراک</button>
            </div>`)
    }

    function updateShareButton() {
        if (!shareBtn) return
        if (sharingActive) {
            shareBtn.className = 'map-btn danger-btn'
            shareBtn.innerHTML = '⏹ توقف اشتراک'
        } else {
            shareBtn.className = 'map-btn primary-btn'
            shareBtn.innerHTML = '📍 اشتراک موقعیت'
        }
    }

    window.stopMapSharing = () => { stopSharing(); map?.closePopup() }

    // ============ چک کردن اشتراک فعال قبلی ============
    async function checkActiveSharing() {
        const currentUser = getCurrentUser()
        if (!currentUser) return

        const { data } = await supabase.from('active_sharings')
            .select('*')
            .eq('user_id', String(currentUser.id))
            .eq('is_active', true)
            .single()

        if (data) {
            sharingActive = true
            sharingStartTime = new Date(data.started_at).getTime()

            if (data.latitude && data.longitude) {
                userLocation = { lat: data.latitude, lng: data.longitude }
                updateUserMarker()
            }

            if (navigator.geolocation) {
                sharingWatchId = navigator.geolocation.watchPosition(
                    async (position) => {
                        userLocation = { lat: position.coords.latitude, lng: position.coords.longitude }
                        updateUserMarker()
                        if (sharingActive) {
                            await supabase.from('active_sharings').update({
                                latitude: userLocation.lat,
                                longitude: userLocation.lng,
                                updated_at: new Date().toISOString()
                            }).eq('user_id', String(currentUser.id))
                        }
                        if (sharingMarker) sharingMarker.setLatLng(userLocation)
                    },
                    () => {},
                    { enableHighAccuracy: true }
                )
            }

            if (!sharingMarker && userLocation) {
                const av = currentUser.avatar || '👤'
                const avImg = (av.includes('/') || av.includes('.')) ? `<img src="${av}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px;">` : av

                sharingMarker = L.marker(userLocation, {
                    icon: L.divIcon({
                        html: `<div style="width:20px;height:20px;background:#2ed573;border:3px solid #fff;border-radius:50%;box-shadow:0 0 15px rgba(46,213,115,0.8);animation:pulse 1.5s infinite;"></div>`,
                        className: 'sharing-marker',
                        iconSize: [20, 20]
                    })
                }).addTo(map).bindPopup(`
                    <div style="text-align:center;">
                        <b>${avImg} ${currentUser.name || 'من'}</b><br>
                        <span style="color:#2ed573;">🟢 در حال اشتراک موقعیت</span><br>
                        <small id="sharing-timer-display">۰:۰۰</small>
                    </div>`)
            }

            updateShareButton()
            updateSharingTimer()
            sharingTimer = setInterval(updateSharingTimer, 1000)
            window.showToast('📍 اشتراک موقعیت از قبل فعال بود', 'info')
        }
    }

    // ============ پین‌ها ============
    document.getElementById('add-pin-btn')?.addEventListener('click', async () => {
        if (!map) return
        const pinName = await window.showPrompt('📍 نام این مکان چیه؟', '')
        if (!pinName) return
        window.showToast('حالا روی نقشه کلیک کن 🗺️', 'info', 2000)
        map.getContainer().style.cursor = 'crosshair'
        map.once('click', async (e) => {
            map.getContainer().style.cursor = ''
            const { lat, lng } = e.latlng
            const currentUser = getCurrentUser()
            const { data, error } = await supabase.from('pins').insert([{
                name: pinName, latitude: lat, longitude: lng,
                user_id: currentUser?.id, user_name: currentUser?.name
            }]).select()
            if (error) { window.showToast('خطا در ذخیره پین', 'error'); return }
            if (data && data[0]) addPinToMap(data[0])
            window.showToast(`پین "${pinName}" اضافه شد ✅`, 'success')
        })
    })

    function addPinToMap(pin) {
        const currentUser = getCurrentUser()
        const isOwner = pin.user_id === currentUser?.id
        const marker = L.marker([pin.latitude, pin.longitude], {
            icon: L.divIcon({
                html: `<div style="font-size:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">📌</div>`,
                className: 'pin-marker', iconSize: [28, 28]
            })
        }).addTo(map)

        let popupContent = `<div style="text-align:center;min-width:150px;">
            <b>📌 ${pin.name}</b><br>
            <small style="color:#9d9dab;">توسط ${pin.user_name || 'ناشناس'}</small><br>
            <small style="color:#9d9dab;">${new Date(pin.created_at).toLocaleDateString('fa-IR')}</small>
            <br>
            <button onclick="window.navigateTo(${pin.latitude}, ${pin.longitude}, '${pin.name.replace(/'/g, "\\'")}')" style="margin-top:8px;padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:13px;font-family:inherit;">
                🧭 مسیریابی
            </button>`

        if (isOwner) {
            popupContent += `<button onclick="window.deletePin(${pin.id})" style="margin-top:6px;padding:6px 14px;background:#ff4757;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">🗑️ حذف پین</button>`
        }
        popupContent += `</div>`

        marker.bindPopup(popupContent)
        allPins.push({ id: pin.id, marker })
    }

    window.deletePin = async (pinId) => {
        const confirmed = await window.showConfirm('مطمئنی می‌خوای این پین رو حذف کنی؟', 'حذف پین')
        if (!confirmed) return
        const { error } = await supabase.from('pins').delete().eq('id', pinId)
        if (error) { window.showToast('خطا در حذف پین', 'error'); return }
        const pinData = allPins.find(p => p.id === pinId)
        if (pinData?.marker) map.removeLayer(pinData.marker)
        allPins = allPins.filter(p => p.id !== pinId)
        window.showToast('پین حذف شد', 'success')
    }

    async function loadPins() {
        if (!map) return
        const { data } = await supabase.from('pins').select('*').order('created_at', { ascending: false })
        if (data) data.forEach(pin => addPinToMap(pin))
    }

    // ============ دکمه لوکیشن من ============
    function addMyLocationButton() {
        if (!map) return
        const MyLocationControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function () {
                const button = L.DomUtil.create('button', 'my-location-btn')
                button.innerHTML = '📍'
                button.title = 'برو به موقعیت من'
                button.onclick = function (e) {
                    e.preventDefault(); e.stopPropagation()
                    if (userLocation) {
                        map.setView([userLocation.lat, userLocation.lng], 16, { animate: true, duration: 1 })
                    } else {
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                userLocation = { lat: position.coords.latitude, lng: position.coords.longitude }
                                updateUserMarker()
                                map.setView([userLocation.lat, userLocation.lng], 16, { animate: true, duration: 1 })
                            },
                            () => window.showToast?.('موقعیت در دسترس نیست', 'warning'),
                            { enableHighAccuracy: true, timeout: 10000 }
                        )
                    }
                }
                return button
            }
        })
        map.addControl(new MyLocationControl())
    }

    // ============ Real-time ============
    supabase.channel('pins')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pins' }, (payload) => {
            if (!allPins.find(p => p.id === payload.new.id)) addPinToMap(payload.new)
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pins' }, (payload) => {
            const pinData = allPins.find(p => p.id === payload.old.id)
            if (pinData?.marker) map.removeLayer(pinData.marker)
            allPins = allPins.filter(p => p.id !== payload.old.id)
        })
        .subscribe()

    window.getMap = () => map
    setTimeout(createMap, 500)
}